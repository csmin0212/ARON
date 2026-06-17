"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  appendSheetGold,
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { isSkillBookItem } from "@/lib/skillbook";
import { MARKET_FEE_RATE } from "@/lib/market";

export type MarketState = { ok?: string; error?: string } | undefined;

function parseInv(json: string | null): SheetInventory {
  try {
    if (json) return JSON.parse(json) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function posInt(v: FormDataEntryValue | null): number {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function itemQty(inv: SheetInventory, name: string): number {
  const t = name.trim();
  return inv.items.filter((i) => i.name.trim() === t).reduce((s, i) => s + Math.max(0, i.qty), 0);
}

function firstItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  const t = name.trim();
  return inv.items.find((i) => i.name.trim() === t) ?? null;
}

function consumeItem(inv: SheetInventory, name: string, qty: number): void {
  const t = name.trim();
  let remaining = qty;
  for (const item of inv.items) {
    if (remaining <= 0 || item.name.trim() !== t) continue;
    const used = Math.min(Math.max(0, item.qty), remaining);
    item.qty -= used;
    remaining -= used;
  }
  inv.items = inv.items.filter((i) => i.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
}

function addItem(
  inv: SheetInventory,
  item: { name: string; effect: string | null; weight: number | null; qty: number },
): void {
  const t = item.name.trim();
  const existing = inv.items.find(
    (e) =>
      e.name.trim() === t &&
      (e.effect ?? null) === (item.effect ?? null) &&
      (e.weight ?? null) === (item.weight ?? null),
  );
  if (existing) existing.qty += item.qty;
  else inv.items.push({ name: t, effect: item.effect, weight: item.weight, qty: item.qty });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
}

async function decDbItem(userId: string, name: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: name }, { name }] } });
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

async function incDbItem(userId: string, name: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: name }, { name }] } });
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
    await prisma.inventoryEntry.create({ data: { userId, itemId: item.id, qty } });
  }
}

