"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  appendSheetItem,
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import { parseGoldToInt } from "@/lib/dice";
import {
  addLifeBagItem,
  applyCookingExp,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
} from "@/lib/lifeSkillPerks";
import { findLifeSkillItem, getActiveItems, lifeSkillSellPrice, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { SELLABLE_MATERIAL_CATEGORIES, isNonSellable } from "@/lib/shop";
import { buildCookedName, enhanceEffectText, gradeInfo, parseCookedName } from "@/lib/auction";
import { TIER_LABEL, detectForgeSlot, rollPrefix, stripPrefix, stripPrefixEffect } from "@/lib/forge";
import { FATIGUE_MAX, regenFatigue, restedTodayKst } from "@/lib/world";
import { postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import {
  adventurerRankGoal,
  nextAdventurerRank,
  normalizeAdventurerRank,
  storageWeightBonus,
} from "@/lib/adventurerRank";
import {
  bedRestBonus,
  furnitureOption,
  hasFurnitureEffect,
  homeOwnerFromLocationId,
  homeTierFromLocationId,
  houseOption,
  houseSellPrice,
  isBellTowerLocation,
  isHomeLocationId,
  ownedHouseOptions,
  parseHousingState,
  serializeHousingState,
} from "@/lib/housing";

export type ServiceState = { error?: string; ok?: string } | undefined;
export type StorageState = { error?: string; ok?: string } | undefined;
export type LifeShopState = { error?: string; ok?: string } | undefined;
export type MarketState = { error?: string; ok?: string } | undefined;
export type HousingState = { error?: string; ok?: string } | undefined;
export type CookingState = { error?: string; ok?: string } | undefined;
export type GuildState = { error?: string; ok?: string } | undefined;

const STEEL_FRAGMENT = "강철 파편";
const MOON_FRAGMENT = "달의 파편";
const COOKING_AP_COST = 10;
const FAILED_DISH = {
  name: "실패한 요리",
  effect: "정체를 알 수 없는 요리 실패작. 판매는 가능하다.",
  weight: 1,
  sellPrice: 1,
};

const LIFE_SHOP_ITEMS = [
  // 가방 — 낚시·채집·채광 공통 (기본 5칸 → 10/20/30칸 확장, 1000/2500/5000G)
  { id: "fish_bag_10", kind: "낚시", type: "bag", name: "낚시꾼 가방 10칸", price: 1000, maxWeight: 10 },
  { id: "fish_bag_20", kind: "낚시", type: "bag", name: "낚시꾼 가방 20칸", price: 2500, maxWeight: 20 },
  { id: "fish_bag_30", kind: "낚시", type: "bag", name: "낚시꾼 가방 30칸", price: 5000, maxWeight: 30 },
  { id: "plant_bag_10", kind: "채집", type: "bag", name: "약초꾼 가방 10칸", price: 1000, maxWeight: 10 },
  { id: "plant_bag_20", kind: "채집", type: "bag", name: "약초꾼 가방 20칸", price: 2500, maxWeight: 20 },
  { id: "plant_bag_30", kind: "채집", type: "bag", name: "약초꾼 가방 30칸", price: 5000, maxWeight: 30 },
  { id: "mine_bag_10", kind: "채광", type: "bag", name: "광부 가방 10칸", price: 1000, maxWeight: 10 },
  { id: "mine_bag_20", kind: "채광", type: "bag", name: "광부 가방 20칸", price: 2500, maxWeight: 20 },
  { id: "mine_bag_30", kind: "채광", type: "bag", name: "광부 가방 30칸", price: 5000, maxWeight: 30 },
  // 도구 — 종류별 1·2단계 (가격 동일)
  { id: "good_rod", kind: "낚시", type: "tool", name: "좋은 낚싯대", price: 2500, tier: 1 },
  { id: "master_rod", kind: "낚시", type: "tool", name: "고급 낚싯대", price: 7000, tier: 2 },
  { id: "good_sickle", kind: "채집", type: "tool", name: "숙련 채집 도구", price: 2500, tier: 1 },
  { id: "master_sickle", kind: "채집", type: "tool", name: "장인의 채집 도구", price: 7000, tier: 2 },
  { id: "iron_pick", kind: "채광", type: "tool", name: "철 곡괭이", price: 2500, tier: 1 },
  { id: "mithril_pick", kind: "채광", type: "tool", name: "미스릴 곡괭이", price: 7000, tier: 2 },
] as const satisfies readonly LifeShopProduct[];

const FOOD_ITEMS = [
  { id: "egg", name: "달걀", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "milk", name: "우유", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "meat", name: "고기", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "vegetable", name: "채소", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "fruit", name: "과일", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "water", name: "물", buyPrice: 5, sellPrice: 2, weight: 1, desc: "요리용 식재료" },
  { id: "wheat", name: "밀", buyPrice: 20, sellPrice: 10, weight: 1, desc: "요리용 식재료" },
  { id: "salt", name: "소금", buyPrice: 30, sellPrice: 15, weight: 1, desc: "요리용 식재료" },
  { id: "spice", name: "향신료", buyPrice: 50, sellPrice: 25, weight: 1, desc: "요리용 식재료" },
  { id: "cheese", name: "치즈", buyPrice: 50, sellPrice: 25, weight: 1, desc: "요리용 식재료" },
] as const;

type LifeShopProduct =
  | {
      id: string;
      kind: LifeSkillKind;
      type: "bag";
      name: string;
      price: number;
      maxWeight: number;
    }
  | {
      id: string;
      kind: LifeSkillKind;
      type: "tool";
      name: string;
      price: number;
      tier: number;
    };

const GEM_EFFECTS = [
  { key: "루비", text: "루비 인첸트: <화> 속성 마법 데미지 +2" },
  { key: "에메랄드", text: "에메랄드 인첸트: <풍> 속성 마법 데미지 +2" },
  { key: "사파이어", text: "사파이어 인첸트: <수> 속성 마법 데미지 +2" },
  { key: "토파즈", text: "토파즈 인첸트: <지> 속성 마법 데미지 +2" },
  {
    key: "다이아몬드",
    text: "다이아몬드 인첸트: 마법 데미지 +2, 데미지 경감 [분류:마술] 효과 +2",
  },
];

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function findInvItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  return inv.items.find((item) => item.name.trim() === name.trim()) ?? null;
}

function itemQty(inv: SheetInventory, name: string): number {
  const target = name.trim();
  return inv.items
    .filter((item) => item.name.trim() === target)
    .reduce((total, item) => total + Math.max(0, item.qty), 0);
}

function consumeInvItem(inv: SheetInventory, name: string, qty: number): SheetInventory {
  const target = name.trim();
  let remaining = qty;
  for (const item of inv.items) {
    if (item.name.trim() !== target || remaining <= 0) continue;
    const used = Math.min(Math.max(0, item.qty), remaining);
    item.qty = Math.max(0, item.qty - used);
    remaining -= used;
  }
  return inv;
}

function addInvItem(
  inv: SheetInventory,
  item: { name: string; effect: string | null; weight: number | null },
  qty: number,
): SheetInventory {
  const target = item.name.trim();
  const existing = inv.items.find(
    (entry) =>
      entry.name.trim() === target &&
      (entry.effect ?? null) === (item.effect ?? null) &&
      (entry.weight ?? null) === (item.weight ?? null),
  );
  if (existing) existing.qty += qty;
  else inv.items.push({ ...item, name: target, qty });
  return inv;
}

function updateInvItem(
  inv: SheetInventory,
  name: string,
  patch: { name?: string; effect?: string; weight?: number | null },
): SheetInventory {
  const item = findInvItem(inv, name);
  if (!item) return inv;
  if (patch.name !== undefined) item.name = patch.name;
  if (patch.effect !== undefined) item.effect = patch.effect;
  if (patch.weight !== undefined) item.weight = patch.weight;
  return inv;
}

// 같은 무기가 여러 개 쌓여 있어도 1개만 분리해 변형 (강화·인첸트는 하나씩만 적용).
function transformOneInvItem(
  inv: SheetInventory,
  name: string,
  patch: { name: string; effect: string; weight?: number | null },
): SheetInventory {
  const item = findInvItem(inv, name);
  if (!item) return inv;
  // 1개뿐이면 제자리에서 변형, 여러 개면 1개만 떼어내 새 항목으로.
  if (item.qty <= 1) return updateInvItem(inv, name, patch);
  item.qty -= 1;
  return addInvItem(
    inv,
    {
      name: patch.name,
      effect: patch.effect,
      weight: patch.weight !== undefined ? patch.weight : item.weight,
    },
    1,
  );
}

function appendEffect(current: string | null, line: string): string {
  return current ? `${current}\n${line}` : line;
}

// "강철 검(+1, 사파이어)" → "강철 검" : 강화·인첸트 꼬리표를 떼어 기본 이름만.
function baseItemName(name: string): string {
  return name.trim().replace(/\s*\([^()]*\)\s*$/, "").trim();
}

// 아이템 도감(아이템 탭)의 설명을 가져온다 — 강화/제련 아이템도 기본 설명을 보존하기 위함.
async function lookupItemDesc(name: string): Promise<string | null> {
  const exact = name.trim();
  const base = baseItemName(name);
  const item = await prisma.item.findFirst({
    where: { OR: [{ id: exact }, { name: exact }, { id: base }, { name: base }] },
    select: { desc: true },
  });
  return item?.desc ?? null;
}

// 정확히 보석 이름인지 (예: "다이아몬드"). 인첸트된 무기 이름은 보석으로 인정하지 않음.
function isGemName(name: string): boolean {
  const target = name.trim();
  return GEM_EFFECTS.some((gem) => gem.key === target);
}

function gemEffect(gemName: string): string {
  const target = gemName.trim();
  return GEM_EFFECTS.find((gem) => gem.key === target)?.text ?? `${target} 인첸트`;
}

function gemTag(gemName: string): string {
  const target = gemName.trim();
  return GEM_EFFECTS.find((gem) => gem.key === target)?.key ?? target;
}

function itemTags(itemName: string): string[] {
  const match = itemName.trim().match(/\(([^()]*)\)$/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function hasTag(itemName: string, tag: string): boolean {
  return itemTags(itemName).includes(tag);
}

function enhancementLevel(itemName: string): number {
  const tag = itemTags(itemName).find((value) => /^\+\d+$/.test(value));
  return tag ? parseInt(tag.slice(1), 10) : 0;
}

function hasMagicTag(itemName: string): boolean {
  const tags = itemTags(itemName);
  return GEM_EFFECTS.some((gem) => tags.includes(gem.key));
}

function addItemTag(itemName: string, tag: string): string {
  const trimmed = itemName.trim();
  const match = trimmed.match(/^(.*)\(([^()]*)\)$/);
  if (!match) return `${trimmed}(${tag})`;

  const baseName = match[1].trim();
  const tags = match[2]
    .split(",")
    .map((existing) => existing.trim())
    .filter(Boolean);
  if (!tags.includes(tag)) tags.push(tag);
  return `${baseName}(${tags.join(", ")})`;
}

function setEnhancementTag(itemName: string, level: number): string {
  const trimmed = itemName.trim();
  const nextTag = `+${level}`;
  const match = trimmed.match(/^(.*)\(([^()]*)\)$/);
  if (!match) return `${trimmed}(${nextTag})`;

  const baseName = match[1].trim();
  const tags = match[2]
    .split(",")
    .map((existing) => existing.trim())
    .filter((existing) => existing && !/^\+\d+$/.test(existing));
  return `${baseName}(${[nextTag, ...tags].join(", ")})`;
}

function materialForEnhancement(level: number): string {
  return level === 1 ? STEEL_FRAGMENT : MOON_FRAGMENT;
}

async function currentSheet(): Promise<{
  userId: string;
  nickname: string;
  tab: string;
  locationId: string | null;
  ap: number | null;
  apResetAt: Date | null;
  charClass: string | null;
  curGold: number | null;
  achStatsJson: string | null;
  adventurerRank: string | null;
  inv: SheetInventory;
  invFromSheet: boolean;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return null;

  // 가방 기준은 DB(invJson). 매 액션마다 시트를 읽던 네트워크 왕복을 제거.
  return {
    userId: user.id,
    nickname: user.nickname,
    tab: sheet.sheetTab,
    locationId: sheet.locationId,
    ap: sheet.ap,
    apResetAt: sheet.apResetAt,
    charClass: sheet.charClass,
    curGold: sheet.curGold,
    achStatsJson: sheet.achStatsJson,
    adventurerRank: sheet.adventurerRank,
    inv: parseInv(sheet.invJson),
    invFromSheet: !!sheet.invJson,
  };
}


function lifeShopProduct(productId: string): LifeShopProduct | null {
  return LIFE_SHOP_ITEMS.find((item) => item.id === productId) ?? null;
}

function foodProduct(productId: string) {
  return FOOD_ITEMS.find((item) => item.id === productId) ?? null;
}

export async function promoteAdventurerRank(
  _prev: GuildState,
  _formData: FormData,
): Promise<GuildState> {
  void _prev;
  void _formData;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { adventurerRank: true, fame: true },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };

  const current = normalizeAdventurerRank(sheet.adventurerRank);
  const next = nextAdventurerRank(current);
  if (!next) return { error: "이미 최고 등급입니다." };

  const goal = adventurerRankGoal(current);
  const fame = sheet.fame ?? 0;
  if (fame < goal) {
    return { error: `명성이 부족합니다. (${fame.toLocaleString()} / ${goal.toLocaleString()})` };
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      adventurerRank: next,
      fame: fame - goal,
    },
  });
  await checkAndGrant(user.id);

  revalidatePath("/world");
  revalidatePath("/profile");
  revalidatePath(`/u/${user.username}`);
  return { ok: `길드 등급이 ${current}에서 ${next}로 상승했습니다.` };
}

