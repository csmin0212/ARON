import "server-only";

import { prisma } from "@/lib/prisma";
import {
  appendSheetGold,
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { parseLifeState, type LifeState } from "@/lib/lifeSkillPerks";
import {
  lifeSkillItemKind,
  lifeSkillSellPrice,
  type LifeSkillKind,
} from "@/lib/lifeSkillData";
import { SELLABLE_MATERIAL_CATEGORIES, isNonSellable } from "@/lib/shop";
import { isSkillBookItem } from "@/lib/skillbook";
import {
  gradeInfo,
  listingExpiry,
  netProceeds,
  parseAuctionMeta,
  parseCookedName,
  type AuctionCategory,
  type AuctionItemMeta,
  type AuctionSource,
} from "@/lib/auction";

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
  const { base, grade } = parseCookedName(name);
  const trimmed = base;
  if (source === "낚시" || source === "채집") return lifeSkillSellPrice(source, trimmed);

  const lifeKind = lifeSkillItemKind(trimmed);
  if (lifeKind) return lifeSkillSellPrice(lifeKind, trimmed);

  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: trimmed },
    select: { sellPrice: true },
  });
  if (recipe?.sellPrice) return Math.round(recipe.sellPrice * (gradeInfo(grade)?.priceMult ?? 1));

  if (!isNonSellable(trimmed)) {
    const material = await prisma.item.findFirst({
      where: { name: trimmed, sellPrice: { gt: 0 }, category: { in: SELLABLE_MATERIAL_CATEGORIES } },
      select: { sellPrice: true },
    });
    if (material?.sellPrice) return material.sellPrice;
  }
  return 0;
}

export async function resolveCategory(name: string, source: AuctionSource): Promise<AuctionCategory> {
  const trimmed = parseCookedName(name).base;
  if (source === "낚시") return "어획물";
  if (source === "채집") return "채집품";

  const lifeKind = lifeSkillItemKind(trimmed);
  if (lifeKind === "낚시") return "어획물";
  if (lifeKind === "채집") return "채집품";

  const recipe = await prisma.cookingRecipe.findFirst({
    where: { resultName: trimmed },
    select: { id: true },
  });
  if (recipe) return "요리";

  if (await isSkillBookItem(trimmed)) return "스킬북";

  const item = await prisma.item.findFirst({
    where: { OR: [{ id: trimmed }, { name: trimmed }] },
    select: { category: true },
  });
  const cat = item?.category ?? "";
  if (["재료", "보석"].includes(cat)) return "재료";
  if (["소모품", "포션", "음식"].includes(cat)) return "소비";
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
    category: row.category,
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

export async function getSellableItems(userId: string): Promise<SellableItem[]> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { invJson: true, lifeJson: true },
  });
  if (!sheet) return [];
  const inv = parseInv(sheet.invJson);
  const life = parseLifeState(sheet.lifeJson);

  const raw: { source: AuctionSource; name: string; qty: number; effect: string | null; weight: number | null; rank: number | null; text: string | null }[] = [];
  for (const i of inv.items) {
    if (i.qty <= 0) continue;
    raw.push({ source: "basic", name: i.name.trim(), qty: i.qty, effect: i.effect, weight: i.weight, rank: null, text: null });
  }
  for (const kind of ["낚시", "채집"] as const) {
    for (const i of life.bags[kind].items) {
      if (i.qty <= 0) continue;
      raw.push({ source: kind, name: i.name.trim(), qty: i.qty, effect: `R${i.rank} · ${i.text}`, weight: i.weight, rank: i.rank, text: i.text });
    }
  }

  const out: SellableItem[] = [];
  for (const r of raw) {
    const [floor, category] = await Promise.all([
      resolveFloor(r.name, r.source),
      resolveCategory(r.name, r.source),
    ]);
    out.push({ ...r, floor, category });
  }
  return out.sort((a, b) => a.category.localeCompare(b.category, "ko") || a.name.localeCompare(b.name, "ko"));
}

// ── 만료 정리 (조회 시 lazy 실행) — 판매자에게 직접 반송 ──
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
    await returnItemToSeller(listing.sellerId, listing.itemName, listing.quantity, parseAuctionMeta(listing.itemMeta));
    await prisma.notification.create({
      data: {
        userId: listing.sellerId,
        kind: "auction",
        title: "경매 만료",
        body: `${listing.itemName} x${listing.quantity}이(가) 팔리지 않아 반송되었습니다.`,
        href: "/market",
      },
    });
  }
}

