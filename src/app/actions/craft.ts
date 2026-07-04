"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant, markStat } from "@/lib/achievements";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { getActiveItems, type LifeSkillItem } from "@/lib/lifeSkillData";
import { parseLifeState, type LifeState } from "@/lib/lifeSkillPerks";
import {
  appendSheetGold,
  appendSheetItem,
  inventoryWeightTotal,
  type SheetInventory,
} from "@/lib/googleSheets";
import {
  applyGradeBonus,
  computeCraft,
  craftResultName,
  isBlacksmithClass,
  itemAsCraftMinor,
  rollCraftGrade,
  type CraftGradeKey,
} from "@/lib/weaponCraft";

export type CraftResult =
  | {
      ok: true;
      name: string;
      grade: CraftGradeKey | null;
      effectText: string;
      fee: number;
      level: number;
    }
  | { error: string };

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

// 채광 가방 + 기본 인벤에서 광물 보유량 합산
function mineralQty(life: LifeState, inv: SheetInventory, name: string): number {
  const target = name.trim();
  const bag = life.bags.채광.items
    .filter((item) => item.name.trim() === target)
    .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
  const basic = inv.items
    .filter((item) => item.name.trim() === target)
    .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
  return bag + basic;
}

// 채광 가방 우선 소모, 부족분은 기본 인벤에서. 인벤 건드리면 true.
function consumeMineral(life: LifeState, inv: SheetInventory, name: string, qty: number): boolean {
  const target = name.trim();
  let remaining = qty;
  for (const item of life.bags.채광.items) {
    if (item.name.trim() !== target || remaining <= 0) continue;
    const take = Math.min(item.qty, remaining);
    item.qty -= take;
    remaining -= take;
  }
  life.bags.채광.items = life.bags.채광.items.filter((item) => item.qty > 0);
  let invTouched = false;
  for (const item of inv.items) {
    if (item.name.trim() !== target || remaining <= 0) continue;
    const take = Math.min(Math.max(0, item.qty), remaining);
    item.qty -= take;
    remaining -= take;
    invTouched = true;
  }
  if (invTouched) {
    inv.items = inv.items.filter((item) => item.qty > 0);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  }
  return invTouched;
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

// 대장간 위치 검증 — canForge(WorldServices)와 같은 키워드 기준
async function atForgeLocation(locationId: string | null): Promise<boolean> {
  if (!locationId) return false;
  const [here, actions] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } }),
    prisma.locationAction.findMany({ where: { locationId }, select: { kind: true, label: true } }),
  ]);
  if (!here) return false;
  const source = [here.id, here.name, ...actions.flatMap((a) => [a.kind, a.label ?? ""])]
    .join(" ")
    .toLowerCase();
  return ["대장간", "강화", "제련", "forge", "smith"].some((k) => source.includes(k.toLowerCase()));
}