function parseRecipeIngredients(value: string): { name: string; qty: number }[] {
  try {
    return JSON.parse(value) as { name: string; qty: number }[];
  } catch {
    return [];
  }
}

function ingredientKey(items: { name: string; qty: number }[]): string {
  return items
    .filter((item) => item.qty > 0)
    .map((item) => ({ name: item.name.trim(), qty: item.qty }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((item) => `${item.name}x${item.qty}`)
    .join("|");
}

function ingredientsFromForm(formData: FormData): { name: string; qty: number }[] {
  const names = formData
    .getAll("ingredient")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const byName = new Map<string, number>();
  for (const name of names) byName.set(name, (byName.get(name) ?? 0) + 1);
  return [...byName.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

async function canUsePublicKitchen(locationId: string | null): Promise<boolean> {
  if (!locationId) return false;
  const [location, actions] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } }),
    prisma.locationAction.findMany({
      where: { locationId },
      select: { kind: true, label: true },
    }),
  ]);
  const source = [location?.id ?? "", location?.name ?? "", ...actions.flatMap((a) => [a.kind, a.label ?? ""])]
    .join(" ")
    .toLowerCase();
  return ["상점", "시장", "주방", "요리", "식료품", "market", "kitchen"].some((keyword) =>
    source.includes(keyword.toLowerCase()),
  );
}

function lifeItemQty(life: ReturnType<typeof parseLifeState>, name: string): number {
  const target = name.trim();
  return (["낚시", "채집", "채광"] as const).reduce(
    (sum, kind) =>
      sum +
      life.bags[kind].items
        .filter((item) => item.name.trim() === target)
        .reduce((inner, item) => inner + Math.max(0, item.qty), 0),
    0,
  );
}

function consumeLifeItem(life: ReturnType<typeof parseLifeState>, name: string, qty: number): number {
  const target = name.trim();
  let remaining = qty;
  for (const kind of ["낚시", "채집", "채광"] as const) {
    for (const item of life.bags[kind].items) {
      if (item.name.trim() !== target || remaining <= 0) continue;
      const used = Math.min(item.qty, remaining);
      item.qty -= used;
      remaining -= used;
    }
    life.bags[kind].items = life.bags[kind].items.filter((item) => item.qty > 0);
  }
  return qty - remaining;
}

function availableIngredientQty(inv: SheetInventory, life: ReturnType<typeof parseLifeState>, name: string): number {
  return itemQty(inv, name) + lifeItemQty(life, name);
}

async function consumeIngredient(
  userId: string,
  inv: SheetInventory,
  life: ReturnType<typeof parseLifeState>,
  name: string,
  qty: number,
): Promise<SheetInventory> {
  let remaining = qty;
  const fromLife = consumeLifeItem(life, name, remaining);
  remaining -= fromLife;
  if (remaining > 0) {
    consumeInvItem(inv, name, remaining);
    await decrementDbInventory(userId, name, remaining);
  }
  return inv;
}

function toolTier(toolName: string): number {
  if (toolName === "고급 낚싯대" || toolName === "장인의 채집 도구" || toolName === "미스릴 곡괭이") return 2;
  if (toolName === "좋은 낚싯대" || toolName === "숙련 채집 도구" || toolName === "철 곡괭이") return 1;
  return 0;
}

async function decrementDbInventory(userId: string, itemName: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
  if (!item) return;

  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: item.id, meta: null },
  });
  if (!existing) return;

  await prisma.inventoryEntry.update({
    where: { id: existing.id },
    data: { qty: Math.max(0, existing.qty - qty) },
  });
}

async function incrementDbInventory(userId: string, itemName: string, qty: number): Promise<void> {
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
    return;
  }

  await prisma.inventoryEntry.create({ data: { userId, itemId: item.id, qty } });
}

async function storageBox(userId: string): Promise<{ id: string; maxWeight: number }> {
  return prisma.storageBox.upsert({
    where: { userId },
    update: {},
    create: { userId, maxWeight: 30 },
    select: { id: true, maxWeight: true },
  });
}

async function storageWeight(boxId: string): Promise<number> {
  const entries = await prisma.storageEntry.findMany({
    where: { boxId, qty: { gt: 0 } },
    select: { weight: true, qty: true },
  });
  return entries.reduce((sum, item) => sum + (item.weight ?? 0) * Math.max(0, item.qty), 0);
}

function removeLifeBagItem(
  life: ReturnType<typeof parseLifeState>,
  kind: LifeSkillKind,
  itemName: string,
  qty: number,
) {
  const bag = life.bags[kind];
  const item = bag.items.find((entry) => entry.name === itemName);
  if (!item || item.qty < qty) return null;
  item.qty -= qty;
  bag.items = bag.items.filter((entry) => entry.qty > 0);
  return {
    name: item.name,
    effect: `R${item.rank} · ${item.text}`,
    weight: item.weight,
    rank: item.rank,
    text: item.text,
  };
}

