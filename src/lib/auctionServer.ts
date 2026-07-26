import "server-only";

import { prisma } from "@/lib/prisma";
import {
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import {
  addLifeBagItem,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  type LifeState,
} from "@/lib/lifeSkillPerks";
import {
  findLifeSkillItem,
  lifeSkillItemKind,
  lifeSkillSellPrice,
  type LifeSkillKind,
} from "@/lib/lifeSkillData";
import { isNonSellable } from "@/lib/shop";
import { isSkillBookItem } from "@/lib/skillbook";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import {
  auctionCategoryOrder,
  listingExpiry,
  listingFee,
  netProceeds,
  normalizeAuctionCategory,
  parseAuctionMeta,
  parseCookedName,
  type AuctionCategory,
  type AuctionItemMeta,
  type AuctionSource,
} from "@/lib/auction";
import { auctionSlots, normalizeAdventurerRank, rankAtLeast } from "@/lib/adventurerRank";
import { detectForgeSlot } from "@/lib/forge";
import {
  potionSellPrice,
  profitAdjustedSellPrice,
  recipeIngredientCostFromJson,
} from "@/lib/qualityPricing";

export type AuctionResult = { ok?: string; error?: string };

export type ListingView = {
  id: string;
  category: string;
  itemName: string;
  effect: string | null;
  rank: number | null;
  quantity: number;
  unitPrice: number;
  floor: number;
  sellerId: string;
  sellerNickname: string;
  expiresAt: string;
  createdAt: string;
};

export type SellableItem = {
  source: AuctionSource;
  name: string;
  qty: number;
  effect: string | null;
  weight: number | null;
  rank: number | null;
  text: string | null;
  floor: number;
  category: AuctionCategory;
};

type AuctionMailMeta = AuctionItemMeta & { category?: string | null };
type ReturnItemPlan = {
  inv: SheetInventory;
  life: LifeState;
  sheetTab: string;
  syncBasicInventory: boolean;
  ok: string;
};

// ── 인벤(휴대품) 헬퍼 — services/trade 패턴 ──
function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function itemQty(inv: SheetInventory, name: string): number {
  const target = name.trim();
  return inv.items
    .filter((i) => i.name.trim() === target)
    .reduce((sum, i) => sum + Math.max(0, i.qty), 0);
}

function firstInvItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  const target = name.trim();
  return inv.items.find((i) => i.name.trim() === target && i.qty > 0) ?? null;
}