// 판매자(오프라인 가능)에게 아이템을 휴대품으로 직접 반송. 스냅샷 보존.
async function returnItemToSeller(
  sellerId: string,
  name: string,
  qty: number,
  meta: AuctionItemMeta,
): Promise<void> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: sellerId },
    select: { invJson: true, sheetTab: true },
  });
  if (!sheet) return;
  const inv = parseInv(sheet.invJson);
  addInvItem(inv, { name, effect: meta.effect, weight: meta.weight }, qty);
  await prisma.characterSheet.update({
    where: { userId: sellerId },
    data: { invJson: JSON.stringify(inv) },
  });
  await incrementDbInventory(sellerId, name, qty);
  void pushInventoryToSheet(sheet.sheetTab, inv);
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

  const actor = await loadActorSheet(userId);
  if (!actor) return { error: "캐릭터 시트 연동이 필요합니다." };

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

  const fee = Math.max(1, Math.floor(unitPrice * qty * 0.02));
  if (actor.curGold < fee) return { error: `등록 수수료가 부족합니다. (${fee.toLocaleString()}G 필요)` };
  const nextGold = actor.curGold - fee;
  const category = await resolveCategory(name, source);

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
  void appendSheetGold(actor.tab, -fee);
  void pushInventoryToSheet(actor.tab, actor.inv);

  return { ok: `${name} x${qty}을(를) 개당 ${unitPrice.toLocaleString()}G에 등록했어요. (수수료 -${fee.toLocaleString()}G)` };
}

export async function buyListingCore(
  buyerId: string,
  params: { listingId: string; qty: number },
): Promise<AuctionResult> {
  const { listingId, qty } = params;
  if (qty <= 0) return { error: "구매 수량이 올바르지 않습니다." };

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
  // 구매자 가방 중량 확인
  const curWeight = inventoryWeightTotal(buyer.inv.items) ?? buyer.inv.curWeight ?? 0;
  const movingWeight = (meta.weight ?? 0) * qty;
  if (buyer.inv.maxWeight != null && curWeight + movingWeight > buyer.inv.maxWeight) {
    return { error: `가방 중량이 부족합니다. (${curWeight + movingWeight}/${buyer.inv.maxWeight})` };
  }

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

  // 구매자: 골드 차감 + 아이템 수령
  const nextBuyerGold = buyer.curGold - total;
  addInvItem(buyer.inv, { name: listing.itemName, effect: meta.effect, weight: meta.weight }, qty);
  await prisma.characterSheet.update({
    where: { userId: buyerId },
    data: {
      invJson: JSON.stringify(buyer.inv),
      curGold: nextBuyerGold,
      gold: `${nextBuyerGold}G`,
    },
  });
  await incrementDbInventory(buyerId, listing.itemName, qty);
  void appendSheetGold(buyer.tab, -total);
  void pushInventoryToSheet(buyer.tab, buyer.inv);

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
    void appendSheetGold(sellerSheet.sheetTab, proceeds);
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

  return { ok: `${listing.itemName} x${qty} 구매 완료. -${total.toLocaleString()}G` };
}

// 즉시매각 — NPC(상점)에 하한가로 바로 판매. 위탁(등록)과 달리 매물로 가지 않고 즉시 골드 입금.
export async function instantSellCore(
  userId: string,
  params: { source: AuctionSource; name: string; qty: number },
): Promise<AuctionResult> {
  const { source, name, qty } = params;
  if (!name) return { error: "판매할 아이템이 올바르지 않습니다." };
  if (qty <= 0) return { error: "수량이 올바르지 않습니다." };

  const actor = await loadActorSheet(userId);
  if (!actor) return { error: "캐릭터 시트 연동이 필요합니다." };

  const floor = await resolveFloor(name, source);
  if (floor <= 0) return { error: "이 물건은 매입하지 않아요." };

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
  void appendSheetGold(actor.tab, gain);
  if (isBasic) void pushInventoryToSheet(actor.tab, actor.inv);

  return { ok: `${name} x${qty} 즉시매각 완료. +${gain.toLocaleString()}G` };
}

export async function cancelListingCore(userId: string, listingId: string): Promise<AuctionResult> {
  const listing = await prisma.auctionListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.sellerId !== userId) return { error: "취소할 수 없는 등록입니다." };
  if (listing.status !== "active") return { error: "이미 종료된 등록입니다." };

  const claimed = await prisma.auctionListing.updateMany({
    where: { id: listingId, status: "active" },
    data: { status: "cancelled", endedAt: new Date() },
  });
  if (claimed.count !== 1) return { error: "이미 종료된 등록입니다." };

  await returnItemToSeller(userId, listing.itemName, listing.quantity, parseAuctionMeta(listing.itemMeta));
  return { ok: `${listing.itemName} x${listing.quantity} 등록을 취소하고 휴대품으로 돌려받았어요.` };
}