function parseLifeEffectSnapshot(effect: string | null | undefined): { rank: number | null; text: string | null } {
  if (!effect) return { rank: null, text: null };
  const match = effect.match(/^R(\d+)\s*·\s*(.*)$/);
  if (!match) return { rank: null, text: effect };
  return {
    rank: Number(match[1]),
    text: match[2]?.trim() || null,
  };
}

function formQty(formData: FormData): number {
  return Math.max(1, Math.min(99, Number(formData.get("qty") ?? 1) || 1));
}

export async function depositToStorage(
  _prev: StorageState,
  formData: FormData,
): Promise<StorageState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  const sourceKindRaw = String(formData.get("sourceKind") ?? "basic");
  const sourceKind =
    sourceKindRaw === "낚시" || sourceKindRaw === "채집" || sourceKindRaw === "채광"
      ? sourceKindRaw
      : null;
  const qty = formQty(formData);

  let item:
    | {
        name: string;
        effect: string | null;
        weight: number | null;
        qty?: number;
        rank?: number | null;
        text?: string | null;
      }
    | null = null;
  let inv: SheetInventory | null = null;
  let nextLifeJson: string | null = null;

  if (sourceKind) {
    const sheet = await prisma.characterSheet.findUnique({
      where: { userId: ctx.userId },
      select: { lifeJson: true },
    });
    const life = parseLifeState(sheet?.lifeJson);
    item = removeLifeBagItem(life, sourceKind, itemName, qty);
    if (!item) return { error: "보관할 생활 아이템 수량이 부족합니다." };
    nextLifeJson = JSON.stringify(life);
  } else {
    if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };
    item = findInvItem(ctx.inv, itemName);
    if (!item || (item.qty ?? 0) < qty) return { error: "보관할 아이템 수량이 부족합니다." };
  }

  const box = await storageBox(ctx.userId);
  const usedWeight = await storageWeight(box.id);
  const movingWeight = (item.weight ?? 0) * qty;
  const boxLimit = box.maxWeight + storageWeightBonus(ctx.adventurerRank); // C랭크+ +10
  if (usedWeight + movingWeight > boxLimit) {
    return { error: `창고 중량이 부족합니다. (${usedWeight + movingWeight}/${boxLimit})` };
  }

  if (!sourceKind) {
    inv = consumeInvItem(ctx.inv, item.name, qty);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  }
  const achStatsJson = bumpStat(ctx.achStatsJson, "창고보관횟수");

  const existing = await prisma.storageEntry.findFirst({
    where: {
      boxId: box.id,
      sourceKind,
      name: item.name,
      effect: item.effect,
      weight: item.weight,
      rank: item.rank ?? null,
      text: item.text ?? null,
    },
  });

  await Promise.all([
    existing
      ? prisma.storageEntry.update({
          where: { id: existing.id },
          data: { qty: existing.qty + qty },
        })
      : prisma.storageEntry.create({
          data: {
            boxId: box.id,
            sourceKind,
            name: item.name,
            effect: item.effect,
            weight: item.weight,
            rank: item.rank ?? null,
            text: item.text ?? null,
            qty,
          },
        }),
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: sourceKind
        ? { lifeJson: nextLifeJson, achStatsJson }
        : { invJson: JSON.stringify(inv), achStatsJson },
    }),
    sourceKind ? Promise.resolve() : decrementDbInventory(ctx.userId, item.name, qty),
  ]);

  await checkAndGrant(ctx.userId);
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${item.name} x${qty} 보관 완료.` };
}

export async function withdrawFromStorage(
  _prev: StorageState,
  formData: FormData,
): Promise<StorageState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const entryId = String(formData.get("entryId") ?? "").trim();
  const qty = formQty(formData);
  const entry = await prisma.storageEntry.findFirst({
    where: { id: entryId, box: { userId: ctx.userId } },
    include: { box: { select: { userId: true } } },
  });
  if (!entry || entry.qty < qty) return { error: "꺼낼 아이템 수량이 부족합니다." };

  const sourceKind =
    entry.sourceKind === "낚시" || entry.sourceKind === "채집" || entry.sourceKind === "채광"
      ? entry.sourceKind
      : null;
  if (sourceKind) {
    await loadLifeItems();
    const lifeItem = findLifeSkillItem(sourceKind, entry.name);
    const effectSnapshot = parseLifeEffectSnapshot(entry.effect);
    const sheet = await prisma.characterSheet.findUnique({
      where: { userId: ctx.userId },
      select: { lifeJson: true },
    });
    const life = parseLifeState(sheet?.lifeJson);
    const bag = life.bags[sourceKind];
    const currentWeight = lifeBagWeight(bag);
    const movingWeight = (entry.weight ?? 0) * qty;
    const maxWeight = lifeBagLimit(life, sourceKind);
    if (currentWeight + movingWeight > maxWeight) {
      return { error: `${bag.name} 중량이 부족합니다. (${currentWeight + movingWeight}/${maxWeight})` };
    }
    for (let i = 0; i < qty; i++) {
      addLifeBagItem(life, sourceKind, {
        name: entry.name,
        weight: entry.weight ?? lifeItem?.weight ?? 1,
        rank: entry.rank ?? effectSnapshot.rank ?? lifeItem?.rank ?? 0,
        text: entry.text ?? effectSnapshot.text ?? lifeItem?.text ?? entry.effect ?? "",
      });
    }
    await Promise.all([
      entry.qty === qty
        ? prisma.storageEntry.delete({ where: { id: entry.id } })
        : prisma.storageEntry.update({
            where: { id: entry.id },
            data: { qty: entry.qty - qty },
          }),
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: { lifeJson: JSON.stringify(life) },
      }),
    ]);
    revalidatePath("/world");
    revalidatePath("/profile");
    return { ok: `${entry.name} x${qty} ${bag.name}으로 꺼내기 완료.` };
  }

  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };
  const curWeight = inventoryWeightTotal(ctx.inv.items) ?? ctx.inv.curWeight ?? 0;
  const movingWeight = (entry.weight ?? 0) * qty;
  if (ctx.inv.maxWeight != null && curWeight + movingWeight > ctx.inv.maxWeight) {
    return { error: `가방 중량이 부족합니다. (${curWeight + movingWeight}/${ctx.inv.maxWeight})` };
  }

  const inv = addInvItem(
    ctx.inv,
    { name: entry.name, effect: entry.effect, weight: entry.weight },
    qty,
  );
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;

  await Promise.all([
    entry.qty === qty
      ? prisma.storageEntry.delete({ where: { id: entry.id } })
      : prisma.storageEntry.update({
          where: { id: entry.id },
          data: { qty: entry.qty - qty },
        }),
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    incrementDbInventory(ctx.userId, entry.name, qty),
  ]);

  revalidatePath("/world");
  return { ok: `${entry.name} x${qty} 꺼내기 완료.` };
}

export async function buyFood(_prev: MarketState, formData: FormData): Promise<MarketState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const product = foodProduct(String(formData.get("productId") ?? ""));
  if (!product) return { error: "판매 목록에 없는 식료품입니다." };
  const qty = formQty(formData);
  // 골드 단일 기준 = curGold (DB). 시트/invJson은 표시·연동용 미러.
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const totalPrice = product.buyPrice * qty;
  if (currentGold < totalPrice) {
    return { error: `골드가 부족합니다. (${currentGold.toLocaleString()}G/${totalPrice.toLocaleString()}G)` };
  }

  const curWeight = inventoryWeightTotal(ctx.inv.items) ?? ctx.inv.curWeight ?? 0;
  const movingWeight = product.weight * qty;
  if (ctx.inv.maxWeight != null && curWeight + movingWeight > ctx.inv.maxWeight) {
    return { error: `가방 중량이 부족합니다. (${curWeight + movingWeight}/${ctx.inv.maxWeight})` };
  }

  const inv = addInvItem(ctx.inv, {
    name: product.name,
    effect: product.desc,
    weight: product.weight,
  }, qty);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  inv.gold = `${currentGold - totalPrice}G`;

  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        curGold: currentGold - totalPrice,
        gold: `${currentGold - totalPrice}G`,
        invJson: JSON.stringify(inv),
      },
    }),
    incrementDbInventory(ctx.userId, product.name, qty),
  ]);
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${product.name} x${qty} 구매 완료.` };
}