function consumeInvItem(inv: SheetInventory, name: string, qty: number): void {
  const target = name.trim();
  let remaining = qty;
  for (const i of inv.items) {
    if (i.name.trim() !== target || remaining <= 0) continue;
    const used = Math.min(Math.max(0, i.qty), remaining);
    i.qty -= used;
    remaining -= used;
  }
  inv.items = inv.items.filter((i) => i.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
}

function addInvItem(
  inv: SheetInventory,
  item: { name: string; effect: string | null; weight: number | null },
  qty: number,
): void {
  const target = item.name.trim();
  const existing = inv.items.find(
    (e) =>
      e.name.trim() === target &&
      (e.effect ?? null) === (item.effect ?? null) &&
      (e.weight ?? null) === (item.weight ?? null),
  );
  if (existing) existing.qty += qty;
  else inv.items.push({ name: target, effect: item.effect, weight: item.weight, qty });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
}

// ── 생활가방 헬퍼 ──
function lifeBagQty(life: LifeState, kind: LifeSkillKind, name: string): number {
  const t = name.trim();
  return life.bags[kind].items
    .filter((i) => i.name.trim() === t)
    .reduce((s, i) => s + Math.max(0, i.qty), 0);
}

function removeLifeBagItem(
  life: LifeState,
  kind: LifeSkillKind,
  name: string,
  qty: number,
): { name: string; effect: string; weight: number; rank: number; text: string } | null {
  const t = name.trim();
  const item = life.bags[kind].items.find((i) => i.name.trim() === t && i.qty > 0);
  if (!item || lifeBagQty(life, kind, name) < qty) return null;
  const snapshot = {
    name: item.name,
    effect: `R${item.rank} · ${item.text}`,
    weight: item.weight,
    rank: item.rank,
    text: item.text,
  };
  let remaining = qty;
  for (const i of life.bags[kind].items) {
    if (remaining <= 0 || i.name.trim() !== t) continue;
    const used = Math.min(Math.max(0, i.qty), remaining);
    i.qty -= used;
    remaining -= used;
  }
  life.bags[kind].items = life.bags[kind].items.filter((i) => i.qty > 0);
  return snapshot;
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

function destinationLifeBag(meta: AuctionMailMeta, itemName: string): LifeSkillKind | null {
  if (meta.source === "낚시" || meta.source === "채집" || meta.source === "채광") return meta.source;
  const kindByName = lifeSkillItemKind(itemName.trim());
  if (kindByName) return kindByName;
  const category = normalizeAuctionCategory(meta.category);
  if (category === "어획물") return "낚시";
  if (category === "채집물") return "채집";
  if (category === "광석") return "채광";
  return null;
}

function addLifeBagItems(
  life: LifeState,
  kind: LifeSkillKind,
  item: { name: string; weight: number; rank: number; text: string },
  qty: number,
): void {
  for (let i = 0; i < qty; i++) addLifeBagItem(life, kind, item);
}

// ── DB 인벤 미러 ──
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

// ── 하한가·카테고리 판정 ──
export async function resolveFloor(name: string, source: AuctionSource): Promise<number> {
  await loadLifeItems();
  // 어획물/약초는 raw 이름으로 먼저 판정 (예: "바다의 전령"이 장인작 파싱과 충돌하지 않도록).
  const raw = name.trim();
  if (source === "낚시" || source === "채집" || source === "채광") return lifeSkillSellPrice(source, raw);

  const lifeKind = lifeSkillItemKind(raw);
  if (lifeKind) return lifeSkillSellPrice(lifeKind, raw);

  const potionPrice = await potionSellPrice(raw);
  if (potionPrice != null) return potionPrice;

  const { base, grade } = parseCookedName(name);
  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: base },
    select: { sellPrice: true, ingredientsJson: true },
  });
  if (recipe?.sellPrice) {
    return profitAdjustedSellPrice(
      recipe.sellPrice,
      await recipeIngredientCostFromJson(recipe.ingredientsJson),
      grade,
    );
  }

  // 아이템 도감의 모든 분류(포션·무기·방어구·스킬북 …)를 매입 대상으로 인정.
  // 판매가가 비어 있으면 구매가의 40%로 폴백 — 시트에 구매가만 적어도 팔 수 있다.
  if (!isNonSellable(raw)) {
    const item = await prisma.item.findFirst({
      where: { OR: [{ id: raw }, { name: raw }] },
      select: { sellPrice: true, buyPrice: true },
    });
    if (item?.sellPrice && item.sellPrice > 0) return item.sellPrice;
    if (item?.buyPrice && item.buyPrice > 0) return Math.max(1, Math.round(item.buyPrice * 0.4));
  }
  return 0;
}

export async function resolveCategory(
  name: string,
  source: AuctionSource,
  effect?: string | null,
): Promise<AuctionCategory> {
  await loadLifeItems();
  const raw = name.trim();
  if (source === "낚시") return "어획물";
  if (source === "채집") return "채집물";
  if (source === "채광") return "광석";

  const lifeKind = lifeSkillItemKind(raw);
  if (lifeKind === "낚시") return "어획물";
  if (lifeKind === "채집") return "채집물";
  if (lifeKind === "채광") return "광석";

  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: parseCookedName(name).base },
    select: { id: true },
  });
  if (recipe) return "요리";

  if (await isSkillBookItem(raw)) return "스킬북";

  const item = await prisma.item.findFirst({
    where: { OR: [{ id: raw }, { name: raw }] },
    select: { category: true },
  });
  const cat = item?.category ?? "";
  if (cat === "무기") return "무기";
  if (["방어구", "갑옷", "방패"].includes(cat)) return "방어구";
  if (cat === "음식") return "요리";
  if (["소모품", "포션"].includes(cat)) return "포션";
  if (["재료", "보석"].includes(cat)) return "재료";
  const forgeSlot = detectForgeSlot(`${raw}\n${effect ?? ""}`);
  if (forgeSlot === "weapon") return "무기";
  if (forgeSlot === "armor") return "방어구";
  return "기타";
}

