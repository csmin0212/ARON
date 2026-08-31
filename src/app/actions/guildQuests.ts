"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { parseLifeState, type LifeState } from "@/lib/lifeSkillPerks";
import type { LifeSkillKind } from "@/lib/lifeSkillData";
import {
  appendSheetFame,
  appendSheetItem,
  pushInventoryToSheet,
  inventoryWeightTotal,
  inventoryWeightOverflowMessage,
  type SheetInventory,
} from "@/lib/googleSheets";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import {
  acceptedOffer,
  drawSkillbookNumber,
  isUniqueSkillbook,
  rerollCap,
  generateOffers,
  skillbookNumber,
  EXCHANGE_REFUND,
  FRAG_COST,
  WEEK_GOAL,
  type FragKind,
} from "@/lib/guildQuests";
import { fetchRecipePool, fetchSkillbookPool, loadGuildQuestState } from "@/lib/guildQuestsServer";
import { consumeSkillBookToken, grantSkillBookToken } from "@/lib/skillbook";
import { normalizeAdventurerRank, totalFameForRank } from "@/lib/adventurerRank";

export type GuildQuestActionState = { error?: string; ok?: string } | undefined;
export type DrawResult =
  | { ok: true; bookId: string; skillName: string; job: string | null; unique: boolean }
  | { error: string };

const LIFE_KINDS = new Set<string>(["낚시", "채집", "채광"]);

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

// 요리 납품 매칭 — 등급 접두("고품질 ", "명품 ", "○○의 ")가 붙어도 인정
function matchesFood(name: string, target: string): boolean {
  const n = name.trim();
  const t = target.trim();
  return n === t || n.endsWith(` ${t}`);
}

function foodQty(inv: SheetInventory, target: string): number {
  return inv.items
    .filter((item) => matchesFood(item.name, target))
    .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
}

// 등급 없는 것부터 소모(좋은 요리는 남겨둔다). 소모된 이름별 수량을 반환.
function consumeFood(inv: SheetInventory, target: string, qty: number): Map<string, number> {
  const used = new Map<string, number>();
  let remaining = qty;
  const entries = inv.items
    .filter((item) => matchesFood(item.name, target) && item.qty > 0)
    .sort((a, b) => a.name.length - b.name.length); // 원본 이름(짧은 것) 우선
  for (const item of entries) {
    if (remaining <= 0) break;
    const take = Math.min(item.qty, remaining);
    item.qty -= take;
    remaining -= take;
    used.set(item.name, (used.get(item.name) ?? 0) + take);
  }
  inv.items = inv.items.filter((item) => item.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return used;
}

function lifeBagQty(life: LifeState, kind: LifeSkillKind, target: string): number {
  return life.bags[kind].items
    .filter((item) => item.name.trim() === target.trim())
    .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
}

function consumeLifeBag(life: LifeState, kind: LifeSkillKind, target: string, qty: number): boolean {
  let remaining = qty;
  for (const item of life.bags[kind].items) {
    if (item.name.trim() !== target.trim() || remaining <= 0) continue;
    const take = Math.min(item.qty, remaining);
    item.qty -= take;
    remaining -= take;
  }
  life.bags[kind].items = life.bags[kind].items.filter((item) => item.qty > 0);
  return remaining <= 0;
}

async function decrementDbInventoryByName(userId: string, itemName: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
  if (!item) return;
  const entry = await prisma.inventoryEntry.findFirst({ where: { userId, itemId: item.id, meta: null } });
  if (!entry) return;
  const next = Math.max(0, entry.qty - qty);
  if (next === 0) await prisma.inventoryEntry.delete({ where: { id: entry.id } });
  else await prisma.inventoryEntry.update({ where: { id: entry.id }, data: { qty: next } });
}

// ── 창고(StorageBox) 재고 — 가방 중량과 무관하게 납품 재료로 인정 ──
type StorageMatch = { id: string; name: string; qty: number };

async function loadStorageMatches(
  userId: string,
  matcher: (name: string) => boolean,
): Promise<StorageMatch[]> {
  const box = await prisma.storageBox.findUnique({
    where: { userId },
    include: { entries: true },
  });
  if (!box) return [];
  return box.entries
    .filter((entry) => entry.qty > 0 && matcher(entry.name))
    .map((entry) => ({ id: entry.id, name: entry.name.trim(), qty: entry.qty }));
}

function storageMatchTotal(rows: StorageMatch[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.qty), 0);
}