export async function sellFood(_prev: MarketState, formData: FormData): Promise<MarketState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const product = foodProduct(String(formData.get("productId") ?? ""));
  if (!product) return { error: "판매 목록에 없는 식료품입니다." };
  const qty = formQty(formData);
  if (itemQty(ctx.inv, product.name) < qty) {
    return { error: `${product.name} 수량이 부족합니다.` };
  }

  // 골드 단일 기준 = curGold (DB). 시트/invJson은 표시·연동용 미러.
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const nextGold = currentGold + product.sellPrice * qty;
  const inv = consumeInvItem(ctx.inv, product.name, qty);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  inv.gold = `${nextGold}G`;

  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        curGold: nextGold,
        gold: `${nextGold}G`,
        invJson: JSON.stringify(inv),
      },
    }),
    decrementDbInventory(ctx.userId, product.name, qty),
  ]);
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${product.name} x${qty} 판매 완료. +${(product.sellPrice * qty).toLocaleString()}G` };
}

// 요리 등급 추첨 — 레벨이 높을수록 좋은 등급 확률↑.
// 장인작(요리사 이름 새김): 고렙에서만 희귀 / 명품: Lv15+ / 고품질: 흔함.
function isChushiClass(charClass: string | null | undefined): boolean {
  return (charClass ?? "").replace(/\s+/g, "").includes("츄시");
}

function cookGradeRates(levelRaw: number, isChushi: boolean): { signature: number; master: number; hq: number } {
  const level = Math.max(1, Math.floor(levelRaw || 1));
  return {
    signature: Math.max(0, Math.min(isChushi ? 12 : 10, (level - 25) * (isChushi ? 0.48 : 0.4))),
    master: Math.max(0, Math.min(isChushi ? 14 : 12, (level - 15) * (isChushi ? 0.7 : 0.6))),
    hq: Math.min(isChushi ? 50 : 45, (isChushi ? 8 : 6) + level * (isChushi ? 1.1 : 1)),
  };
}

function rollCookGrade(level: number, isChushi: boolean): string | null {
  const r = Math.random() * 100;
  const { signature, master, hq } = cookGradeRates(level, isChushi);
  if (r < signature) return "장인";
  if (r < signature + master) return "명품";
  if (r < signature + master + hq) return "고품질";
  return null;
}

export async function cookDish(_prev: CookingState, formData: FormData): Promise<CookingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const facility = String(formData.get("facility") ?? "public");
  // 집 주방은 본인 집만 — 친구 집에 놀러 간 상태는 해당 없음
  const atHome =
    isHomeLocationId(ctx.locationId) && homeOwnerFromLocationId(ctx.locationId) === ctx.userId;
  const canPublic = await canUsePublicKitchen(ctx.locationId);
  const maxIngredients = atHome || facility === "home" ? 4 : 3;
  if (facility === "home" && !atHome) return { error: "집 주방은 본인 집에서만 사용할 수 있어요." };
  if (facility !== "home" && !canPublic) return { error: "이 장소에서는 공용 주방을 사용할 수 없어요." };

  const ingredients = ingredientsFromForm(formData);
  const totalIngredients = ingredients.reduce((sum, item) => sum + item.qty, 0);
  if (totalIngredients <= 0) return { error: "재료를 하나 이상 넣어주세요." };
  if (totalIngredients > maxIngredients) {
    return { error: `이 주방에서는 재료를 최대 ${maxIngredients}개까지만 넣을 수 있어요.` };
  }

  const fresh = regenFatigue(ctx.ap, ctx.apResetAt);
  if (fresh.value < COOKING_AP_COST) {
    return { error: `피로도가 부족합니다. (${fresh.value}/${COOKING_AP_COST})` };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { lifeJson: true, achStatsJson: true },
  });
  const life = parseLifeState(sheet?.lifeJson);
  for (const ingredient of ingredients) {
    const have = availableIngredientQty(ctx.inv, life, ingredient.name);
    if (have < ingredient.qty) {
      return { error: `${ingredient.name} 수량이 부족합니다. (${have}/${ingredient.qty})` };
    }
  }

  const recipes = await prisma.cookingRecipe.findMany({ orderBy: { order: "asc" } });
  const key = ingredientKey(ingredients);
  const recipe =
    recipes.find((item) => ingredientKey(parseRecipeIngredients(item.ingredientsJson)) === key) ?? null;

  // 등급 해금 게이트 없음 — 재료 수급이 실질 제한이라 요리 레벨 조건은 두지 않는다.
  let inv = ctx.inv;
  for (const ingredient of ingredients) {
    inv = await consumeIngredient(ctx.userId, inv, life, ingredient.name, ingredient.qty);
  }

  // 등급 추첨 — 요리레벨 비례. 장인작이면 요리사 닉네임이 새겨진다("{닉네임}의 {이름}").
  const grade = recipe ? rollCookGrade(life.cooking.level, isChushiClass(ctx.charClass)) : null;
  const gi = gradeInfo(grade);
  const result = recipe
    ? (() => {
        const bonus = gi?.effectBonus ?? 0;
        const price = Math.round(recipe.sellPrice * (gi?.priceMult ?? 1));
        const baseEffect = recipe.effect ? (bonus > 0 ? enhanceEffectText(recipe.effect, bonus) : recipe.effect) : "";
        const durText = recipe.duration ? ` (${recipe.duration})` : "";
        const label = grade === "장인" ? `✨${ctx.nickname}의 서명작 — ` : grade ? `✨${grade} — ` : "";
        const effect = baseEffect
          ? `${label}${baseEffect}${durText}\n판매가 ${price}G`
          : `${grade ? `✨${grade}\n` : ""}판매가 ${price}G`;
        return {
          name: buildCookedName(recipe.resultName, grade, ctx.nickname),
          qty: recipe.resultQty,
          effect,
          weight: recipe.weight,
          sellPrice: price,
        };
      })()
    : { ...FAILED_DISH, qty: 1 };
  inv = addInvItem(inv, { name: result.name, effect: result.effect, weight: result.weight }, result.qty);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;

  const discovered = recipe
    ? await prisma.userRecipe
        .create({
          data: { userId: ctx.userId, recipeId: recipe.id },
        })
        .then(() => true)
        .catch(() => false)
    : false;

  const cookingLevels = recipe ? applyCookingExp(life, Math.max(1, recipe.skillExp)) : [];

  let achStats = recipe ? bumpStat(sheet?.achStatsJson, "요리성공횟수") : (sheet?.achStatsJson ?? null);
  if (recipe) {
    achStats = setMaxStat(achStats, "요리최고등급", recipeRankNumber(recipe.rank));
    // 제작 등급(고품질1·명품2·장인3) — '희귀/걸작 요리' 업적 판정용
    if (grade) achStats = setMaxStat(achStats, "요리최고제작등급", COOK_GRADE_NUMBER[grade] ?? 0);
    for (const tag of cookingTagTokens(recipe)) {
      achStats = bumpStat(achStats, `요리태그:${tag}`);
    }
  }
  if (discovered) achStats = bumpStat(achStats, "요리레시피수");

  // 실패(레시피 불일치) 시 소모 피로도의 절반을 돌려준다.
  const apCost = recipe ? COOKING_AP_COST : COOKING_AP_COST - Math.floor(COOKING_AP_COST / 2);
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        ap: fresh.value - apCost,
        apResetAt: fresh.at,
        invJson: JSON.stringify(inv),
        lifeJson: JSON.stringify(life),
        achStatsJson: achStats,
      },
    }),
    incrementDbInventory(ctx.userId, result.name, result.qty),
  ]);
  void appendSheetItem(ctx.tab, result.name, result.qty, {
    effect: result.effect,
    weight: result.weight,
  });
  await checkAndGrant(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  if (!recipe) {
    return {
      ok: `조합이 맞지 않았어요. ${FAILED_DISH.name} x1 획득. 피로도 -${apCost} (실패라 절반만 소모)`,
    };
  }
  return {
    ok: [
      grade === "장인" ? `✨${ctx.nickname}의 서명작 완성!` : grade ? `✨${grade} 요리 성공!` : "",
      discovered
        ? `새 레시피 발견! ${recipe.name} 완성. ${result.name} x${result.qty} 획득.`
        : `${recipe.name} 완성. ${result.name} x${result.qty} 획득.`,
      `요리 숙련도 +${Math.max(1, recipe.skillExp)}`,
      cookingLevels.length > 0 ? `요리 Lv.${cookingLevels.at(-1)} 달성.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export async function sellCookedFood(
  _prev: CookingState,
  formData: FormData,
): Promise<CookingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  const qty = formQty(formData);
  if (!itemName) return { error: "판매할 요리가 올바르지 않습니다." };
  if (itemQty(ctx.inv, itemName) < qty) return { error: `${itemName} 수량이 부족합니다.` };

  const { base, grade } = parseCookedName(itemName);
  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: base },
    select: { sellPrice: true },
  });
  const baseUnit = base === FAILED_DISH.name ? FAILED_DISH.sellPrice : recipe?.sellPrice;
  if (!baseUnit) return { error: "요리 판매가를 찾지 못했습니다." };
  const unitPrice = Math.round(baseUnit * (gradeInfo(grade)?.priceMult ?? 1));

  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const gain = unitPrice * qty;
  const nextGold = currentGold + gain;
  const inv = consumeInvItem(ctx.inv, itemName, qty);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  inv.gold = `${nextGold}G`;

  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        curGold: nextGold,
        gold: `${nextGold}G`,
        invJson: JSON.stringify(inv),
      },
    }),
    decrementDbInventory(ctx.userId, itemName, qty),
  ]);
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${itemName} x${qty} 판매 완료. +${gain.toLocaleString()}G` };
}

function parseLifeLuck(effect: string): { kind: LifeSkillKind | "both"; amount: number } | null {
  const match = effect.match(/(?:낚시·채집|낚시|채집)\s*행운\s*\+(\d+)/);
  if (!match) return null;
  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (effect.includes("낚시·채집")) return { kind: "both", amount };
  if (effect.includes("낚시")) return { kind: "낚시", amount };
  if (effect.includes("채집")) return { kind: "채집", amount };
  return null;
}

function parseSessionBuff(effect: string): string | null {
  const match = effect.match(/세션\s*버프\s*:\s*([^\n(]+)/);
  return match?.[1]?.trim() || null;
}

// "30분 동안 감지 판정 +1" — 월드 판정 버프 (행동·탐색·던전 판정에 적용).
// '원하는 능력/모든 능력'은 '모든'으로 저장. "세션 버프: ..." 형식은 세션 쪽에서 처리.
function parseStatBuff(effect: string): { label: string; amount: number } | null {
  if (/세션\s*버프/.test(effect)) return null;
  const match = effect.match(
    /(근력|재주|민첩|지력|감지|정신|행운|원하는\s*능력|모든\s*능력)\s*판정\s*\+(\d+)/,
  );
  if (!match) return null;
  const amount = Number.parseInt(match[2], 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const label = /능력/.test(match[1]) ? "모든" : match[1];
  return { label, amount };
}

function rollD6(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 1 + Math.floor(Math.random() * 6);
  return sum;
}

// "HP [2D] 회복", "MP 3 회복" 등 회복 효과를 파싱해 굴린 회복량 목록을 반환.
function parseRecovery(effect: string): { resource: "HP" | "MP"; amount: number }[] {
  const out: { resource: "HP" | "MP"; amount: number }[] = [];
  // "HP [2D] 회복", "HP [2D]+1 회복"(주사위+평탄), "MP 3 회복"(평탄) 모두 처리
  const re = /\b(HP|MP)\s*(?:\[(\d+)\s*D\](?:\s*\+\s*(\d+))?|(\d+))\s*점?\s*회복/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(effect))) {
    const resource = m[1].toUpperCase() as "HP" | "MP";
    const amount = m[2] ? rollD6(Number(m[2])) + (m[3] ? Number(m[3]) : 0) : Number(m[4]);
    if (amount > 0) out.push({ resource, amount });
  }
  return out;
}

// 피로도(AP) 회복량 — "피로도 [2D] 회복", "피로도 50 회복". 순수 아이템(요리 아님)에서만 적용해
// 음식으로 AP 상한을 우회하는 밸런스 붕괴를 막는다. GM이 우편/던전으로 배포하는 회복제 전용.
function parseApRecovery(effect: string): number {
  const m = effect.match(/(?:피로도|스태미나|AP)\s*(?:\[(\d+)\s*D\](?:\s*\+\s*(\d+))?|(\d+))\s*점?\s*(?:회복|충전)/i);
  if (!m) return 0;
  if (m[1]) return rollD6(Number(m[1])) + (m[2] ? Number(m[2]) : 0);
  return Number(m[3] ?? 0);
}

function recipeRankNumber(rank: string | null | undefined): number {
  const match = String(rank ?? "").match(/R\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

// rollCookGrade 결과 → 서열 숫자 (업적 '요리등급' 판정과 짝)
const COOK_GRADE_NUMBER: Record<string, number> = { 고품질: 1, 명품: 2, 장인: 3 };

function cookingTagTokens(recipe: { category: string; tags: string | null }): string[] {
  const tokens = new Set<string>();
  if (recipe.category.includes("생선")) tokens.add("생선");
  if (recipe.category.includes("채집")) tokens.add("채집");
  for (const tag of (recipe.tags ?? "").split(/[,，]/)) {
    const t = tag.trim();
    if (t) tokens.add(t);
  }
  return [...tokens];
}

function setMaxStat(json: string | null | undefined, name: string, value: number): string {
  let stats: Record<string, number> = {};
  try {
    if (json) stats = JSON.parse(json) as Record<string, number>;
  } catch {
    stats = {};
  }
  stats[name] = Math.max(stats[name] ?? 0, value);
  return JSON.stringify(stats);
}

export async function useCookingItem(
  _prev: CookingState,
  formData: FormData,
): Promise<CookingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) return { error: "사용할 요리가 올바르지 않습니다." };
  if (itemQty(ctx.inv, itemName) < 1) return { error: `${itemName}을 보유하고 있지 않습니다.` };

  const { base, grade } = parseCookedName(itemName);
  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: base },
    select: { effect: true, duration: true, tags: true },
  });
  const gradeBonus = gradeInfo(grade)?.effectBonus ?? 0;
  const baseEffect = recipe?.effect || findInvItem(ctx.inv, itemName)?.effect || "";
  // 등급(고품질·명품)이면 효과 수치를 등급 보너스만큼 강화해 적용.
  const rawEffect = gradeBonus > 0 && recipe?.effect ? enhanceEffectText(baseEffect, gradeBonus) : baseEffect;
  if (!rawEffect || base === FAILED_DISH.name) {
    return { error: "사용할 수 있는 요리 효과가 없습니다." };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { ap: true, apResetAt: true, lifeJson: true, achStatsJson: true, curHp: true, curMp: true, hp: true, mp: true },
  });
  if (!sheet) return { error: "캐릭터 시트를 찾지 못했습니다." };

  const now = new Date();
  const life = parseLifeState(sheet.lifeJson);
  life.cookingBuffs.lifeLuck = life.cookingBuffs.lifeLuck.filter(
    (buff) => Date.parse(buff.until) > now.getTime(),
  );

  let ok = "";
  // 피로도(AP) 회복은 요리에서 비활성 — 음식으로 AP 상한을 우회하면 밸런스가 깨짐.
  // AP 회복은 자연회복·여관·집 휴식으로만. (행운·세션 버프·HP/MP 회복은 유지)
  const lifeLuck = parseLifeLuck(rawEffect);
  const sessionBuff = parseSessionBuff(rawEffect);
  const statBuff = parseStatBuff(rawEffect);
  const recovery = parseRecovery(rawEffect);

  if (lifeLuck) {
    const until = new Date(now.getTime() + 30 * 60 * 1000);
    // 같은 종류(낚시/채집)엔 행운 버프 1개만 — 가장 높은 수치가 남는다.
    // 낚시·채집은 슬롯이 따로라, 낚시 버프는 채집 버프를 건드리지 않는다. (채광 등 확장 시 동일 규칙 적용)
    // 더 약한(미만) 요리는 소모하지 않고 거부. 같은 수치는 시간 갱신용으로 허용.
    const kindsOf = (k: LifeSkillKind | "both"): LifeSkillKind[] =>
      k === "both" ? ["낚시", "채집"] : [k];
    const bestFor = (k: LifeSkillKind) =>
      Math.max(
        0,
        ...life.cookingBuffs.lifeLuck
          .filter((b) => kindsOf(b.kind).includes(k))
          .map((b) => b.amount),
      );
    const applicable = kindsOf(lifeLuck.kind).filter((k) => lifeLuck.amount >= bestFor(k));
    if (applicable.length === 0) {
      const blocking = kindsOf(lifeLuck.kind)
        .map((k) => {
          const b = life.cookingBuffs.lifeLuck.find(
            (x) => kindsOf(x.kind).includes(k) && x.amount > lifeLuck.amount,
          );
          return b ? `${k} +${b.amount}(${b.source})` : null;
        })
        .filter(Boolean)
        .join(" · ");
      return { error: `이미 더 강한 행운 버프가 적용 중이라 사용하지 않았습니다. (${blocking})` };
    }
    // 대체되는 종류만 기존 버프에서 걷어낸다 — 낚시·채집 버프의 한쪽만 밀리면 남는 쪽으로 축소.
    const rest: typeof life.cookingBuffs.lifeLuck = [];
    for (const b of life.cookingBuffs.lifeLuck) {
      const remain = kindsOf(b.kind).filter((k) => !applicable.includes(k));
      if (remain.length === kindsOf(b.kind).length) rest.push(b);
      else if (remain.length === 1) rest.push({ ...b, kind: remain[0] });
    }
    for (const k of applicable) {
      rest.push({ kind: k, amount: lifeLuck.amount, until: until.toISOString(), source: itemName });
    }
    life.cookingBuffs.lifeLuck = rest;
    const skipped = kindsOf(lifeLuck.kind).filter((k) => !applicable.includes(k));
    ok = `${itemName}을 사용했습니다. 30분 동안 ${applicable.join("·")} 행운 +${lifeLuck.amount}${
      skipped.length > 0 ? ` (${skipped.join("·")}은 더 강한 버프 유지)` : ""
    }`;

    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          invJson: JSON.stringify(inv),
          lifeJson: JSON.stringify(life),
          achStatsJson: bumpStat(sheet.achStatsJson, "요리버프사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else if (sessionBuff) {
    life.cookingBuffs.session.unshift({
      source: itemName,
      effect: sessionBuff,
      usedAt: now.toISOString(),
    });
    life.cookingBuffs.session = life.cookingBuffs.session.slice(0, 12);
    ok = `${itemName}을 사용했습니다. 세션 버프: ${sessionBuff}`;

    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          invJson: JSON.stringify(inv),
          lifeJson: JSON.stringify(life),
          achStatsJson: bumpStat(sheet.achStatsJson, "요리버프사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else if (statBuff) {
    // 월드 판정 버프 — 같은 라벨엔 최고 수치 1개만. 약한 요리는 소모 없이 거부, 같은 수치는 시간 갱신.
    const until = new Date(now.getTime() + 30 * 60 * 1000);
    const existing = life.cookingBuffs.stat.find((b) => b.label === statBuff.label);
    if (existing && existing.amount > statBuff.amount) {
      return {
        error: `이미 더 강한 판정 버프가 적용 중이라 사용하지 않았습니다. (${
          existing.label === "모든" ? "모든 능력" : existing.label
        } 판정 +${existing.amount} · ${existing.source})`,
      };
    }
    life.cookingBuffs.stat = life.cookingBuffs.stat.filter((b) => b.label !== statBuff.label);
    life.cookingBuffs.stat.push({
      label: statBuff.label,
      amount: statBuff.amount,
      until: until.toISOString(),
      source: itemName,
    });
    ok = `${itemName}을 사용했습니다. 30분 동안 ${
      statBuff.label === "모든" ? "모든 능력" : statBuff.label
    } 판정 +${statBuff.amount}`;

    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          invJson: JSON.stringify(inv),
          lifeJson: JSON.stringify(life),
          achStatsJson: bumpStat(sheet.achStatsJson, "요리버프사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else if (recovery.length > 0) {
    // HP/MP 회복 — 굴린 회복량을 현재치에 더한다. 최대치(hp/mp)가 있으면 초과 방지.
    let curHp = sheet.curHp ?? sheet.hp ?? 0;
    let curMp = sheet.curMp ?? sheet.mp ?? 0;
    const gains: string[] = [];
    for (const rec of recovery) {
      if (rec.resource === "HP") {
        const before = curHp;
        curHp = sheet.hp != null ? Math.min(sheet.hp, curHp + rec.amount) : curHp + rec.amount;
        gains.push(`HP +${curHp - before}`);
      } else {
        const before = curMp;
        curMp = sheet.mp != null ? Math.min(sheet.mp, curMp + rec.amount) : curMp + rec.amount;
        gains.push(`MP +${curMp - before}`);
      }
    }
    ok = `${itemName}을 사용했습니다. ${gains.join(", ")}`;

    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          invJson: JSON.stringify(inv),
          curHp,
          curMp,
          achStatsJson: bumpStat(sheet.achStatsJson, "요리버프사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else if (!recipe && parseApRecovery(rawEffect) > 0) {
    // 피로도 회복제 — 요리가 아닌 순수 아이템(효과 "피로도 N 회복")만. 요리로는 AP 회복 불가.
    const heal = parseApRecovery(rawEffect);
    const fresh = regenFatigue(sheet.ap, sheet.apResetAt);
    const newAp = Math.min(FATIGUE_MAX, fresh.value + heal);
    ok = `${itemName}을 사용했습니다. 피로도 +${newAp - fresh.value} (${fresh.value} → ${newAp}/${FATIGUE_MAX})`;
    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          invJson: JSON.stringify(inv),
          ap: newAp,
          apResetAt: fresh.at,
          achStatsJson: bumpStat(sheet.achStatsJson, "피로도회복제사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else {
    return { error: "아직 자동 적용할 수 없는 효과입니다." };
  }

  await checkAndGrant(ctx.userId);
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok };
}

export async function sellLifeCatch(_prev: MarketState, formData: FormData): Promise<MarketState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const kindRaw = String(formData.get("kind") ?? "");
  const kind: LifeSkillKind | null =
    kindRaw === "낚시" || kindRaw === "채집" || kindRaw === "채광" ? kindRaw : null;
  if (!kind) return { error: "판매할 부산물 종류가 올바르지 않습니다." };
  await loadLifeItems();
  const itemName = String(formData.get("itemName") ?? "").trim();
  const qty = formQty(formData);

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { lifeJson: true },
  });
  const life = parseLifeState(sheet?.lifeJson);
  const removed = removeLifeBagItem(life, kind, itemName, qty);
  if (!removed) return { error: `${itemName} 수량이 부족합니다.` };

  const gain = lifeSkillSellPrice(kind, itemName) * qty;
  // 골드 단일 기준 = curGold (DB). 시트/invJson은 표시·연동용 미러.
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const nextGold = currentGold + gain;
  // 표시 골드는 invJson 캐시에서 읽으므로, 여기도 함께 갱신해야 화면에 즉시 반영됨.
  const inv = ctx.inv;
  inv.gold = `${nextGold}G`;

  await prisma.characterSheet.update({
    where: { userId: ctx.userId },
    data: {
      curGold: nextGold,
      gold: `${nextGold}G`,
      lifeJson: JSON.stringify(life),
      invJson: JSON.stringify(inv),
    },
  });
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${itemName} x${qty} 판매 완료. +${gain.toLocaleString()}G` };
}