// ── 액터 컨텍스트 ──
export type ActorSheet = {
  userId: string;
  nickname: string;
  tab: string;
  curGold: number;
  inv: SheetInventory;
  life: LifeState;
  achStatsJson: string | null;
  rank: string; // 모험가 랭크 — 경매 슬롯·수수료 특혜
};

export async function loadActorSheet(userId: string): Promise<ActorSheet | null> {
  const sheet = await prisma.characterSheet.findUnique({ where: { userId } });
  if (!sheet?.sheetTab) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
  return {
    userId,
    nickname: user?.nickname ?? "모험가",
    tab: sheet.sheetTab,
    curGold: sheet.curGold ?? 0,
    inv: parseInv(sheet.invJson),
    life: parseLifeState(sheet.lifeJson),
    achStatsJson: sheet.achStatsJson,
    rank: normalizeAdventurerRank(sheet.adventurerRank),
  };
}

// ── 조회 ──
function toListingView(
  row: {
    id: string;
    category: string;
    itemName: string;
    itemMeta: string;
    quantity: number;
    unitPrice: number;
    floor: number;
    sellerId: string;
    expiresAt: Date;
    createdAt: Date;
    seller: { nickname: string };
  },
): ListingView {
  const meta = parseAuctionMeta(row.itemMeta);
  return {
    id: row.id,
    category: normalizeAuctionCategory(row.category),
    itemName: row.itemName,
    effect: meta.effect,
    rank: meta.rank,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    floor: row.floor,
    sellerId: row.sellerId,
    sellerNickname: row.seller.nickname,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getActiveListings(category?: string, search?: string): Promise<ListingView[]> {
  await cleanupExpiredListings();
  const where: {
    status: string;
    category?: string;
    itemName?: { contains: string; mode: "insensitive" };
  } = { status: "active" };
  if (category && category !== "전체") where.category = category;
  if (search?.trim()) where.itemName = { contains: search.trim(), mode: "insensitive" };

  const rows = await prisma.auctionListing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { seller: { select: { nickname: true } } },
  });
  return rows.map(toListingView);
}

export async function getMyListings(userId: string): Promise<ListingView[]> {
  const rows = await prisma.auctionListing.findMany({
    where: { sellerId: userId, status: "active" },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { nickname: true } } },
  });
  return rows.map(toListingView);
}

async function restoreLifeItemsFromBasicInventory(
  userId: string,
  sheet: { invJson: string | null; lifeJson: string | null; sheetTab: string },
): Promise<{ inv: SheetInventory; life: LifeState }> {
  const inv = parseInv(sheet.invJson);
  const life = parseLifeState(sheet.lifeJson);
  await loadLifeItems();

  const moved: { name: string; qty: number }[] = [];
  for (const invItem of [...inv.items]) {
    const name = invItem.name.trim();
    const qty = Math.max(0, invItem.qty);
    if (!name || qty <= 0) continue;

    const bagKind = lifeSkillItemKind(name);
    if (!bagKind) continue;

    const lifeItem = findLifeSkillItem(bagKind, name);
    const effectSnapshot = parseLifeEffectSnapshot(invItem.effect);
    const weight = invItem.weight ?? lifeItem?.weight ?? 1;
    const bag = life.bags[bagKind];
    const curWeight = lifeBagWeight(bag);
    const nextWeight = curWeight + weight * qty;
    const maxWeight = lifeBagLimit(life, bagKind);
    if (nextWeight > maxWeight && nextWeight > curWeight) continue;

    addLifeBagItems(
      life,
      bagKind,
      {
        name,
        weight,
        rank: effectSnapshot.rank ?? lifeItem?.rank ?? 0,
        text: effectSnapshot.text ?? lifeItem?.text ?? invItem.effect ?? "",
      },
      qty,
    );
    consumeInvItem(inv, name, qty);
    moved.push({ name, qty });
  }

  if (moved.length > 0) {
    await prisma.characterSheet.update({
      where: { userId },
      data: { invJson: JSON.stringify(inv), lifeJson: JSON.stringify(life) },
    });
    await Promise.all(moved.map((item) => decrementDbInventory(userId, item.name, item.qty)));
    void pushInventoryToSheet(sheet.sheetTab, inv);
  }

  return { inv, life };
}

