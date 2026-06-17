"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { fetchWorldRows, regenFatigue } from "@/lib/world";
import {
  fetchItemsRows,
  fetchActionsRows,
  fetchDungeonsRows,
  fetchEventsRows,
  fetchAchievementsRows,
  fetchRecipesRows,
  fetchSkillsRows,
  fetchCombatSkillsRows,
} from "@/lib/gamedata";
import { postSystem, tryKeywordSpeech } from "@/lib/play";
import { addVisited, bumpStat, checkAndGrant } from "@/lib/achievements";
import type { ActionRow, DropEntry } from "@/lib/gamedata";
import { lifeSkillKindOf, type LifeSkillKind } from "@/lib/lifeSkillData";
import {
  appendSheetGold,
  appendSheetItem,
  inventoryWeightTotal,
  type SheetInventory,
} from "@/lib/googleSheets";
import {
  homeLocationId,
  houseOption,
  isBellTowerLocation,
  isHomeLocationId,
  parseHousingState,
} from "@/lib/housing";

export type WorldActionState = { error?: string; ok?: string } | undefined;
export type WorldCleanupState = { error?: string; ok?: string } | undefined;
export type DiscoverState = { error?: string; notice?: string; found?: boolean };

// 은밀한 조사 쿨다운 — 같은 키워드는 30분에 한 번만 시도 가능.
// 정보가 풀리는 걸 막고, 무차별 키워드 찔러보기를 어렵게 한다.
const PROBE_COOLDOWN_MS = 30 * 60_000;
const normKeyword = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function parseProbeMap(json: string | null): Record<string, number> {
  try {
    if (!json) return {};
    const raw = JSON.parse(json) as Record<string, string | number>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const t = typeof v === "number" ? v : Date.parse(String(v));
      if (Number.isFinite(t)) out[k] = t;
    }
    return out;
  } catch {
    return {};
  }
}

// 비밀 키워드로 히든 장소 발견 — 채팅과 분리된 전용 입력칸에서 호출.
// 입력 키워드는 공개 채팅에 남기지 않고, 결과는 본인에게만 notice 로 돌려준다.
export async function discoverByKeyword(keyword: string): Promise<DiscoverState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const trimmed = keyword.trim();
  if (!trimmed) return { error: "키워드를 입력해주세요." };
  if (trimmed.length > 60) return { error: "키워드가 너무 길어요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { error: "월드에 입장한 상태에서만 조사할 수 있어요." };

  // 키워드별 쿨다운 체크 (만료된 기록은 정리)
  const now = Date.now();
  const key = normKeyword(trimmed);
  const probes = parseProbeMap(sheet.probeJson);
  for (const [k, t] of Object.entries(probes)) {
    if (now - t >= PROBE_COOLDOWN_MS) delete probes[k];
  }
  const last = probes[key];
  if (last != null && now - last < PROBE_COOLDOWN_MS) {
    const leftMin = Math.ceil((PROBE_COOLDOWN_MS - (now - last)) / 60_000);
    return { notice: `누군가가 이미 조사한 단서다. ${leftMin}분 후 다시 시도할 수 있다.` };
  }

  probes[key] = now;
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { probeJson: JSON.stringify(probes) },
  });

  const result = await tryKeywordSpeech(user.id, sheet, trimmed);
  let earnedNote = "";
  if (result.found) {
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { achStatsJson: bumpStat(sheet.achStatsJson, "조사성공횟수") },
    });
    const earned = await checkAndGrant(user.id);
    if (earned.length > 0)
      earnedNote = ` · 🏅 업적 달성: ${earned.map((e) => `${e.badge ?? "🏅"} ${e.name}`).join(", ")}`;
    revalidatePath("/world");
  }
  const notice = [result.notice, earnedNote].filter(Boolean).join("") || undefined;
  return { notice, found: result.found };
}

// 현재 피로도 계산 (lazy 자연 회복)
function freshAp(ap: number | null, apResetAt: Date | null): { ap: number; apResetAt: Date } {
  const r = regenFatigue(ap, apResetAt);
  return { ap: r.value, apResetAt: r.at };
}

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallback below
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function addInvSnapshotItem(
  inv: SheetInventory,
  item: { name: string; effect: string | null; weight: number | null },
  qty: number,
): SheetInventory {
  const existing = inv.items.find(
    (entry) =>
      entry.name.trim() === item.name.trim() &&
      (entry.effect ?? null) === item.effect &&
      (entry.weight ?? null) === item.weight,
  );
  if (existing) existing.qty += qty;
  else inv.items.push({ ...item, qty });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

async function incrementDbItem(userId: string, itemName: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
  if (!item) return;
  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: item.id, meta: null },
  });
  if (existing) {
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  } else {
    await prisma.inventoryEntry.create({
      data: { userId, itemId: item.id, qty },
    });
  }
}