export async function sellMaterial(_prev: MarketState, formData: FormData): Promise<MarketState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  const qty = formQty(formData);
  if (!itemName) return { error: "판매할 재료가 올바르지 않습니다." };
  if (isNonSellable(itemName)) return { error: "이 물건은 매입하지 않아요." };

  const item = await prisma.item.findFirst({
    where: {
      name: itemName,
      sellPrice: { gt: 0 },
      category: { in: SELLABLE_MATERIAL_CATEGORIES },
    },
    select: { sellPrice: true },
  });
  if (!item?.sellPrice) return { error: "이곳에서 매입하지 않는 물건입니다." };

  if (itemQty(ctx.inv, itemName) < qty) return { error: `${itemName} 수량이 부족합니다.` };

  const gain = item.sellPrice * qty;
  // 골드 단일 기준 = curGold (DB). 시트/invJson은 표시·연동용 미러.
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const nextGold = currentGold + gain;
  const inv = consumeInvItem(ctx.inv, itemName, qty);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  inv.gold = `${nextGold}G`;

  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        curGold: nextGold,
        gold: `${nextGold}G`,
        invJson: JSON.stringify(inv),
      },
    }),
    decrementDbInventory(ctx.userId, itemName, qty),
  ]);
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${itemName} x${qty} 판매 완료. +${gain.toLocaleString()}G` };
}

const INN_REST_COST = 100;
const INN_REST_AMOUNT = 60;

export async function restAtInn(): Promise<MarketState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { ap: true, apResetAt: true, restedAt: true, curGold: true, sheetTab: true },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };

  const now = new Date();
  if (restedTodayKst(sheet.restedAt, now)) {
    return { error: "오늘은 이미 여관에서 휴식했어요. (KST 자정 초기화)" };
  }

  const currentGold = sheet.curGold ?? 0;
  if (currentGold < INN_REST_COST) {
    return { error: `골드가 부족합니다. (${currentGold.toLocaleString()}G/${INN_REST_COST}G)` };
  }

  const fresh = regenFatigue(sheet.ap, sheet.apResetAt, now);
  if (fresh.value >= FATIGUE_MAX) {
    return { error: "피로도가 이미 가득 찼어요." };
  }
  const newAp = Math.min(FATIGUE_MAX, fresh.value + INN_REST_AMOUNT);
  const gained = newAp - fresh.value;
  const nextGold = currentGold - INN_REST_COST;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      ap: newAp,
      apResetAt: fresh.at,
      restedAt: now,
      curGold: nextGold,
      gold: `${nextGold}G`,
    },
  });
  void enqueueSheetGoldSync(user.id);

  revalidatePath("/world");
  revalidatePath("/profile");
  return {
    ok: `포근한 침대에서 푹 쉬었어요. 피로도 +${gained} (${newAp}/${FATIGUE_MAX}) · -${INN_REST_COST}G`,
  };
}

export async function buyHouse(
  _prev: HousingState,
  formData: FormData,
): Promise<HousingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const selected = houseOption(String(formData.get("tier") ?? ""));
  if (!selected) return { error: "판매 목록에 없는 집입니다." };

  const location = ctx.locationId
    ? await prisma.location.findUnique({
        where: { id: ctx.locationId },
        select: { id: true, name: true },
      })
    : null;
  if (!isBellTowerLocation(location)) {
    return { error: "집은 종탑 거리에서만 구매할 수 있어요." };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { houseTier: true, housingJson: true },
  });
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  const owned = ownedHouseOptions(housing);
  const alreadyOwned = housing.owned.includes(selected.tier);
  if (owned.length === 1 && alreadyOwned) {
    return { error: `이미 ${selected.name}을 보유 중입니다.` };
  }
  const refund = owned
    .filter((option) => option.tier !== selected.tier)
    .reduce((sum, option) => sum + houseSellPrice(option.tier), 0);
  const cost = alreadyOwned ? 0 : selected.price;

  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  if (currentGold + refund < cost) {
    return {
      error: `골드가 부족합니다. (${(currentGold + refund).toLocaleString()}G/${cost.toLocaleString()}G, 기존 집 매각금 포함)`,
    };
  }

  const nextGold = currentGold + refund - cost;
  const inv = ctx.inv;
  inv.gold = `${nextGold}G`;
  await prisma.characterSheet.update({
    where: { userId: ctx.userId },
    data: {
      houseTier: selected.tier,
      curGold: nextGold,
      gold: `${nextGold}G`,
      invJson: JSON.stringify(inv),
      // 가구(items)·문패 이름·상호작용 기록은 캐릭터 귀속 — 집을 옮겨도 유지
      housingJson: serializeHousingState({
        ...housing,
        owned: [selected.tier],
        furniture: { [selected.tier]: housing.furniture[selected.tier] ?? [] },
      }),
    },
  });
  void enqueueSheetGoldSync(ctx.userId);

  if (ctx.locationId) {
    await postSystem(
      ctx.locationId,
      refund > 0
        ? `🏠 ${ctx.nickname}님이 기존 집을 매각하고 ${selected.name}을 구매했습니다.`
        : `🏠 ${ctx.nickname}님이 ${selected.name}을 구매했습니다.`,
    );
  }
  revalidatePath("/world");
  revalidatePath("/profile");
  return {
    ok:
      refund > 0
        ? `${selected.name} 구매 완료. 기존 집 매각금 +${refund.toLocaleString()}G 반영.`
        : `${selected.name} 구매 완료. 종탑 거리에서 본인 집으로 이동할 수 있어요.`,
  };
}

export async function sellHouse(
  _prev: HousingState,
  formData: FormData,
): Promise<HousingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const selected = houseOption(String(formData.get("tier") ?? ""));
  if (!selected) return { error: "판매할 집을 찾지 못했습니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { houseTier: true, housingJson: true, locationId: true },
  });
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  if (!housing.owned.includes(selected.tier)) {
    return { error: `${selected.name}을 보유하고 있지 않습니다.` };
  }

  const refund = houseSellPrice(selected.tier);
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  const nextGold = currentGold + refund;
  const inv = ctx.inv;
  inv.gold = `${nextGold}G`;
  const remaining = housing.owned.filter((tier) => tier !== selected.tier);
  const nextFurniture = { ...housing.furniture };
  delete nextFurniture[selected.tier];

  let nextLocationId = sheet?.locationId ?? ctx.locationId;
  if (homeTierFromLocationId(nextLocationId) === selected.tier) {
    const locations = await prisma.location.findMany({
      select: { id: true, name: true },
      orderBy: { order: "asc" },
    });
    nextLocationId = locations.find((location) => isBellTowerLocation(location))?.id ?? null;
  }

  await prisma.characterSheet.update({
    where: { userId: ctx.userId },
    data: {
      houseTier: remaining[0] ?? null,
      // 가구는 집이 아니라 캐릭터 귀속 — 집을 팔아도 items 는 남는다
      housingJson: serializeHousingState({ ...housing, owned: remaining, furniture: nextFurniture }),
      curGold: nextGold,
      gold: `${nextGold}G`,
      invJson: JSON.stringify(inv),
      locationId: nextLocationId,
      enteredAt: nextLocationId !== sheet?.locationId ? new Date() : undefined,
    },
  });
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${selected.name} 판매 완료. +${refund.toLocaleString()}G` };
}