export async function getSellableItems(userId: string): Promise<SellableItem[]> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { invJson: true, lifeJson: true, sheetTab: true },
  });
  if (!sheet) return [];
  const { inv, life } = await restoreLifeItemsFromBasicInventory(userId, sheet);

  const raw: { source: AuctionSource; name: string; qty: number; effect: string | null; weight: number | null; rank: number | null; text: string | null }[] = [];
  for (const i of inv.items) {
    if (i.qty <= 0) continue;
    raw.push({ source: "basic", name: i.name.trim(), qty: i.qty, effect: i.effect, weight: i.weight, rank: null, text: null });
  }
  for (const kind of ["낚시", "채집", "채광"] as const) {
    for (const i of life.bags[kind].items) {
      if (i.qty <= 0) continue;
      raw.push({ source: kind, name: i.name.trim(), qty: i.qty, effect: `R${i.rank} · ${i.text}`, weight: i.weight, rank: i.rank, text: i.text });
    }
  }

  const out: SellableItem[] = [];
  for (const r of raw) {
    const [floor, category] = await Promise.all([
      resolveFloor(r.name, r.source),
      resolveCategory(r.name, r.source, r.effect),
    ]);
    out.push({ ...r, floor, category });
  }
  return out.sort(
    (a, b) =>
      auctionCategoryOrder(a.category) - auctionCategoryOrder(b.category) ||
      a.name.localeCompare(b.name, "ko"),
  );
}

// ── 만료 정리 (조회 시 lazy 실행) — 우편함으로 반송 ──
// 만료품은 인벤 직행이 아니라 우편 첨부로 보낸다(스냅샷 보존).
// 미수령 반송 우편이 있으면 경매장 이용(등록·구매·즉시매각)이 막힌다 → 수령을 강제.
export async function cleanupExpiredListings(): Promise<void> {
  const expired = await prisma.auctionListing.findMany({
    where: { status: "active", expiresAt: { lt: new Date() } },
    take: 50,
  });
  for (const listing of expired) {
    const claimed = await prisma.auctionListing.updateMany({
      where: { id: listing.id, status: "active" },
      data: { status: "expired", endedAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    await prisma.mail.create({
      data: {
        recipientId: listing.sellerId,
        senderName: "경매장",
        subject: "경매 만료 반송",
        body: `${listing.itemName} x${listing.quantity}이(가) 기한 내 팔리지 않아 반송되었습니다. 첨부를 수령해주세요. 수령 전까지는 경매장을 이용할 수 없어요.`,
        itemName: listing.itemName,
        itemQty: listing.quantity,
        itemMetaJson: listing.itemMeta,
      },
    });
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        kind: "auction",
        title: "경매 만료",
        body: `${listing.itemName} x${listing.quantity}이(가) 팔리지 않아 우편함으로 반송되었습니다.`,
        href: "/mail",
      },
    });
  }
}

// 미수령 경매 반송 우편 — 있으면 경매장 이용 불가 (수령 강제)
async function unclaimedAuctionMailError(userId: string): Promise<string | null> {
  const pending = await prisma.mail.findFirst({
    where: {
      recipientId: userId,
      senderName: "경매장",
      subject: "경매 만료 반송",
      claimedAt: null,
      itemQty: { gt: 0 },
    },
    select: { id: true },
  });
  return pending
    ? "우편함에 수령하지 않은 경매 반송품이 있어요. 📬 우편함에서 수령한 뒤 이용할 수 있어요."
    : null;
}