async function grantEventRewards(
  userId: string,
  sheet: { sheetTab: string | null; curGold: number | null; invJson: string | null },
  rewards: DropEntry[],
): Promise<string[]> {
  const latest =
    (await prisma.characterSheet.findUnique({
      where: { userId },
      select: { sheetTab: true, curGold: true, invJson: true },
    })) ?? sheet;
  const inv = parseInv(latest.invJson);
  let goldGain = 0;
  const lines: string[] = [];

  for (const reward of rewards) {
    if (reward.item === "꽝") continue;
    if (reward.item === "골드") {
      goldGain += reward.gold;
      if (reward.gold > 0) lines.push(`${reward.gold.toLocaleString()}G`);
      continue;
    }

    const item = await prisma.item.findFirst({
      where: { OR: [{ id: reward.item }, { name: reward.item }] },
      select: { id: true, name: true, desc: true },
    });
    const itemName = item?.name ?? reward.item;
    await incrementDbItem(userId, itemName, reward.qty);
    addInvSnapshotItem(inv, { name: itemName, effect: item?.desc ?? null, weight: null }, reward.qty);
    void appendSheetItem(latest.sheetTab, itemName, reward.qty, { effect: item?.desc ?? null });
    lines.push(`${itemName} x${reward.qty}`);
  }

  const nextGold = (latest.curGold ?? 0) + goldGain;
  if (goldGain > 0) {
    inv.gold = `${nextGold}G`;
    void appendSheetGold(latest.sheetTab, goldGain);
  }

  await prisma.characterSheet.update({
    where: { userId },
    data: {
      ...(goldGain > 0 ? { curGold: nextGold, gold: `${nextGold}G` } : {}),
      invJson: JSON.stringify(inv),
    },
  });

  return lines;
}

async function triggerFirstVisitEvents(
  user: { id: string; nickname: string },
  sheet: { sheetTab: string | null; curGold: number | null; invJson: string | null },
  locationId: string,
): Promise<void> {
  const events = await prisma.worldEvent.findMany({
    where: { locationId, type: "최초방문", active: true },
    orderBy: { order: "asc" },
  });
  for (const event of events) {
    try {
      await prisma.worldEventClaim.create({
        data: { eventId: event.id, locationId, userId: user.id },
      });
    } catch {
      continue;
    }

    let rewards: DropEntry[] = [];
    try {
      rewards = JSON.parse(event.rewardsJson) as DropEntry[];
    } catch {
      rewards = [];
    }
    const rewardLines = await grantEventRewards(user.id, sheet, rewards);
    const publicLine =
      event.publicMessage?.replaceAll("{닉네임}", user.nickname) ??
      `${user.nickname}님이 ${event.name}의 첫 발견자가 되었습니다.`;
    await postSystem(locationId, `✨ ${publicLine}`);
    if (event.message || rewardLines.length > 0) {
      await postSystem(
        locationId,
        `🎁 ${event.name}${event.message ? ` — ${event.message}` : ""}${
          rewardLines.length > 0 ? ` (보상: ${rewardLines.join(", ")})` : ""
        }`,
      );
    }
  }
}

function actionKey(action: Pick<ActionRow, "locationId" | "kind" | "label">): string {
  return `${action.locationId}::${action.label ?? action.kind}`.replace(/\s+/g, "");
}

function hasLifeAction(
  existing: ActionRow[],
  locationId: string,
  kind: LifeSkillKind,
): boolean {
  return existing.some(
    (action) =>
      action.locationId === locationId && lifeSkillKindOf(action.kind, action.label) === kind,
  );
}