export async function restAtHome(): Promise<HousingState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: {
      ap: true,
      apResetAt: true,
      houseTier: true,
      housingJson: true,
      houseRestedAt: true,
      locationId: true,
      achStatsJson: true,
    },
  });
  const currentTier = homeTierFromLocationId(sheet?.locationId) ?? houseOption(sheet?.houseTier)?.tier ?? null;
  if (!sheet || !currentTier) return { error: "본인 집에서만 휴식할 수 있어요." };
  const housing = parseHousingState(sheet.housingJson, sheet.houseTier);
  if (!housing.owned.includes(currentTier)) return { error: "보유한 집이 아니에요." };
  if (!isHomeLocationId(sheet.locationId)) {
    return { error: "본인 집에서만 휴식할 수 있어요." };
  }
  // 친구 집에 놀러 간 상태에서는 휴식 불가 — 집 주인 본인만
  if (homeOwnerFromLocationId(sheet.locationId) !== user.id) {
    return { error: "본인 집에서만 휴식할 수 있어요." };
  }

  const option = houseOption(currentTier);
  if (!option) return { error: "집 정보가 올바르지 않아요." };

  const now = new Date();
  if (restedTodayKst(sheet.houseRestedAt, now)) {
    return { error: "오늘은 이미 집에서 휴식했어요. (KST 자정 초기화)" };
  }

  const fresh = regenFatigue(sheet.ap, sheet.apResetAt, now);
  if (fresh.value >= FATIGUE_MAX) {
    return { error: "피로도가 이미 가득 찼어요." };
  }

  const bedBonus = bedRestBonus(housing); // 침구류 가구 — 보유 침대 중 최고 보너스만 적용
  const newAp = Math.min(FATIGUE_MAX, fresh.value + option.restAmount + bedBonus);
  const gained = newAp - fresh.value;
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      ap: newAp,
      apResetAt: fresh.at,
      houseRestedAt: now,
      achStatsJson: bumpStat(sheet.achStatsJson, "집휴식횟수"),
    },
  });
  void checkAndGrant(user.id);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${option.name}에서 휴식했어요. 피로도 +${gained} (${newAp}/${FATIGUE_MAX})` };
}

// ── 가구 구매 — 종탑 거리(가구점) 또는 본인 집에서. 가구는 캐릭터 귀속(집을 옮겨도 유지) ──
export async function buyFurniture(
  _prev: HousingState,
  formData: FormData,
): Promise<HousingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const item = furnitureOption(String(formData.get("itemId") ?? ""));
  if (!item) return { error: "판매 목록에 없는 가구입니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { houseTier: true, housingJson: true, achStatsJson: true },
  });
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  if (housing.owned.length === 0) return { error: "집이 있어야 가구를 들일 수 있어요." };
  if (housing.items.includes(item.id)) return { error: `${item.name}은(는) 이미 보유 중이에요.` };

  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  if (currentGold < item.price) {
    return { error: `골드가 부족합니다. (${currentGold.toLocaleString()}G/${item.price.toLocaleString()}G)` };
  }

  const nextGold = currentGold - item.price;
  const inv = ctx.inv;
  inv.gold = `${nextGold}G`;
  await prisma.characterSheet.update({
    where: { userId: ctx.userId },
    data: {
      curGold: nextGold,
      gold: `${nextGold}G`,
      invJson: JSON.stringify(inv),
      housingJson: serializeHousingState({ ...housing, items: [...housing.items, item.id] }),
      achStatsJson: bumpStat(sheet?.achStatsJson, "가구구매횟수"),
    },
  });
  void enqueueSheetGoldSync(ctx.userId);
  void checkAndGrant(ctx.userId);

  revalidatePath("/world");
  return { ok: `${item.emoji} ${item.name}을(를) 집에 들였어요!` };
}

// ── 가구 상호작용 — 본인 집에서 하루 1회 (KST 자정 초기화) ──
export async function useFurniture(
  _prev: HousingState,
  formData: FormData,
): Promise<HousingState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const item = furnitureOption(String(formData.get("itemId") ?? ""));
  if (!item || !item.interactLabel) return { error: "상호작용할 수 없는 가구예요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: {
      ap: true,
      apResetAt: true,
      houseTier: true,
      housingJson: true,
      locationId: true,
      curGold: true,
      invJson: true,
      lifeJson: true,
    },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };
  if (
    !isHomeLocationId(sheet.locationId) ||
    homeOwnerFromLocationId(sheet.locationId) !== user.id
  ) {
    return { error: "본인 집에서만 사용할 수 있어요." };
  }
  const housing = parseHousingState(sheet.housingJson, sheet.houseTier);
  if (!housing.items.includes(item.id)) return { error: `${item.name}을(를) 보유하고 있지 않아요.` };

  const now = new Date();
  const lastUsed = housing.usedAt[item.id] ? new Date(housing.usedAt[item.id]) : null;
  if (lastUsed && restedTodayKst(lastUsed, now)) {
    return { error: `오늘은 이미 ${item.name}을(를) 사용했어요. (KST 자정 초기화)` };
  }

  const nextUsedAt = { ...housing.usedAt, [item.id]: now.toISOString() };
  const housingJson = serializeHousingState({ ...housing, usedAt: nextUsedAt });

  if (item.effect.type === "daily_ap") {
    const fresh = regenFatigue(sheet.ap, sheet.apResetAt, now);
    if (fresh.value >= FATIGUE_MAX) return { error: "피로도가 이미 가득 찼어요." };
    const newAp = Math.min(FATIGUE_MAX, fresh.value + item.effect.amount);
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { ap: newAp, apResetAt: fresh.at, housingJson },
    });
    revalidatePath("/world");
    return { ok: `${item.emoji} ${item.interactLabel} 완료! 피로도 +${newAp - fresh.value} (${newAp}/${FATIGUE_MAX})` };
  }

  if (item.effect.type === "daily_gold") {
    const { min, max } = item.effect;
    const gain = min + Math.floor(Math.random() * (max - min + 1));
    const currentGold = sheet.curGold ?? 0;
    const nextGold = currentGold + gain;
    let invJson = sheet.invJson;
    try {
      const inv = invJson
        ? (JSON.parse(invJson) as SheetInventory)
        : { gold: null, curWeight: null, maxWeight: null, items: [] };
      inv.gold = `${nextGold}G`;
      invJson = JSON.stringify(inv);
    } catch {
      invJson = sheet.invJson;
    }
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { curGold: nextGold, gold: `${nextGold}G`, invJson, housingJson },
    });
    void enqueueSheetGoldSync(user.id);
    revalidatePath("/world");
    return { ok: `${item.emoji} 짤랑! ${gain}G가 떨어졌다.` };
  }

  if (item.effect.type === "daily_forage") {
    const kind = item.effect.kind;
    const maxRank = item.effect.maxRank;
    await loadLifeItems();
    const pool = getActiveItems(kind).filter(
      (entry) => entry.rank <= maxRank && entry.rank >= 0 && entry.price > 0,
    );
    if (pool.length === 0) return { error: "지금은 나올 것이 없어 보인다." };
    const picked = pool[Math.floor(Math.random() * pool.length)];

    const life = parseLifeState(sheet.lifeJson);
    const bag = life.bags[kind];
    const bagWeight = lifeBagWeight(bag);
    const bagMax = lifeBagLimit(life, kind);
    if (bagWeight + picked.weight > bagMax) {
      return { error: `${bag.name}이 가득 차서 받을 수 없어요. (${bagWeight} + ${picked.weight} / ${bagMax})` };
    }
    addLifeBagItem(life, kind, {
      name: picked.name,
      weight: picked.weight,
      rank: picked.rank,
      text: picked.text,
    });
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { lifeJson: JSON.stringify(life), housingJson },
    });
    revalidatePath("/world");
    return { ok: `${item.emoji} ${item.interactLabel} 완료! ${picked.name}을(를) 얻었다. (${bag.name})` };
  }

  return { error: "상호작용할 수 없는 가구예요." };
}

// ── 문패 — 집 이름 짓기 (문패 가구 보유 시) ──
export async function renameHome(
  _prev: HousingState,
  formData: FormData,
): Promise<HousingState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const raw = String(formData.get("name") ?? "").trim();
  if (!raw) return { error: "집 이름을 입력해주세요." };
  if (raw.length > 16) return { error: "집 이름은 16자 이내로 지어주세요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { houseTier: true, housingJson: true },
  });
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  if (housing.owned.length === 0) return { error: "집이 있어야 이름을 지을 수 있어요." };
  if (!hasFurnitureEffect(housing, "nameplate")) {
    return { error: "문패를 먼저 구매해야 집 이름을 지을 수 있어요." };
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { housingJson: serializeHousingState({ ...housing, homeName: raw }) },
  });
  revalidatePath("/world");
  return { ok: `🪧 이제 이 집은 '${user.nickname}의 ${raw}'입니다.` };
}

export async function buyLifeGear(
  _prev: LifeShopState,
  formData: FormData,
): Promise<LifeShopState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };

  const product = lifeShopProduct(String(formData.get("productId") ?? ""));
  if (!product) return { error: "판매 목록에 없는 물품입니다." };

  // 골드 단일 기준 = curGold (DB). 시트/invJson은 표시·연동용 미러.
  const currentGold = ctx.curGold ?? (parseGoldToInt(ctx.inv.gold) || 0);
  if (currentGold < product.price) {
    return { error: `골드가 부족합니다. (${currentGold.toLocaleString()}G/${product.price.toLocaleString()}G)` };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { lifeJson: true },
  });
  const life = parseLifeState(sheet?.lifeJson);

  if (product.type === "bag") {
    const bag = life.bags[product.kind];
    if (bag.maxWeight >= product.maxWeight) {
      return { error: `이미 ${product.maxWeight}칸 이상의 ${product.kind} 가방을 보유 중입니다.` };
    }
    bag.name = product.name;
    bag.maxWeight = product.maxWeight;
  } else {
    const currentTier = toolTier(life.tools[product.kind]);
    if (currentTier >= product.tier) {
      return { error: `이미 같은 등급 이상의 ${product.kind} 장비를 보유 중입니다.` };
    }
    life.tools[product.kind] = product.name;
  }

  const nextGold = currentGold - product.price;
  // 표시 골드는 invJson 캐시에서 읽으므로, 여기도 함께 갱신해야 화면에 즉시 반영됨.
  const inv = ctx.inv;
  inv.gold = `${nextGold}G`;
  await prisma.characterSheet.update({
    where: { userId: ctx.userId },
    data: {
      curGold: nextGold,
      gold: `${nextGold}G`,
      lifeJson: JSON.stringify(life),
      invJson: JSON.stringify(inv),
    },
  });
  void enqueueSheetGoldSync(ctx.userId);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${product.name} 구매 완료. 남은 골드 ${nextGold.toLocaleString()}G` };
}