// 판매자(오프라인 가능)에게 아이템을 원래 성격에 맞는 가방으로 반송하기 위한 스냅샷 생성.
async function planReturnItemToSeller(
  sellerId: string,
  name: string,
  qty: number,
  meta: AuctionMailMeta,
): Promise<ReturnItemPlan | { error: string }> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: sellerId },
    select: { invJson: true, lifeJson: true, sheetTab: true },
  });
  if (!sheet) return { error: "캐릭터 시트 연동이 필요합니다." };
  const inv = parseInv(sheet.invJson);
  const life = parseLifeState(sheet.lifeJson);
  await loadLifeItems();

  const bagKind = destinationLifeBag(meta, name);
  if (bagKind) {
    const lifeItem = findLifeSkillItem(bagKind, name);
    const effectSnapshot = parseLifeEffectSnapshot(meta.effect);
    const weight = meta.weight ?? lifeItem?.weight ?? 1;
    const rank = meta.rank ?? effectSnapshot.rank ?? lifeItem?.rank ?? 0;
    const text = meta.text ?? effectSnapshot.text ?? lifeItem?.text ?? "";
    const bag = life.bags[bagKind];
    const curWeight = lifeBagWeight(bag);
    const nextWeight = curWeight + weight * qty;
    const maxWeight = lifeBagLimit(life, bagKind);
    if (nextWeight > maxWeight && nextWeight > curWeight) {
      return { error: `${bag.name} 중량이 부족합니다. (${nextWeight}/${maxWeight})` };
    }
    addLifeBagItems(
      life,
      bagKind,
      {
        name,
        weight,
        rank,
        text,
      },
      qty,
    );
    return {
      inv,
      life,
      sheetTab: sheet.sheetTab,
      syncBasicInventory: false,
      ok: `${bag.name}으로 돌려받았어요.`,
    };
  }

  const weight = meta.weight ?? 1;
  const curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight ?? 0;
  const nextWeight = curWeight + weight * qty;
  if (inv.maxWeight != null && nextWeight > inv.maxWeight && nextWeight > curWeight) {
    return { error: `가방 중량이 부족합니다. (${nextWeight}/${inv.maxWeight})` };
  }
  addInvItem(inv, { name, effect: meta.effect, weight }, qty);
  return {
    inv,
    life,
    sheetTab: sheet.sheetTab,
    syncBasicInventory: true,
    ok: "휴대품으로 돌려받았어요.",
  };
}

async function persistReturnItemToSeller(
  sellerId: string,
  name: string,
  qty: number,
  plan: ReturnItemPlan,
): Promise<void> {
  await prisma.characterSheet.update({
    where: { userId: sellerId },
    data: { invJson: JSON.stringify(plan.inv), lifeJson: JSON.stringify(plan.life) },
  });
  if (!plan.syncBasicInventory) return;
  await incrementDbInventory(sellerId, name, qty);
  void pushInventoryToSheet(plan.sheetTab, plan.inv);
}