// 매물 등록 — 인벤에서 빼서 보관(에스크로)
export async function listItem(_prev: MarketState, formData: FormData): Promise<MarketState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  const qty = posInt(formData.get("qty"));
  const price = posInt(formData.get("price"));
  if (!itemName) return { error: "등록할 아이템을 선택해주세요." };
  if (qty <= 0) return { error: "수량을 확인해주세요." };
  if (price <= 0) return { error: "가격을 입력해주세요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };

  // 스킬북은 서버 토큰과 얽혀 있어 거래소 등록 불가 (복제 방지)
  const catalog = await prisma.item.findFirst({
    where: { OR: [{ id: itemName }, { name: itemName }] },
    select: { id: true },
  });
  if (await isSkillBookItem(catalog?.id ?? itemName)) {
    return { error: "스킬북은 거래소에 등록할 수 없어요." };
  }

  const inv = parseInv(sheet.invJson);
  if (itemQty(inv, itemName) < qty) return { error: `${itemName} 수량이 부족해요.` };
  const snap = firstItem(inv, itemName);

  consumeItem(inv, itemName, qty);
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { invJson: JSON.stringify(inv) },
  });
  await decDbItem(user.id, itemName, qty);
  void pushInventoryToSheet(sheet.sheetTab, inv);

  await prisma.marketListing.create({
    data: {
      sellerId: user.id,
      sellerName: user.nickname,
      itemName: snap?.name ?? itemName,
      itemEffect: snap?.effect ?? null,
      itemWeight: snap?.weight ?? null,
      qty,
      price,
    },
  });

  revalidatePath("/market");
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${itemName} x${qty}을(를) ${price.toLocaleString("ko-KR")}G에 등록했어요.` };
}

// 매물 구매 — 아이템은 구매자 인벤으로, 대금은 판매자 우편으로(수수료 차감)
export async function buyListing(_prev: MarketState, formData: FormData): Promise<MarketState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const id = String(formData.get("listingId") ?? "").trim();
  if (!id) return { error: "잘못된 요청이에요." };

  const listing = await prisma.marketListing.findUnique({ where: { id } });
  if (!listing || listing.status !== "OPEN") return { error: "이미 판매되었거나 사라진 매물이에요." };
  if (listing.sellerId === user.id) return { error: "내 매물은 구매할 수 없어요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };
  const gold = sheet.curGold ?? 0;
  if (gold < listing.price) {
    return { error: `골드가 부족해요. (필요 ${listing.price.toLocaleString("ko-KR")}G, 보유 ${gold.toLocaleString("ko-KR")}G)` };
  }

  // 동시 구매 방지 — OPEN 일 때만 선점
  const claim = await prisma.marketListing.updateMany({
    where: { id, status: "OPEN" },
    data: { status: "SOLD", buyerId: user.id, buyerName: user.nickname, soldAt: new Date() },
  });
  if (claim.count === 0) return { error: "방금 다른 사람이 구매했어요." };

  // 구매자: 골드 차감 + 아이템 지급
  const nextGold = gold - listing.price;
  const inv = parseInv(sheet.invJson);
  addItem(inv, {
    name: listing.itemName,
    effect: listing.itemEffect,
    weight: listing.itemWeight,
    qty: listing.qty,
  });
  inv.gold = `${nextGold}G`;
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { invJson: JSON.stringify(inv), curGold: nextGold, gold: `${nextGold}G` },
  });
  await incDbItem(user.id, listing.itemName, listing.qty);
  void appendSheetGold(sheet.sheetTab, -listing.price);
  void pushInventoryToSheet(sheet.sheetTab, inv);

  // 판매자: 대금(수수료 차감)을 우편으로
  const fee = Math.floor(listing.price * MARKET_FEE_RATE);
  const payout = listing.price - fee;
  await prisma.mail.create({
    data: {
      recipientId: listing.sellerId,
      senderName: "거래소",
      subject: `판매 완료: ${listing.itemName} x${listing.qty}`,
      body: `${user.nickname}님이 구매했어요. 대금 ${payout.toLocaleString("ko-KR")}G (수수료 ${fee.toLocaleString("ko-KR")}G 제외)`,
      gold: payout,
    },
  });

  revalidatePath("/market");
  revalidatePath("/world");
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: `${listing.itemName} x${listing.qty} 구매 완료! (-${listing.price.toLocaleString("ko-KR")}G)` };
}

// 매물 취소 — 보관 중인 물건을 판매자에게 반환
export async function cancelListing(_prev: MarketState, formData: FormData): Promise<MarketState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const id = String(formData.get("listingId") ?? "").trim();
  if (!id) return { error: "잘못된 요청이에요." };

  const listing = await prisma.marketListing.findUnique({ where: { id } });
  if (!listing || listing.sellerId !== user.id) return { error: "내 매물이 아니에요." };
  if (listing.status !== "OPEN") return { error: "취소할 수 없는 매물이에요." };

  const claim = await prisma.marketListing.updateMany({
    where: { id, status: "OPEN", sellerId: user.id },
    data: { status: "CANCELLED" },
  });
  if (claim.count === 0) return { error: "이미 처리된 매물이에요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (sheet?.sheetTab) {
    const inv = parseInv(sheet.invJson);
    addItem(inv, {
      name: listing.itemName,
      effect: listing.itemEffect,
      weight: listing.itemWeight,
      qty: listing.qty,
    });
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { invJson: JSON.stringify(inv) },
    });
    await incDbItem(user.id, listing.itemName, listing.qty);
    void pushInventoryToSheet(sheet.sheetTab, inv);
  } else {
    // 시트 미연동이면 우편으로 반환
    await prisma.mail.create({
      data: {
        recipientId: user.id,
        senderName: "거래소",
        subject: `등록 취소: ${listing.itemName} x${listing.qty}`,
        itemName: listing.itemName,
        itemQty: listing.qty,
      },
    });
  }

  revalidatePath("/market");
  revalidatePath("/profile");
  return { ok: "등록을 취소하고 물건을 돌려받았어요." };
}