function autoLifeActions(
  rows: Awaited<ReturnType<typeof fetchWorldRows>>,
  existing: ActionRow[],
): ActionRow[] {
  const seen = new Set(existing.map(actionKey));
  const actions: ActionRow[] = [];
  for (const row of rows) {
    const candidates: ActionRow[] = [];
    if (row.life?.gather?.enabled && !hasLifeAction(existing, row.id, "채집")) {
      candidates.push({
        locationId: row.id,
        kind: "채집",
        label: "채집",
        apCost: 1,
        statLabel: null,
        dc: null,
        drops: [{ item: "꽝", qty: 1, gold: 0, weight: 1 }],
        failText: null,
      });
    }
    if (row.life?.fish?.enabled && !hasLifeAction(existing, row.id, "낚시")) {
      candidates.push({
        locationId: row.id,
        kind: "낚시",
        label: "낚시",
        apCost: 1,
        statLabel: null,
        dc: null,
        drops: [{ item: "꽝", qty: 1, gold: 0, weight: 1 }],
        failText: null,
      });
    }
    for (const action of candidates) {
      const key = actionKey(action);
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
  }
  return actions;
}

// 월드 입장 — 시작 장소로 배치
export async function enterWorld(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet) return;

  const start = await prisma.location.findFirst({ where: { isStart: true } });
  if (!start) return;

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      locationId: start.id,
      enteredAt: new Date(),
      ap,
      apResetAt,
      visitedJson: addVisited(sheet.visitedJson, start.id),
    },
  });
  await postSystem(start.id, `🌟 ${user.nickname}님이 월드에 입장하셨습니다!`);
  await triggerFirstVisitEvents(user, sheet, start.id);
  void checkAndGrant(user.id);
  revalidatePath("/world");
}

// 이동 — 연결된 장소로만. 행동치 소모 없음(행동치는 채집·전투 등 행동 전용)
export async function moveTo(formData: FormData): Promise<void> {
  const target = String(formData.get("target") ?? "").trim();
  if (!target) return;

  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return;

  const [here, dest] = await Promise.all([
    prisma.location.findUnique({ where: { id: sheet.locationId } }),
    prisma.location.findUnique({ where: { id: target } }),
  ]);
  if (!here || !dest) return;

  const parseArr = (json: string | null): string[] => {
    try {
      return json ? (JSON.parse(json) as string[]) : [];
    } catch {
      return [];
    }
  };

  // 히든 장소는 발견한 경우에만 진입 가능
  if (dest.hidden) {
    const discovered = parseArr(sheet.discoveredJson);
    if (!discovered.includes(target)) return;
  }

  // 연결 검증 — 정방향(현재→목적지) 또는 발견한 히든의 역방향(목적지→현재) 진입 허용.
  // (히든은 이웃 행이 아닌 자기 행에만 연결을 적어두므로 역방향을 인정해야 들어갈 수 있다)
  const conns = parseArr(here.connJson);
  const linked = conns.includes(target) || (dest.hidden && parseArr(dest.connJson).includes(here.id));
  if (!linked) return;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      locationId: target,
      enteredAt: new Date(),
      visitedJson: addVisited(sheet.visitedJson, target),
      achStatsJson: bumpStat(sheet.achStatsJson, "이동횟수"),
    },
  });
  void checkAndGrant(user.id);
  // 일반 이동으로 균열을 벗어나면 멤버십 해제
  await prisma.riftMember.deleteMany({ where: { userId: user.id } });
  // 퇴장/입장 알림 (목적지는 노출하지 않음 — 히든 보호)
  await Promise.all([
    postSystem(here.id, `📤 ${user.nickname}님이 자리를 떠났습니다.`),
    postSystem(dest.id, `📥 ${user.nickname}님이 입장하셨습니다!`),
  ]);
  await triggerFirstVisitEvents(user, sheet, target);
  revalidatePath("/world");
}

async function bellTowerLocation() {
  const locations = await prisma.location.findMany({
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  });
  return locations.find((location) => isBellTowerLocation(location)) ?? null;
}

export async function enterHome(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const tier = houseOption(String(formData.get("tier") ?? ""));
  if (!tier) return;

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true, houseTier: true, housingJson: true },
  });
  if (!sheet?.locationId) return;

  const housing = parseHousingState(sheet.housingJson, sheet.houseTier);
  if (!housing.owned.includes(tier.tier)) return;

  const here = await prisma.location.findUnique({
    where: { id: sheet.locationId },
    select: { id: true, name: true },
  });
  if (!isBellTowerLocation(here)) return;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: homeLocationId(user.id, tier.tier), houseTier: tier.tier, enteredAt: new Date() },
  });
  await postSystem(sheet.locationId, `📤 ${user.nickname}님이 자리를 떠났습니다.`);
  revalidatePath("/world");
}

export async function leaveHome(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });
  if (!isHomeLocationId(sheet?.locationId)) return;

  const dest = await bellTowerLocation();
  if (!dest) return;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: dest.id, enteredAt: new Date() },
  });
  await postSystem(dest.id, `📥 ${user.nickname}님이 입장하셨습니다!`);
  revalidatePath("/world");
}