// ── 코어 뮤테이션 (actions 에서 호출) ──
export async function createListingCore(
  userId: string,
  params: { source: AuctionSource; name: string; qty: number; unitPrice: number },
): Promise<AuctionResult> {
  const { source, name, qty, unitPrice } = params;
  if (!name) return { error: "등록할 아이템이 올바르지 않습니다." };
  if (qty <= 0) return { error: "수량이 올바르지 않습니다." };
  if (unitPrice <= 0) return { error: "가격을 입력해주세요." };

  const mailBlock = await unclaimedAuctionMailError(userId);
  if (mailBlock) return { error: mailBlock };

  const actor = await loadActorSheet(userId);
  if (!actor) return { error: "캐릭터 시트 연동이 필요합니다." };

  // 동시 등록 슬롯 — 창고 대용 악용 방지. 길드 랭크업마다 +5 (D 5 → S 25).
  const slots = auctionSlots(actor.rank);
  const activeCount = await prisma.auctionListing.count({
    where: { sellerId: userId, status: "active" },
  });
  if (activeCount >= slots) {
    return { error: `동시 등록은 ${slots}개까지예요. (현재 ${activeCount}개) 기존 등록을 팔거나 회수한 뒤 올려주세요.` };
  }

  const floor = await resolveFloor(name, source);
  if (unitPrice < floor) {
    return { error: `즉시매각 하한(${floor.toLocaleString()}G)보다 낮게는 올릴 수 없어요.` };
  }

  // 보유 확인 + 스냅샷 확보
  let meta: AuctionItemMeta;
  if (source === "basic") {
    if (itemQty(actor.inv, name) < qty) return { error: `${name} 수량이 부족합니다.` };
    if (isNonSellable(name)) return { error: "이 물건은 거래할 수 없어요." };
    const ref = firstInvItem(actor.inv, name);
    meta = { effect: ref?.effect ?? null, weight: ref?.weight ?? null, rank: null, text: null, source };
    consumeInvItem(actor.inv, name, qty);
    await decrementDbInventory(userId, name, qty);
  } else {
    const removed = removeLifeBagItem(actor.life, source, name, qty);
    if (!removed) return { error: `${name} 수량이 부족합니다.` };
    meta = { effect: removed.effect, weight: removed.weight, rank: removed.rank, text: removed.text, source };
  }

  // S랭크 특혜 — 등록 수수료 면제
  const fee = rankAtLeast(actor.rank, "S") ? 0 : listingFee(unitPrice, qty);
  if (actor.curGold < fee) return { error: `등록 수수료가 부족합니다. (${fee.toLocaleString()}G 필요)` };
  const nextGold = actor.curGold - fee;
  const category = await resolveCategory(name, source, meta.effect);

  await prisma.characterSheet.update({
    where: { userId },
    data: {
      invJson: JSON.stringify(actor.inv),
      lifeJson: JSON.stringify(actor.life),
      curGold: nextGold,
      gold: `${nextGold}G`,
    },
  });
  await prisma.auctionListing.create({
    data: {
      sellerId: userId,
      category,
      itemName: name,
      itemMeta: JSON.stringify(meta),
      quantity: qty,
      unitPrice,
      floor,
      feePaid: fee,
      expiresAt: listingExpiry(),
    },
  });
  void enqueueSheetGoldSync(actor.userId);
  void pushInventoryToSheet(actor.tab, actor.inv);

  return {
    ok: `${name} x${qty}을(를) 개당 ${unitPrice.toLocaleString()}G에 등록했어요. ${
      fee > 0 ? `(수수료 -${fee.toLocaleString()}G)` : "(S랭크 — 수수료 면제)"
    }`,
  };
}

export async function buyListingCore(
  buyerId: string,
  params: { listingId: string; qty: number },
): Promise<AuctionResult> {
  const { listingId, qty } = params;
  if (qty <= 0) return { error: "구매 수량이 올바르지 않습니다." };

  const mailBlock = await unclaimedAuctionMailError(buyerId);
  if (mailBlock) return { error: mailBlock };

  const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "active") return { error: "이미 종료된 등록입니다." };
  if (listing.sellerId === buyerId) return { error: "내 등록은 구매할 수 없어요. (취소를 이용하세요)" };
  if (qty > listing.quantity) return { error: "남은 수량보다 많이 살 수 없어요." };

  const buyer = await loadActorSheet(buyerId);
  if (!buyer) return { error: "캐릭터 시트 연동이 필요합니다." };

  const total = listing.unitPrice * qty;
  if (buyer.curGold < total) {
    return { error: `골드가 부족합니다. (${buyer.curGold.toLocaleString()}G/${total.toLocaleString()}G)` };
  }

  const meta = parseAuctionMeta(listing.itemMeta);

  // 원자적 점유 — 남은 수량 차감 (동시 구매 방지)
  const claimed = await prisma.auctionListing.updateMany({
    where: { id: listingId, status: "active", quantity: { gte: qty } },
    data: { quantity: { decrement: qty } },
  });
  if (claimed.count !== 1) return { error: "방금 다른 사람이 구매했어요. 새로고침 해주세요." };
  await prisma.auctionListing.updateMany({
    where: { id: listingId, quantity: { lte: 0 } },
    data: { status: "sold", endedAt: new Date() },
  });

  // 구매자: 골드 차감 + 경매장 보관 우편 생성. 실제 가방 투입은 우편함 수령 시 용량 검사 후 처리한다.
  const nextBuyerGold = buyer.curGold - total;
  const mailMeta: AuctionMailMeta = { ...meta, category: listing.category };
  await prisma.characterSheet.update({
    where: { userId: buyerId },
    data: {
      curGold: nextBuyerGold,
      gold: `${nextBuyerGold}G`,
    },
  });
  void enqueueSheetGoldSync(buyer.userId);
  await prisma.mail.create({
    data: {
      recipientId: buyerId,
      senderName: "경매장",
      subject: "경매 구매 보관",
      body: `${listing.itemName} x${qty} 구매가 완료되었습니다. 우편함에서 수령하면 알맞은 가방으로 이동합니다.`,
      itemName: listing.itemName,
      itemQty: qty,
      itemMetaJson: JSON.stringify(mailMeta),
    },
  });

  // 판매자(오프라인 가능): 수수료 제외 실수령
  const proceeds = netProceeds(listing.unitPrice, qty);
  const sellerSheet = await prisma.characterSheet.findUnique({
    where: { userId: listing.sellerId },
    select: { sheetTab: true, curGold: true },
  });
  if (sellerSheet) {
    const nextSellerGold = (sellerSheet.curGold ?? 0) + proceeds;
    await prisma.characterSheet.update({
      where: { userId: listing.sellerId },
      data: { curGold: nextSellerGold, gold: `${nextSellerGold}G` },
    });
    void enqueueSheetGoldSync(listing.sellerId);
  }
  await prisma.notification.create({
    data: {
      userId: listing.sellerId,
      kind: "auction",
      title: "경매 판매 완료",
      body: `${listing.itemName} x${qty}이(가) ${buyer.nickname}님에게 팔렸어요. +${proceeds.toLocaleString()}G`,
      href: "/market",
    },
  });

  return { ok: `${listing.itemName} x${qty} 구매 완료. -${total.toLocaleString()}G · 우편함에 보관됐어요.` };
}