// 커스텀 이름 검증 — 등급 사칭(명품/장인 등) 방지, 2~20자
function sanitizeCustomName(raw: string): string | { error: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return "";
  if (name.length < 2 || name.length > 20) return { error: "장비 이름은 2~20자로 지어주세요." };
  if (/고품질|명품|장인/.test(name)) return { error: "등급 표기(고품질/명품/장인)는 이름에 쓸 수 없어요." };
  if (/[\n\r,，"<>]/.test(name)) return { error: "이름에 쓸 수 없는 문자가 있어요." };
  return name;
}

export async function craftEquipment(formData: FormData): Promise<CraftResult> {
  try {
    return await craftEquipmentInner(formData);
  } catch (e) {
    console.error("[craft] 제작 실패:", e);
    const message = e instanceof Error ? e.message : String(e);
    return { error: `제작 처리 중 문제가 생겼어요: ${message}` };
  }
}

async function craftEquipmentInner(formData: FormData): Promise<CraftResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };
  if (!(await atForgeLocation(sheet.locationId))) return { error: "대장간에서만 제작할 수 있어요." };

  const category = String(formData.get("category") ?? "").trim();
  const customNameResult = sanitizeCustomName(String(formData.get("customName") ?? ""));
  if (typeof customNameResult !== "string") return customNameResult;
  const customName = customNameResult;
  let majorsRaw: Record<string, number>;
  let minorsRaw: string[];
  try {
    majorsRaw = JSON.parse(String(formData.get("majors") ?? "{}")) as Record<string, number>;
    minorsRaw = JSON.parse(String(formData.get("minors") ?? "[]")) as string[];
  } catch {
    return { error: "재료 정보를 읽지 못했어요. 다시 시도해주세요." };
  }

  // 활성 광물 풀에서 재료 정의 조회 (클라이언트 입력 불신 — 서버가 다시 계산)
  await loadLifeItems();
  const pool = new Map(getActiveItems("채광").map((item) => [item.name, item]));
  // 아이템 탭 드롭품(제작효과 有) — 마이너 재료로 합류
  const dropMinors = await prisma.item.findMany({
    where: { craftEffect: { not: null } },
    select: { name: true, craftEffect: true, sellPrice: true, desc: true },
  });
  for (const it of dropMinors) {
    const key = it.name.trim();
    if (!pool.has(key)) pool.set(key, itemAsCraftMinor(it));
  }
  const majors: { item: LifeSkillItem; qty: number }[] = [];
  for (const [name, qty] of Object.entries(majorsRaw)) {
    if (!Number.isInteger(qty) || qty <= 0) continue;
    const item = pool.get(name.trim());
    if (!item) return { error: `${name}은(는) 알 수 없는 광물이에요.` };
    majors.push({ item, qty });
  }
  const minors: LifeSkillItem[] = [];
  const seenMinor = new Set<string>();
  for (const name of minorsRaw) {
    const key = name.trim();
    if (seenMinor.has(key)) return { error: "같은 마이너 광물은 1개씩만 넣을 수 있어요." };
    seenMinor.add(key);
    const item = pool.get(key);
    if (!item) return { error: `${key}은(는) 알 수 없는 광물이에요.` };
    minors.push(item);
  }

  const preview = computeCraft({ category, majors, minors });
  if ("error" in preview) return { error: preview.error };

  // 보유량 검증 + 소모
  const life = parseLifeState(sheet.lifeJson);
  const inv = parseInv(sheet.invJson);
  const needs = new Map<string, number>();
  for (const m of majors) needs.set(m.item.name, (needs.get(m.item.name) ?? 0) + m.qty);
  for (const m of minors) needs.set(m.name, (needs.get(m.name) ?? 0) + 1);
  for (const [name, qty] of needs) {
    const have = mineralQty(life, inv, name);
    if (have < qty) return { error: `${name}이(가) 부족해요. (보유 ${have} / 필요 ${qty})` };
  }

  // 수수료 — 생산 클래스(블랙스미스)는 절반. "상한은 평등, 기대값은 이점".
  const blacksmith = isBlacksmithClass(sheet.charClass);
  const fee = blacksmith ? Math.max(10, Math.round(preview.fee / 2)) : preview.fee;
  const curGold = sheet.curGold ?? 0;
  if (curGold < fee) return { error: `제작 수수료가 부족해요. (${fee.toLocaleString()}G 필요)` };

  let invTouched = false;
  for (const [name, qty] of needs) {
    if (consumeMineral(life, inv, name, qty)) {
      invTouched = true;
      // void 비동기는 reject 시 프로세스를 죽이므로 반드시 삼킨다 (스냅샷 invJson이 진실원)
      void decrementDbInventoryByName(user.id, name, qty).catch(() => {});
    }
  }

  // 등급 롤 — 블랙스미스는 확률 보정(상한 동일)
  const grade = rollCraftGrade(blacksmith);
  const stats = applyGradeBonus(preview.stats, preview.group, grade);
  const name = craftResultName(preview, grade, user.nickname, customName);
  const gradeInfoMult = grade === "장인" ? 2.6 : grade === "명품" ? 2.0 : grade === "고품질" ? 1.4 : 1;
  const sellPrice = Math.max(1, Math.round(preview.basePrice * 0.4 * gradeInfoMult));

  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const statText =
    preview.group === "무기"
      ? `명중 ${fmt(stats.hit)} · 공격력 ${fmt(stats.atk)}${stats.dodge ? ` · 회피 ${fmt(stats.dodge)}` : ""}${stats.pdef ? ` · 물방 ${fmt(stats.pdef)}` : ""}${stats.mdef ? ` · 마방 ${fmt(stats.mdef)}` : ""}`
      : `${stats.dodge ? `회피 ${fmt(stats.dodge)} · ` : ""}물리 방어력 ${fmt(stats.pdef)} · 마법 방어력 ${fmt(stats.mdef)}`;
  const effectText = [
    statText,
    `Lv${preview.level} ${preview.category} · ${preview.part}${grade ? ` · ${grade === "장인" ? "장인작" : grade}` : ""}`,
    ...(preview.tags.length > 0 ? [preview.tags.map((t) => `[${t}]`).join(" ")] : []),
    ...(preview.extras.length > 0 ? [preview.extras.join(" · ")] : []),
    `제작: ${user.nickname}`,
  ].join("\n");

  // 결과 지급 — 아이템 도감 + 인벤 스냅샷 + 구글 시트
  const nextGold = curGold - fee;
  inv.gold = `${nextGold}G`;
  const existing = inv.items.find(
    (entry) => entry.name.trim() === name && (entry.effect ?? null) === effectText,
  );
  if (existing) existing.qty += 1;
  else inv.items.push({ name, qty: 1, effect: effectText, weight: preview.weight });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;

  await prisma.item.upsert({
    where: { id: name },
    create: {
      id: name,
      name,
      category: preview.group,
      sellPrice,
      desc: effectText,
    },
    update: { category: preview.group, sellPrice, desc: effectText },
  });
  const dbItem = await prisma.item.findUnique({ where: { id: name }, select: { id: true } });
  if (dbItem) {
    const entry = await prisma.inventoryEntry.findFirst({
      where: { userId: user.id, itemId: dbItem.id, meta: null },
    });
    if (entry) await prisma.inventoryEntry.update({ where: { id: entry.id }, data: { qty: entry.qty + 1 } });
    else await prisma.inventoryEntry.create({ data: { userId: user.id, itemId: dbItem.id, qty: 1 } });
  }

  // 사용한 광물 기록 — 제작 UI에서 효과가 공개되는 '발견' 트리거
  let achStats = bumpStat(sheet.achStatsJson, "제작횟수");
  for (const mineralName of needs.keys()) achStats = markStat(achStats, `제작광물:${mineralName}`);

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      lifeJson: JSON.stringify(life),
      invJson: JSON.stringify(inv),
      curGold: nextGold,
      gold: `${nextGold}G`,
      achStatsJson: achStats,
    },
  });
  void appendSheetGold(sheet.sheetTab, -fee);
  void appendSheetItem(sheet.sheetTab, name, 1, { effect: effectText, weight: preview.weight });
  if (invTouched) {
    // 인벤에서 광물을 소모했으면 시트 전체 동기화는 다음 pushInventoryToSheet 경로에 맡기고,
    // 여기서는 스냅샷(invJson)이 진실원이므로 추가 작업 없음 (시트 수동 정리 가능)
  }
  void checkAndGrant(user.id);

  if (sheet.locationId) {
    const gradeNote = grade === "장인" ? " 🌟장인의 솜씨!" : grade === "명품" ? " ✨명품 탄생!" : "";
    await postSystem(
      sheet.locationId,
      `⚒️ ${user.nickname}님이 [${name}]을(를) 제작했습니다!${gradeNote}`,
    );
  }

  revalidatePath("/world");
  return { ok: true, name, grade, effectText, fee, level: preview.level };
}