// 시트 동기화 — GM 전용. 맵(필수) + 아이템/행동(선택) 탭 → DB 교체
export async function syncWorldMap(
  _prev: WorldActionState,
  _formData: FormData,
): Promise<WorldActionState> {
  void _prev;
  void _formData;
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  // 1) 맵 (필수)
  let rows;
  try {
    rows = await fetchWorldRows();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "맵을 불러오지 못했어요." };
  }

  await prisma.$transaction([
    prisma.location.deleteMany(),
    prisma.location.createMany({
      data: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        desc: r.desc,
        image: r.image,
        connJson: JSON.stringify(r.conns),
        hidden: r.hidden,
        keyword: r.keyword,
        cond: r.cond,
        lifeJson: r.life ? JSON.stringify(r.life) : null,
        isStart: r.isStart,
        order: i,
      })),
    }),
  ]);

  const parts: string[] = [`장소 ${rows.length}곳`];
  const warns: string[] = [];

  // 2) 아이템 (선택 — 실패해도 맵 동기화는 유지)
  let itemIds: Set<string> | null = null;
  try {
    const items = await fetchItemsRows();
    if (items) {
      await prisma.$transaction([
        prisma.item.deleteMany(),
        prisma.item.createMany({
          data: items.map((it, i) => ({ ...it, order: i })),
        }),
      ]);
      itemIds = new Set(items.flatMap((it) => [it.id, it.name]));
      parts.push(`아이템 ${items.length}종`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "아이템 탭 오류");
  }

  // 3) 행동 (선택 — 아이템 도감 기준으로 드랍 검증)
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true, name: true } });
      itemIds = new Set(existing.flatMap((it) => [it.id, it.name]));
    }
    const sheetActions = (await fetchActionsRows(itemIds)) ?? [];
    const actions = [...sheetActions, ...autoLifeActions(rows, sheetActions)];
    if (actions.length > 0) {
      const locIds = new Set(rows.map((r) => r.id));
      for (const a of actions) {
        if (!locIds.has(a.locationId))
          throw new Error(`행동의 장소ID '${a.locationId}' 가 맵에 없어요.`);
      }
      await prisma.$transaction([
        prisma.locationAction.deleteMany(),
        prisma.locationAction.createMany({
          data: actions.map((a, i) => ({
            locationId: a.locationId,
            kind: a.kind,
            label: a.label,
            apCost: a.apCost,
            statLabel: a.statLabel,
            dc: a.dc,
            dropsJson: JSON.stringify(a.drops),
            failText: a.failText,
            order: i,
          })),
        }),
      ]);
      parts.push(`행동 ${actions.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "행동 탭 오류");
  }

  // 4) 던전 (선택)
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true, name: true } });
      itemIds = new Set(existing.flatMap((it) => [it.id, it.name]));
    }
    const dungeons = await fetchDungeonsRows(itemIds);
    if (dungeons) {
      const locIds = new Set(rows.map((r) => r.id));
      const valid = dungeons.filter((d) => locIds.has(d.locationId));
      const skipped = dungeons.length - valid.length;
      await prisma.$transaction([
        prisma.dungeon.deleteMany(),
        prisma.dungeon.createMany({
          data: valid.map((d, i) => ({
            id: d.id,
            name: d.name,
            locationId: d.locationId,
            dc: d.dc,
            exp: d.exp,
            expMax: d.expMax,
            dropsJson: JSON.stringify(d.drops),
            rollDropsJson: JSON.stringify(d.rollDrops),
            floor: d.floor,
            order: i,
          })),
        }),
      ]);
      parts.push(`던전 ${valid.length}개`);
      if (skipped > 0) warns.push(`던전 ${skipped}개는 장소가 맵에 없어 건너뜀`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "던전 탭 오류");
  }

  // 5) 이벤트 (선택) — 지급 기록(WorldEventClaim)은 보존하고 정의만 교체.
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true, name: true } });
      itemIds = new Set(existing.flatMap((it) => [it.id, it.name]));
    }
    const events = await fetchEventsRows(itemIds);
    if (events) {
      const locIds = new Set(rows.map((r) => r.id));
      const valid = events.filter((event) => locIds.has(event.locationId));
      const skipped = events.length - valid.length;
      await prisma.$transaction([
        prisma.worldEvent.deleteMany(),
        prisma.worldEvent.createMany({
          data: valid.map((event, i) => ({
            id: event.id,
            locationId: event.locationId,
            type: event.type,
            name: event.name,
            message: event.message,
            rewardsJson: JSON.stringify(event.rewards),
            publicMessage: event.publicMessage,
            active: event.active,
            order: i,
          })),
        }),
      ]);
      parts.push(`이벤트 ${valid.length}개`);
      if (skipped > 0) warns.push(`이벤트 ${skipped}개는 장소가 맵에 없어 건너뜀`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "이벤트 탭 오류");
  }

  // 6) 업적 (선택) — 정의만 교체, 유저 달성기록(UserAchievement)은 보존.
  try {
    const achievements = await fetchAchievementsRows();
    if (achievements) {
      await prisma.$transaction([
        prisma.achievement.deleteMany(),
        prisma.achievement.createMany({
          data: achievements.map((a, i) => ({
            id: a.id,
            category: a.category,
            name: a.name,
            desc: a.desc,
            condType: a.condType,
            condValue: a.condValue,
            rewardTitle: a.rewardTitle,
            rewardFame: a.rewardFame,
            badge: a.badge,
            secret: a.secret,
            order: i,
          })),
        }),
      ]);
      parts.push(`업적 ${achievements.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "업적 탭 오류");
  }

  // 7) 레시피 (선택) — 발견 기록(UserRecipe)은 보존하고 정의만 교체.
  try {
    const recipes = await fetchRecipesRows();
    if (recipes) {
      await prisma.$transaction([
        prisma.cookingRecipe.deleteMany(),
        prisma.cookingRecipe.createMany({
          data: recipes.map((recipe, i) => ({
            id: recipe.id,
            name: recipe.name,
            category: recipe.category,
            rank: recipe.rank,
            facility: recipe.facility,
            ingredientsJson: JSON.stringify(recipe.ingredients),
            resultName: recipe.resultName,
            resultQty: recipe.resultQty,
            effect: recipe.effect,
            duration: recipe.duration,
            skillExp: recipe.skillExp,
            tags: recipe.tags,
            sellPrice: recipe.sellPrice,
            weight: recipe.weight,
            isPublic: recipe.isPublic,
            order: i,
          })),
        }),
      ]);
      parts.push(`레시피 ${recipes.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "레시피 탭 오류");
  }

  // 8) 스킬 (선택) — 유저가 이미 획득한 특성 기록은 보존하고 정의만 교체.
  try {
    const skills = await fetchSkillsRows();
    if (skills) {
      await prisma.$transaction([
        prisma.skill.deleteMany(),
        prisma.skill.createMany({
          data: skills.map((skill, i) => ({
            id: skill.id,
            name: skill.name,
            category: skill.category,
            kind: skill.kind,
            type: skill.type,
            rarity: skill.rarity,
            description: skill.desc,
            effectKey: skill.effectKey,
            effectValue: skill.effectValue,
            sourceItem: skill.sourceItem,
            isPublic: skill.isPublic,
            enabled: skill.enabled,
            order: i,
          })),
        }),
      ]);
      parts.push(`스킬 ${skills.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "스킬 탭 오류");
  }

  // 9) 전투스킬 (선택) — 스킬북 아이템이 가르치는 스킬 카탈로그. 정의만 교체.
  try {
    const combatSkills = await fetchCombatSkillsRows();
    if (combatSkills) {
      await prisma.$transaction([
        prisma.combatSkill.deleteMany(),
        prisma.combatSkill.createMany({
          data: combatSkills.map((skill, i) => ({
            id: skill.id,
            name: skill.name,
            job: skill.job,
            category: skill.category,
            subCategory: skill.subCategory,
            sl: skill.sl,
            slMax: skill.slMax,
            timing: skill.timing,
            range: skill.range,
            check: skill.check,
            target: skill.target,
            cost: skill.cost,
            condition: skill.condition,
            effect: skill.effect,
            critical: skill.critical,
            sourceItem: skill.sourceItem,
            order: i,
          })),
        }),
      ]);
      parts.push(`전투스킬 ${combatSkills.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "전투스킬 탭 오류");
  }

  revalidatePath("/world");
  const okMsg = `동기화 완료 — ${parts.join(" · ")}`;
  return warns.length > 0 ? { ok: okMsg, error: `⚠ ${warns.join(" / ")}` } : { ok: okMsg };
}

export async function cleanupOldWorldMessages(
  _prev: WorldCleanupState,
  _formData: FormData,
): Promise<WorldCleanupState> {
  void _prev;
  void _formData;
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const result = await prisma.worldMessage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  revalidatePath("/world");
  return { ok: `90일 지난 월드 채팅 ${result.count.toLocaleString("ko-KR")}개를 정리했어요.` };
}