export async function upgradeWeapon(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const weaponName = String(formData.get("weaponName") ?? "").trim();
  const weaponLevel = Math.max(1, Math.min(4, Number(formData.get("level") ?? 1) || 1));
  const weapon = findInvItem(ctx.inv, weaponName);
  if (!weapon || weapon.qty <= 0) return { error: "강화할 무기를 인벤토리에서 찾지 못했습니다." };
  const nextEnhancement = enhancementLevel(weapon.name) + 1;
  const materialName = materialForEnhancement(nextEnhancement);
  if (nextEnhancement > 4) {
    return { error: "현재는 +4까지만 강화할 수 있습니다." };
  }
  if (itemQty(ctx.inv, materialName) < weaponLevel) {
    return { error: `${materialName}이 부족합니다. (${itemQty(ctx.inv, materialName)}/${weaponLevel})` };
  }

  const nextWeight = (weapon.weight ?? 0) + weaponLevel;
  // 효과가 비어 있으면 아이템 탭 기본 설명을 먼저 채워 시트 효과·해설에도 보존되게 한다.
  const baseEffect = weapon.effect ?? (await lookupItemDesc(weapon.name));
  const nextEffect = appendEffect(
    baseEffect,
    `무기 강화 +${nextEnhancement}: 공격력 +${weaponLevel}, 중량 +${weaponLevel}`,
  );
  const nextName = setEnhancementTag(weapon.name, nextEnhancement);

  let inv = consumeInvItem(ctx.inv, materialName, weaponLevel);
  inv = transformOneInvItem(inv, weapon.name, { name: nextName, effect: nextEffect, weight: nextWeight });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    decrementDbInventory(ctx.userId, materialName, weaponLevel),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `⚒️ ${ctx.nickname}님이 ${weapon.name}을 ${nextName}으로 강화.`);
  }
  revalidatePath("/world");
  return { ok: `${nextName} 강화 완료. 공격력 +${weaponLevel}, 중량 +${weaponLevel}` };
}