// 창고에서 qty 만큼 소모 — 등급 없는 원본(짧은 이름) 우선. 실제 소모한 개수를 반환.
async function consumeStorage(rows: StorageMatch[], qty: number): Promise<number> {
  let remaining = qty;
  const sorted = [...rows].sort((a, b) => a.name.length - b.name.length);
  for (const row of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(row.qty, remaining);
    remaining -= take;
    const next = row.qty - take;
    if (next <= 0) await prisma.storageEntry.delete({ where: { id: row.id } });
    else await prisma.storageEntry.update({ where: { id: row.id }, data: { qty: next } });
  }
  return qty - remaining;
}

// ── 의뢰 수락 ──
export async function acceptGuildQuest(offerId: string): Promise<GuildQuestActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { guildQuestJson: true, adventurerRank: true, achStatsJson: true },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };

  const { state } = await loadGuildQuestState(user.id, sheet);
  if (state.acceptedId) return { error: "오늘은 이미 의뢰를 수락했어요. (하루 1건)" };
  const offer = state.offers.find((entry) => entry.id === offerId);
  if (!offer) return { error: "의뢰를 찾지 못했어요. 게시판을 새로고침해주세요." };

  state.acceptedId = offer.id;
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      guildQuestJson: JSON.stringify(state),
      achStatsJson: bumpStat(sheet.achStatsJson, "의뢰수락횟수"),
    },
  });
  void checkAndGrant(user.id);
  revalidatePath("/world");
  return { ok: `[${offer.itemName} x${offer.qty}] 의뢰를 수락했어요. 오늘 안에 납품해주세요!` };
}

// ── 리롤 ──
export async function rerollGuildQuests(): Promise<GuildQuestActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { guildQuestJson: true, adventurerRank: true },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };

  const { state, rank } = await loadGuildQuestState(user.id, sheet);
  if (state.acceptedId) return { error: "이미 의뢰를 수락해서 오늘은 리롤할 수 없어요." };
  if (state.rerolls <= 0) return { error: "리롤권이 없어요. 매일 1개씩 지급돼요." };

  state.rerolls -= 1;
  state.offers = generateOffers(rank, state.day, await fetchRecipePool());
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { guildQuestJson: JSON.stringify(state) },
  });
  revalidatePath("/world");
  return { ok: `의뢰 목록을 갱신했어요. (남은 리롤권 ${state.rerolls}개)` };
}