// 즉시매각 — NPC(상점)에 하한가로 바로 판매. 위탁(등록)과 달리 매물로 가지 않고 즉시 골드 입금.
export async function instantSellCore(
  userId: string,
  params: { source: AuctionSource; name: string; qty: number },
): Promise<AuctionResult> {
  const { source, name, qty } = params;
  if (!name) return { error: "판매할 아이템이 올바르지 않습니다." };
  if (qty <= 0) return { error: "수량이 올바르지 않습니다." };

  const mailBlock = await unclaimedAuctionMailError(userId);
  if (mailBlock) return { error: mailBlock };

  const actor = await loadActorSheet(userId);
  if (!actor) return { error: "캐릭터 시트 연동이 필요합니다." };

  const floor = await resolveFloor(name, source);

  let isBasic = false;
  if (source === "basic") {
    if (isNonSellable(name)) return { error: "이 물건은 매입하지 않아요." };
    if (itemQty(actor.inv, name) < qty) return { error: `${name} 수량이 부족합니다.` };
    consumeInvItem(actor.inv, name, qty);
    await decrementDbInventory(userId, name, qty);
    isBasic = true;
  } else {
    const removed = removeLifeBagItem(actor.life, source, name, qty);
    if (!removed) return { error: `${name} 수량이 부족합니다.` };
  }

  const gain = floor * qty;
  const nextGold = actor.curGold + gain;
  await prisma.characterSheet.update({
    where: { userId },
    data: {
      invJson: JSON.stringify(actor.inv),
      lifeJson: JSON.stringify(actor.life),
      curGold: nextGold,
      gold: `${nextGold}G`,
    },
  });
  void enqueueSheetGoldSync(actor.userId);
  if (isBasic) void pushInventoryToSheet(actor.tab, actor.inv);

  return { ok: `${name} x${qty} 즉시매각 완료. +${gain.toLocaleString()}G` };
}

export async function cancelListingCore(userId: string, listingId: string): Promise<AuctionResult> {
  const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== userId) return { error: "취소할 수 없는 등록입니다." };
  if (listing.status !== "active") return { error: "이미 종료된 등록입니다." };

  const returnPlan = await planReturnItemToSeller(
    userId,
    listing.itemName,
    listing.quantity,
    { ...parseAuctionMeta(listing.itemMeta), category: listing.category },
  );
  if ("error" in returnPlan) return returnPlan;

  const claimed = await prisma.auctionListing.updateMany({
    where: { id: listingId, status: "active" },
    data: { status: "cancelled", endedAt: new Date() },
  });
  if (claimed.count !== 1) return { error: "이미 종료된 등록입니다." };

  await persistReturnItemToSeller(userId, listing.itemName, listing.quantity, returnPlan);
  return { ok: `${listing.itemName} x${listing.quantity} 등록을 취소하고 ${returnPlan.ok}` };
}