export async function enchantWeapon(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const weaponName = String(formData.get("weaponName") ?? "").trim();
  const gemName = String(formData.get("gemName") ?? "").trim();
  const weapon = findInvItem(ctx.inv, weaponName);
  if (!weapon || weapon.qty <= 0) return { error: "인첸트할 무기를 인벤토리에서 찾지 못했습니다." };
  if (!isGemName(gemName)) {
    return { error: "보석(루비·에메랄드·사파이어·토파즈·다이아몬드)만 사용할 수 있어요." };
  }
  if (enhancementLevel(weapon.name) > 0) {
    return { error: "강화된 무기는 마법 제련할 수 없어요." };
  }
  const nextGemTag = gemTag(gemName);
  if ((weapon.effect ?? "").includes("인첸트") || hasMagicTag(weapon.name) || hasTag(weapon.name, nextGemTag)) {
    return { error: "이미 인첸트가 적용된 무기입니다." };
  }
  if (itemQty(ctx.inv, STEEL_FRAGMENT) < 2) {
    return { error: `${STEEL_FRAGMENT}이 부족합니다. (${itemQty(ctx.inv, STEEL_FRAGMENT)}/2)` };
  }
  if (itemQty(ctx.inv, gemName) < 1) return { error: `${gemName}이 부족합니다.` };

  const baseEffect = weapon.effect ?? (await lookupItemDesc(weapon.name));
  const nextEffect = appendEffect(baseEffect, gemEffect(gemName));
  const nextName = addItemTag(weapon.name, nextGemTag);
  let inv = consumeInvItem(ctx.inv, STEEL_FRAGMENT, 2);
  inv = consumeInvItem(inv, gemName, 1);
  inv = transformOneInvItem(inv, weapon.name, { name: nextName, effect: nextEffect });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    decrementDbInventory(ctx.userId, STEEL_FRAGMENT, 2),
    decrementDbInventory(ctx.userId, gemName, 1),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `💎 ${ctx.nickname}님이 ${weapon.name}을 ${nextName}으로 제련.`);
  }
  revalidatePath("/world");
  return { ok: `${nextName} 제련 완료.` };
}

// 수식어 리롤 — 강철 파편 1개로 무기/방어구 앞에 랜덤 수식어를 부여(기존 수식어 교체).
export async function reforgeItem(_prev: ServiceState, formData: FormData): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  const item = findInvItem(ctx.inv, itemName);
  if (!item || item.qty <= 0) return { error: "수식어를 부여할 장비를 찾지 못했습니다." };

  const slot = detectForgeSlot(`${item.name} ${item.effect ?? ""}`);
  if (!slot) return { error: "무기·방어구만 수식어 리롤이 가능해요." };
  if (itemQty(ctx.inv, STEEL_FRAGMENT) < 1) {
    return { error: `${STEEL_FRAGMENT}이 부족합니다. (${itemQty(ctx.inv, STEEL_FRAGMENT)}/1)` };
  }

  const prefix = rollPrefix(slot);
  const base = stripPrefix(item.name); // 기존 수식어 제거 후 기본 이름
  const nextName = `${prefix.name} ${base}`;
  const baseEffect = stripPrefixEffect(item.effect) || (await lookupItemDesc(base)) || "";
  const nextEffect = appendEffect(baseEffect, `수식어(${prefix.name}): ${prefix.effect}`);

  let inv = consumeInvItem(ctx.inv, STEEL_FRAGMENT, 1);
  inv = transformOneInvItem(inv, item.name, { name: nextName, effect: nextEffect, weight: item.weight });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    decrementDbInventory(ctx.userId, STEEL_FRAGMENT, 1),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `🔨 ${ctx.nickname}님이 ${base}에 '${prefix.name}' 수식어를 새겼다.`);
  }
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `[${TIER_LABEL[prefix.tier]}] ${nextName} — ${prefix.effect}` };
}