// ── 납품 ──
export async function deliverGuildQuest(): Promise<GuildQuestActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };

  const { state } = await loadGuildQuestState(user.id, sheet);
  const offer = acceptedOffer(state);
  if (!offer) return { error: "수락한 의뢰가 없어요." };
  if (state.deliveredAt) return { error: "오늘 의뢰는 이미 납품을 마쳤어요." };

  const life = parseLifeState(sheet.lifeJson);
  const inv = parseInv(sheet.invJson);
  let sheetPushNeeded = false;

  // 재고 = 가방/시트 인벤 + 창고. 가방이 모자라면 창고에서 채워 납품한다 (중량 무관).
  if (LIFE_KINDS.has(offer.kind)) {
    const kind = offer.kind as LifeSkillKind;
    const bagHave = lifeBagQty(life, kind, offer.itemName);
    const storeRows = await loadStorageMatches(
      user.id,
      (name) => name.trim() === offer.itemName.trim(),
    );
    const storeHave = storageMatchTotal(storeRows);
    if (bagHave + storeHave < offer.qty) {
      return {
        error: `${offer.itemName}이(가) 부족해요. (보유 ${bagHave + storeHave} / 필요 ${offer.qty})`,
      };
    }
    const fromBag = Math.min(bagHave, offer.qty);
    if (fromBag > 0) consumeLifeBag(life, kind, offer.itemName, fromBag);
    if (offer.qty - fromBag > 0) await consumeStorage(storeRows, offer.qty - fromBag);
  } else {
    const bagHave = foodQty(inv, offer.itemName);
    const storeRows = await loadStorageMatches(user.id, (name) =>
      matchesFood(name, offer.itemName),
    );
    const storeHave = storageMatchTotal(storeRows);
    if (bagHave + storeHave < offer.qty) {
      return {
        error: `${offer.itemName}이(가) 부족해요. (보유 ${bagHave + storeHave} / 필요 ${offer.qty})`,
      };
    }
    const fromBag = Math.min(bagHave, offer.qty);
    if (fromBag > 0) {
      const used = consumeFood(inv, offer.itemName, fromBag);
      // void 비동기는 reject 시 프로세스를 죽이므로 반드시 삼킨다
      for (const [name, qty] of used) void decrementDbInventoryByName(user.id, name, qty).catch(() => {});
      sheetPushNeeded = true;
    }
    if (offer.qty - fromBag > 0) await consumeStorage(storeRows, offer.qty - fromBag);
  }

  // 보상 — 골드 + 파편 (+ 주간 3회 달성 시 명성 1 + 리롤권 1)
  const nextGold = (sheet.curGold ?? 0) + offer.gold;
  inv.gold = `${nextGold}G`;
  state.frags[offer.fragKind] += offer.fragCount;
  state.deliveredAt = new Date().toISOString();
  state.weekCount += 1;

  let weeklyNote = "";
  let fameDelta = 0;
  const rank = normalizeAdventurerRank(sheet.adventurerRank);
  if (state.weekCount >= WEEK_GOAL && !state.weekClaimed) {
    state.weekClaimed = true;
    state.rerolls = Math.min(rerollCap(rank), state.rerolls + 1);
    fameDelta = 1;
    weeklyNote = " 🎖️ 주간 3회 달성 — 명성 +1, 리롤권 +1!";
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      guildQuestJson: JSON.stringify(state),
      lifeJson: JSON.stringify(life),
      invJson: JSON.stringify(inv),
      curGold: nextGold,
      gold: `${nextGold}G`,
      ...(fameDelta > 0 ? { fame: totalFameForRank(sheet.adventurerRank, sheet.fame) + fameDelta } : {}),
      // 과거 카운터명(길드의뢰완료횟수)도 같이 올려 기존 누적치와 이어지게 한다
      achStatsJson:
        fameDelta > 0
          ? bumpStat(
              bumpStat(bumpStat(sheet.achStatsJson, "길드의뢰완료횟수"), "의뢰완료횟수"),
              "명성:주간의뢰보상",
              fameDelta,
            )
          : bumpStat(bumpStat(sheet.achStatsJson, "길드의뢰완료횟수"), "의뢰완료횟수"),
    },
  });
  void enqueueSheetGoldSync(user.id);
  // await 로 기다린다. void 로 띄우면 서버리스가 응답 직후 실행을 얼려서 시트 쓰기가
  // 통째로 유실된다 — 실제로 20명 중 8명의 시트 명성이 DB 보다 뒤처져 있었다.
  // appendSheetFame 은 내부 try/catch 라 throw 하지 않는다.
  if (fameDelta > 0) await appendSheetFame(sheet.sheetTab, fameDelta);
  if (sheetPushNeeded) void pushInventoryToSheet(sheet.sheetTab, inv);
  void checkAndGrant(user.id);

  if (sheet.locationId) {
    await postSystem(
      sheet.locationId,
      `📦 ${user.nickname}님이 길드 의뢰 [${offer.itemName} x${offer.qty}]를 납품했습니다!${offer.urgent ? " ⚡긴급 의뢰 완수!" : ""}`,
    );
  }

  revalidatePath("/world");
  return {
    ok: `납품 완료! +${offer.gold.toLocaleString()}G · ${offer.fragKind} 스킬 파편 +${offer.fragCount}${weeklyNote}`,
  };
}

// ── 스킬북 뽑기 (파편 10개) ──
export async function drawSkillbook(fragKindRaw: string): Promise<DrawResult> {
  try {
    return await drawSkillbookInner(fragKindRaw);
  } catch (e) {
    console.error("[guildQuests] 뽑기 실패:", e);
    const message = e instanceof Error ? e.message : String(e);
    return { error: `뽑기 처리 중 문제가 생겼어요: ${message}` };
  }
}

