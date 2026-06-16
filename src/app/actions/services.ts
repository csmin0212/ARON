"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  appendSheetGold,
  appendSheetItem,
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { parseGoldToInt } from "@/lib/dice";
import {
  addLifeBagItem,
  computeMods,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
} from "@/lib/lifeSkillPerks";
import { lifeSkillSellPrice, type LifeSkillKind } from "@/lib/lifeSkillData";
import { SELLABLE_MATERIAL_CATEGORIES, isNonSellable } from "@/lib/shop";
import { FATIGUE_MAX, regenFatigue, restedTodayKst } from "@/lib/world";
import { postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { adventurerRankGoal, nextAdventurerRank, normalizeAdventurerRank } from "@/lib/adventurerRank";
import {
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
  { id: "fish_bag_20", kind: "낚시", type: "bag", name: "낚시꾼 가방 20칸", price: 2000, maxWeight: 20 },
  { id: "fish_bag_30", kind: "낚시", type: "bag", name: "낚시꾼 가방 30칸", price: 5000, maxWeight: 30 },
  { id: "plant_bag_20", kind: "채집", type: "bag", name: "약초꾼 가방 20칸", price: 2000, maxWeight: 20 },
  { id: "plant_bag_30", kind: "채집", type: "bag", name: "약초꾼 가방 30칸", price: 5000, maxWeight: 30 },
  { id: "good_rod", kind: "낚시", type: "tool", name: "좋은 낚싯대", price: 2500, tier: 1 },
  { id: "master_rod", kind: "낚시", type: "tool", name: "고급 낚싯대", price: 7000, tier: 2 },
  { id: "good_sickle", kind: "채집", type: "tool", name: "숙련 채집 도구", price: 2500, tier: 1 },
  { id: "master_sickle", kind: "채집", type: "tool", name: "장인의 채집 도구", price: 7000, tier: 2 },
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
  curGold: number | null;
  achStatsJson: string | null;
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
    curGold: sheet.curGold,
    achStatsJson: sheet.achStatsJson,
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
  return (["낚시", "채집"] as const).reduce(
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
  for (const kind of ["낚시", "채집"] as const) {
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
  if (toolName === "고급 낚싯대" || toolName === "장인의 채집 도구") return 2;
  if (toolName === "좋은 낚싯대" || toolName === "숙련 채집 도구") return 1;
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
    sourceKindRaw === "낚시" || sourceKindRaw === "채집" ? sourceKindRaw : null;
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
  if (usedWeight + movingWeight > box.maxWeight) {
    return { error: `창고 중량이 부족합니다. (${usedWeight + movingWeight}/${box.maxWeight})` };
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
    entry.sourceKind === "낚시" || entry.sourceKind === "채집" ? entry.sourceKind : null;
  if (sourceKind) {
    const sheet = await prisma.characterSheet.findUnique({
      where: { userId: ctx.userId },
      select: { lifeJson: true },
    });
    const life = parseLifeState(sheet?.lifeJson);
    const bag = life.bags[sourceKind];
    const mods = computeMods(life, sourceKind);
    const currentWeight = lifeBagWeight(bag);
    const movingWeight = (entry.weight ?? 0) * qty;
    const maxWeight = lifeBagLimit(life, sourceKind, mods.weightBonus);
    if (currentWeight + movingWeight > maxWeight) {
      return { error: `${bag.name} 중량이 부족합니다. (${currentWeight + movingWeight}/${maxWeight})` };
    }
    for (let i = 0; i < qty; i++) {
      addLifeBagItem(life, sourceKind, {
        name: entry.name,
        weight: entry.weight ?? 1,
        rank: entry.rank ?? 0,
        text: entry.text ?? entry.effect ?? "",
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
  void appendSheetGold(ctx.tab, -totalPrice);

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
  void appendSheetGold(ctx.tab, product.sellPrice * qty);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${product.name} x${qty} 판매 완료. +${(product.sellPrice * qty).toLocaleString()}G` };
}

export async function cookDish(_prev: CookingState, formData: FormData): Promise<CookingState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 가방을 먼저 동기화해주세요." };

  const facility = String(formData.get("facility") ?? "public");
  const atHome = isHomeLocationId(ctx.locationId);
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

  let inv = ctx.inv;
  for (const ingredient of ingredients) {
    inv = await consumeIngredient(ctx.userId, inv, life, ingredient.name, ingredient.qty);
  }

  const result = recipe
    ? {
        name: recipe.resultName,
        qty: recipe.resultQty,
        effect: recipe.effect
          ? `${recipe.effect}${recipe.duration ? ` (${recipe.duration})` : ""}\n판매가 ${recipe.sellPrice}G`
          : `판매가 ${recipe.sellPrice}G`,
        weight: recipe.weight,
        sellPrice: recipe.sellPrice,
      }
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

  let achStats = recipe ? bumpStat(sheet?.achStatsJson, "요리성공횟수") : (sheet?.achStatsJson ?? null);
  if (recipe) {
    achStats = setMaxStat(achStats, "요리최고등급", recipeRankNumber(recipe.rank));
    for (const tag of cookingTagTokens(recipe)) {
      achStats = bumpStat(achStats, `요리태그:${tag}`);
    }
  }
  if (discovered) achStats = bumpStat(achStats, "요리레시피수");

  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: {
        ap: fresh.value - COOKING_AP_COST,
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
    return { ok: `조합이 맞지 않았어요. ${FAILED_DISH.name} x1 획득. 피로도 -${COOKING_AP_COST}` };
  }
  return {
    ok: discovered
      ? `새 레시피 발견! ${recipe.name} 완성. ${result.name} x${result.qty} 획득.`
      : `${recipe.name} 완성. ${result.name} x${result.qty} 획득.`,
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

  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: itemName },
    select: { sellPrice: true },
  });
  const unitPrice = itemName === FAILED_DISH.name ? FAILED_DISH.sellPrice : recipe?.sellPrice;
  if (!unitPrice) return { error: "요리 판매가를 찾지 못했습니다." };

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
  void appendSheetGold(ctx.tab, gain);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${itemName} x${qty} 판매 완료. +${gain.toLocaleString()}G` };
}

function parseFatigueRecovery(effect: string): number | null {
  const match = effect.match(/피로도\s*(\d+)\s*회복/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function recipeRankNumber(rank: string | null | undefined): number {
  const match = String(rank ?? "").match(/R\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

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

  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: itemName },
    select: { effect: true, duration: true, tags: true },
  });
  const rawEffect = recipe?.effect || findInvItem(ctx.inv, itemName)?.effect || "";
  if (!rawEffect || itemName === FAILED_DISH.name) {
    return { error: "사용할 수 있는 요리 효과가 없습니다." };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: ctx.userId },
    select: { ap: true, apResetAt: true, lifeJson: true, achStatsJson: true },
  });
  if (!sheet) return { error: "캐릭터 시트를 찾지 못했습니다." };

  const now = new Date();
  const life = parseLifeState(sheet.lifeJson);
  life.cookingBuffs.lifeLuck = life.cookingBuffs.lifeLuck.filter(
    (buff) => Date.parse(buff.until) > now.getTime(),
  );

  let ok = "";
  const fatigue = parseFatigueRecovery(rawEffect);
  const lifeLuck = parseLifeLuck(rawEffect);
  const sessionBuff = parseSessionBuff(rawEffect);

  if (fatigue != null) {
    const fresh = regenFatigue(sheet.ap, sheet.apResetAt, now);
    if (fresh.value >= FATIGUE_MAX) return { error: "피로도가 이미 가득 찼어요." };
    const nextAp = Math.min(FATIGUE_MAX, fresh.value + fatigue);
    ok = `${itemName}을 사용했습니다. 피로도 +${nextAp - fresh.value} (${nextAp}/${FATIGUE_MAX})`;

    const inv = consumeInvItem(ctx.inv, itemName, 1);
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await Promise.all([
      prisma.characterSheet.update({
        where: { userId: ctx.userId },
        data: {
          ap: nextAp,
          apResetAt: fresh.at,
          invJson: JSON.stringify(inv),
          lifeJson: JSON.stringify(life),
          achStatsJson: bumpStat(sheet.achStatsJson, "요리버프사용"),
        },
      }),
      decrementDbInventory(ctx.userId, itemName, 1),
    ]);
    void pushInventoryToSheet(ctx.tab, inv);
  } else if (lifeLuck) {
    const until = new Date(now.getTime() + 30 * 60 * 1000);
    life.cookingBuffs.lifeLuck.push({
      kind: lifeLuck.kind,
      amount: lifeLuck.amount,
      until: until.toISOString(),
      source: itemName,
    });
    ok = `${itemName}을 사용했습니다. 30분 동안 ${
      lifeLuck.kind === "both" ? "낚시·채집" : lifeLuck.kind
    } 행운 +${lifeLuck.amount}`;

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
  } else {
    return { error: "아직 자동 적용할 수 없는 요리 효과입니다." };
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
    kindRaw === "낚시" || kindRaw === "채집" ? kindRaw : null;
  if (!kind) return { error: "판매할 부산물 종류가 올바르지 않습니다." };
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
  void appendSheetGold(ctx.tab, gain);

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
  void appendSheetGold(ctx.tab, gain);

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
  void appendSheetGold(sheet.sheetTab, -INN_REST_COST);

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
      housingJson: serializeHousingState({
        owned: [selected.tier],
        furniture: { [selected.tier]: housing.furniture[selected.tier] ?? [] },
      }),
    },
  });
  void appendSheetGold(ctx.tab, refund - cost);

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
      housingJson: serializeHousingState({ owned: remaining, furniture: nextFurniture }),
      curGold: nextGold,
      gold: `${nextGold}G`,
      invJson: JSON.stringify(inv),
      locationId: nextLocationId,
      enteredAt: nextLocationId !== sheet?.locationId ? new Date() : undefined,
    },
  });
  void appendSheetGold(ctx.tab, refund);

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

  const newAp = Math.min(FATIGUE_MAX, fresh.value + option.restAmount);
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
  void appendSheetGold(ctx.tab, -product.price);

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