async function drawSkillbookInner(fragKindRaw: string): Promise<DrawResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const fragKind: FragKind | null =
    fragKindRaw === "일반" || fragKindRaw === "고급" ? fragKindRaw : null;
  if (!fragKind) return { error: "파편 종류가 올바르지 않아요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };

  const { state } = await loadGuildQuestState(user.id, sheet);
  if (state.frags[fragKind] < FRAG_COST) {
    return { error: `${fragKind} 파편이 부족해요. (보유 ${state.frags[fragKind]} / 필요 ${FRAG_COST})` };
  }

  const pool = await fetchSkillbookPool();
  if (pool.length === 0) return { error: "뽑을 수 있는 스킬북이 아직 없어요. (전투스킬 탭 동기화 필요)" };
  const num = drawSkillbookNumber(fragKind, pool.map((entry) => entry.num));
  if (num == null) return { error: "뽑기에 실패했어요. 다시 시도해주세요." };
  const book = pool.find((entry) => entry.num === num)!;
  const unique = isUniqueSkillbook(num);

  // 파편 차감 + 스킬북 지급 (DB 인벤 + 스냅샷 + 시트)
  state.frags[fragKind] -= FRAG_COST;
  const item = await prisma.item.findFirst({
    where: { OR: [{ id: book.itemId }, { name: book.itemId }] },
    select: { id: true, name: true, desc: true, weight: true },
  });
  const itemName = item?.name ?? book.itemId;
  const effect = item?.desc ?? `${book.job ?? "공용"} 스킬 '${book.skillName}'을 취득한다. 소모품`;
  const inv = parseInv(sheet.invJson);
  const existing = inv.items.find(
    (entry) => entry.name.trim() === itemName && (entry.effect ?? null) === effect,
  );
  if (existing) existing.qty += 1;
  else inv.items.push({ name: itemName, qty: 1, effect, weight: item?.weight ?? null });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  const overflow = inventoryWeightOverflowMessage(inv);
  if (overflow) return { error: overflow };

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { guildQuestJson: JSON.stringify(state), invJson: JSON.stringify(inv) },
  });
  // 사용 검증용 토큰 — 서버 지급 스킬북만 '사용' 가능(시트 위조 차단, lib/skillbook.ts)
  await grantSkillBookToken(user.id, item?.id ?? book.itemId, 1);
  void appendSheetItem(sheet.sheetTab, itemName, 1, { effect, weight: item?.weight ?? undefined });

  if (unique && sheet.locationId) {
    await postSystem(
      sheet.locationId,
      `📚✨ ${user.nickname}님이 스킬북 뽑기에서 유니크 《${book.skillName}》을(를) 획득했습니다!`,
    );
  }

  revalidatePath("/world");
  return { ok: true, bookId: itemName, skillName: book.skillName, job: book.job, unique };
}

// ── 교환소 — 안 쓰는 스킬북을 파편으로 ──
export async function exchangeSkillbook(itemName: string): Promise<GuildQuestActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const target = itemName.trim();
  const num = skillbookNumber(target);
  if (num == null) return { error: "스킬북이 아니에요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };

  // 정상 지급(토큰 보유) 스킬북만 교환 가능 — 시트 위조본을 파편으로 가는 악용 차단
  const item = await prisma.item.findFirst({
    where: { OR: [{ id: target }, { name: target }] },
    select: { id: true, name: true },
  });
  const itemId = item?.id ?? target;
  const consumed = await consumeSkillBookToken(user.id, [itemId]);
  if (!consumed) return { error: `${target}의 정상 지급 기록이 없어요. (서버 지급 스킬북만 교환 가능)` };

  const { state } = await loadGuildQuestState(user.id, sheet);
  const unique = isUniqueSkillbook(num);
  const fragKind: FragKind = unique ? "고급" : "일반";
  state.frags[fragKind] += EXCHANGE_REFUND;

  const inv = parseInv(sheet.invJson);
  const displayName = item?.name ?? target;
  for (const entry of inv.items) {
    if (entry.name.trim() !== displayName) continue;
    entry.qty -= 1;
    break;
  }
  inv.items = inv.items.filter((entry) => entry.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { guildQuestJson: JSON.stringify(state), invJson: JSON.stringify(inv) },
  });
  void pushInventoryToSheet(sheet.sheetTab, inv);

  revalidatePath("/world");
  return { ok: `${displayName}을(를) 갈아 ${fragKind} 파편 ${EXCHANGE_REFUND}개를 받았어요.` };
}
