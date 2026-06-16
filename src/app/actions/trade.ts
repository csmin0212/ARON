"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import {
  appendSheetGold,
  inventoryWeightTotal,
  pushInventoryToSheet,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";

export type TradeActionState = {
  ok?: boolean;
  message?: string;
};

export type TradeSideItem = {
  name: string;
  effect: string | null;
  weight: number | null;
  qty: number;
};

const PENDING = "PENDING";
const ACCEPTED = "ACCEPTED";
const CANCELLED = "CANCELLED";
const MAX_TRADE_ITEM_ROWS = 6;

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function parseTradeItems(value: string | null): TradeSideItem[] {
  try {
    const parsed = value ? (JSON.parse(value) as TradeSideItem[]) : [];
    return parsed.filter((item) => item.name && item.qty > 0);
  } catch {
    return [];
  }
}

function positiveInt(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegativeInt(value: FormDataEntryValue | null): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function itemQty(inv: SheetInventory, name: string): number {
  const target = name.trim();
  return inv.items
    .filter((item) => item.name.trim() === target)
    .reduce((total, item) => total + Math.max(0, item.qty), 0);
}

function firstItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  const target = name.trim();
  return inv.items.find((item) => item.name.trim() === target && item.qty > 0) ?? null;
}

function consumeItem(inv: SheetInventory, name: string, qty: number): SheetInventory {
  const target = name.trim();
  let remaining = qty;
  for (const item of inv.items) {
    if (remaining <= 0 || item.name.trim() !== target) continue;
    const used = Math.min(Math.max(0, item.qty), remaining);
    item.qty -= used;
    remaining -= used;
  }
  inv.items = inv.items.filter((item) => item.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

function addItem(inv: SheetInventory, item: TradeSideItem, qty = item.qty): SheetInventory {
  const target = item.name.trim();
  const existing = inv.items.find(
    (entry) =>
      entry.name.trim() === target &&
      (entry.effect ?? null) === (item.effect ?? null) &&
      (entry.weight ?? null) === (item.weight ?? null),
  );
  if (existing) {
    existing.qty += qty;
  } else {
    inv.items.push({ name: target, effect: item.effect, weight: item.weight, qty });
  }
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

function readOfferItems(inv: SheetInventory, formData: FormData): TradeSideItem[] {
  const names = formData.getAll("itemName").map((value) => String(value ?? "").trim());
  const qtys = formData.getAll("itemQty");
  const byKey = new Map<string, TradeSideItem>();

  for (let i = 0; i < Math.min(names.length, MAX_TRADE_ITEM_ROWS); i++) {
    const name = names[i];
    if (!name) continue;
    const qty = positiveInt(qtys[i] ?? null, 1);
    const item = firstItem(inv, name);
    if (!item) continue;
    const key = `${item.name}\u0000${item.effect ?? ""}\u0000${item.weight ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.qty += qty;
    else byKey.set(key, { name: item.name, effect: item.effect, weight: item.weight, qty });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function validateSide(inv: SheetInventory, items: TradeSideItem[]): string | null {
  const needed = new Map<string, number>();
  for (const item of items) needed.set(item.name, (needed.get(item.name) ?? 0) + item.qty);
  for (const [name, qty] of needed) {
    if (itemQty(inv, name) < qty) return `${name} 수량이 부족합니다.`;
  }
  return null;
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

function isParticipant(trade: { fromUserId: string; toUserId: string }, userId: string): boolean {
  return trade.fromUserId === userId || trade.toUserId === userId;
}

function sideKey(trade: { fromUserId: string }, userId: string): "from" | "to" {
  return trade.fromUserId === userId ? "from" : "to";
}

function refreshTrade(tradeId: string, fromUsername?: string, toUsername?: string): void {
  revalidatePath(`/trade/${tradeId}`);
  revalidatePath("/profile");
  if (fromUsername) revalidatePath(`/u/${encodeURIComponent(fromUsername)}`);
  if (toUsername) revalidatePath(`/u/${encodeURIComponent(toUsername)}`);
}

async function systemMessage(tradeId: string, content: string): Promise<void> {
  await prisma.tradeMessage.create({ data: { tradeId, system: true, content } });
}

async function notifyUser(
  userId: string,
  data: { title: string; body?: string | null; href?: string | null },
): Promise<void> {
  await prisma.notification.create({
    data: {
      userId,
      kind: "trade",
      title: data.title,
      body: data.body ?? null,
      href: data.href ?? null,
    },
  });
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

async function notifyTradePartner(
  trade: { id: string; fromUserId: string; toUserId: string },
  actorUserId: string,
  data: { title: string; body?: string | null },
): Promise<void> {
  const targetUserId = trade.fromUserId === actorUserId ? trade.toUserId : trade.fromUserId;
  await notifyUser(targetUserId, { ...data, href: `/trade/${trade.id}` });
}

export async function createTradeOffer(
  _prev: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "로그인이 필요합니다." };

  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId || toUserId === me.id) {
    return { ok: false, message: "거래 상대가 올바르지 않습니다." };
  }

  const [target, mySheet] = await Promise.all([
    prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, username: true, nickname: true } }),
    prisma.characterSheet.findUnique({ where: { userId: me.id }, select: { id: true } }),
  ]);
  if (!target) return { ok: false, message: "거래 상대를 찾지 못했습니다." };
  if (!mySheet) return { ok: false, message: "캐릭터 시트를 먼저 연동해주세요." };

  const message = String(formData.get("message") ?? "").trim().slice(0, 160);
  const trade = await prisma.tradeOffer.create({
    data: {
      fromUserId: me.id,
      toUserId: target.id,
      message: message || null,
      messages: {
        create: [
          { system: true, content: `${me.nickname}님이 ${target.nickname}님과 거래를 시작했습니다.` },
          ...(message ? [{ userId: me.id, content: message }] : []),
        ],
      },
    },
    select: { id: true },
  });

  await notifyUser(target.id, {
    title: "새 거래 요청",
    body: `${me.nickname}님이 거래방을 열었습니다.`,
    href: `/trade/${trade.id}`,
  });

  refreshTrade(trade.id, me.username, target.username);
  redirect(`/trade/${trade.id}`);
}

export async function updateTradeOffer(
  _prev: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "로그인이 필요합니다." };

  const tradeId = String(formData.get("tradeId") ?? "");
  const trade = await prisma.tradeOffer.findUnique({
    where: { id: tradeId },
    include: {
      fromUser: { select: { username: true, nickname: true } },
      toUser: { select: { username: true, nickname: true } },
    },
  });
  if (!trade || !isParticipant(trade, me.id) || trade.status !== PENDING) {
    return { ok: false, message: "수정할 수 없는 거래입니다." };
  }

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: me.id },
    select: { invJson: true, curGold: true },
  });
  if (!sheet) return { ok: false, message: "캐릭터 시트를 먼저 연동해주세요." };

  const inv = parseInv(sheet.invJson);
  const gold = nonNegativeInt(formData.get("gold"));
  if (gold > (sheet.curGold ?? 0)) return { ok: false, message: "올릴 골드가 부족합니다." };

  const items = readOfferItems(inv, formData);
  const invalid = validateSide(inv, items);
  if (invalid) return { ok: false, message: invalid };

  const side = sideKey(trade, me.id);
  await prisma.tradeOffer.update({
    where: { id: trade.id },
    data:
      side === "from"
        ? {
            fromOfferJson: JSON.stringify(items),
            fromGold: gold,
            fromConfirmed: false,
            toConfirmed: false,
          }
        : {
            toOfferJson: JSON.stringify(items),
            toGold: gold,
            fromConfirmed: false,
            toConfirmed: false,
          },
  });
  await systemMessage(trade.id, `${me.nickname}님이 거래 조건을 갱신했습니다. 양쪽 확정이 해제됩니다.`);
  await notifyTradePartner(trade, me.id, {
    title: "거래 조건 갱신",
    body: `${me.nickname}님이 거래 조건을 바꿨습니다.`,
  });

  refreshTrade(trade.id, trade.fromUser.username, trade.toUser.username);
  return { ok: true, message: "거래 조건을 갱신했습니다." };
}

async function completeTrade(tradeId: string): Promise<TradeActionState> {
  const trade = await prisma.tradeOffer.findUnique({
    where: { id: tradeId },
    include: {
      fromUser: { select: { id: true, username: true, nickname: true } },
      toUser: { select: { id: true, username: true, nickname: true } },
    },
  });
  if (!trade || trade.status !== PENDING || !trade.fromConfirmed || !trade.toConfirmed) {
    return { ok: true, message: "확정했습니다. 상대 확정을 기다립니다." };
  }

  const [fromSheet, toSheet] = await Promise.all([
    prisma.characterSheet.findUnique({
      where: { userId: trade.fromUserId },
      select: { sheetTab: true, invJson: true, curGold: true, achStatsJson: true },
    }),
    prisma.characterSheet.findUnique({
      where: { userId: trade.toUserId },
      select: { sheetTab: true, invJson: true, curGold: true, achStatsJson: true },
    }),
  ]);
  if (!fromSheet || !toSheet) return { ok: false, message: "거래 당사자의 캐릭터 시트가 필요합니다." };

  const fromItems = parseTradeItems(trade.fromOfferJson);
  const toItems = parseTradeItems(trade.toOfferJson);
  const fromInv = parseInv(fromSheet.invJson);
  const toInv = parseInv(toSheet.invJson);
  const fromGold = fromSheet.curGold ?? 0;
  const toGold = toSheet.curGold ?? 0;

  if (trade.fromGold > fromGold) return { ok: false, message: `${trade.fromUser.nickname}님의 골드가 부족합니다.` };
  if (trade.toGold > toGold) return { ok: false, message: `${trade.toUser.nickname}님의 골드가 부족합니다.` };
  const fromInvalid = validateSide(fromInv, fromItems);
  if (fromInvalid) return { ok: false, message: `${trade.fromUser.nickname}: ${fromInvalid}` };
  const toInvalid = validateSide(toInv, toItems);
  if (toInvalid) return { ok: false, message: `${trade.toUser.nickname}: ${toInvalid}` };

  for (const item of fromItems) consumeItem(fromInv, item.name, item.qty);
  for (const item of toItems) addItem(fromInv, item);
  for (const item of toItems) consumeItem(toInv, item.name, item.qty);
  for (const item of fromItems) addItem(toInv, item);

  if (fromInv.curWeight != null && fromInv.maxWeight != null && fromInv.curWeight > fromInv.maxWeight) {
    return { ok: false, message: `${trade.fromUser.nickname}님의 가방 중량을 초과합니다.` };
  }
  if (toInv.curWeight != null && toInv.maxWeight != null && toInv.curWeight > toInv.maxWeight) {
    return { ok: false, message: `${trade.toUser.nickname}님의 가방 중량을 초과합니다.` };
  }

  const nextFromGold = fromGold - trade.fromGold + trade.toGold;
  const nextToGold = toGold - trade.toGold + trade.fromGold;
  fromInv.gold = `${nextFromGold}G`;
  toInv.gold = `${nextToGold}G`;

  await prisma.$transaction([
    prisma.characterSheet.update({
      where: { userId: trade.fromUserId },
      data: {
        invJson: JSON.stringify(fromInv),
        curGold: nextFromGold,
        gold: `${nextFromGold}G`,
        achStatsJson: bumpStat(fromSheet.achStatsJson, "거래완료횟수"),
      },
    }),
    prisma.characterSheet.update({
      where: { userId: trade.toUserId },
      data: {
        invJson: JSON.stringify(toInv),
        curGold: nextToGold,
        gold: `${nextToGold}G`,
        achStatsJson: bumpStat(toSheet.achStatsJson, "거래완료횟수"),
      },
    }),
    prisma.tradeOffer.update({ where: { id: trade.id }, data: { status: ACCEPTED } }),
    prisma.tradeMessage.create({
      data: { tradeId: trade.id, system: true, content: "양쪽이 확정하여 거래가 완료되었습니다." },
    }),
  ]);

  await Promise.all([
    notifyUser(trade.fromUserId, {
      title: "거래 완료",
      body: `${trade.toUser.nickname}님과의 거래가 완료되었습니다.`,
      href: `/trade/${trade.id}`,
    }),
    notifyUser(trade.toUserId, {
      title: "거래 완료",
      body: `${trade.fromUser.nickname}님과의 거래가 완료되었습니다.`,
      href: `/trade/${trade.id}`,
    }),
  ]);

  for (const item of fromItems) {
    await decrementDbInventory(trade.fromUserId, item.name, item.qty);
    await incrementDbInventory(trade.toUserId, item.name, item.qty);
  }
  for (const item of toItems) {
    await decrementDbInventory(trade.toUserId, item.name, item.qty);
    await incrementDbInventory(trade.fromUserId, item.name, item.qty);
  }

  void appendSheetGold(fromSheet.sheetTab, -trade.fromGold + trade.toGold);
  void appendSheetGold(toSheet.sheetTab, -trade.toGold + trade.fromGold);
  void pushInventoryToSheet(fromSheet.sheetTab, fromInv);
  void pushInventoryToSheet(toSheet.sheetTab, toInv);
  void checkAndGrant(trade.fromUserId);
  void checkAndGrant(trade.toUserId);
  refreshTrade(trade.id, trade.fromUser.username, trade.toUser.username);

  return { ok: true, message: "거래가 완료되었습니다." };
}

export async function confirmTradeOffer(
  _prev: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "로그인이 필요합니다." };

  const tradeId = String(formData.get("tradeId") ?? "");
  const trade = await prisma.tradeOffer.findUnique({
    where: { id: tradeId },
    include: {
      fromUser: { select: { username: true, nickname: true } },
      toUser: { select: { username: true, nickname: true } },
    },
  });
  if (!trade || !isParticipant(trade, me.id) || trade.status !== PENDING) {
    return { ok: false, message: "확정할 수 없는 거래입니다." };
  }

  const side = sideKey(trade, me.id);
  await prisma.tradeOffer.update({
    where: { id: trade.id },
    data: side === "from" ? { fromConfirmed: true } : { toConfirmed: true },
  });
  await systemMessage(trade.id, `${me.nickname}님이 거래를 확정했습니다.`);
  await notifyTradePartner(trade, me.id, {
    title: "거래 확정",
    body: `${me.nickname}님이 거래를 확정했습니다.`,
  });

  refreshTrade(trade.id, trade.fromUser.username, trade.toUser.username);
  return completeTrade(trade.id);
}

export async function sendTradeMessage(
  _prev: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "로그인이 필요합니다." };

  const tradeId = String(formData.get("tradeId") ?? "");
  const content = String(formData.get("content") ?? "").trim().slice(0, 500);
  if (!content) return { ok: false, message: "메시지를 입력해주세요." };

  const trade = await prisma.tradeOffer.findUnique({
    where: { id: tradeId },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      status: true,
      fromUser: { select: { username: true } },
      toUser: { select: { username: true } },
    },
  });
  if (!trade || !isParticipant(trade, me.id)) return { ok: false, message: "대화할 수 없는 거래입니다." };
  if (trade.status !== PENDING) return { ok: false, message: "종료된 거래입니다." };

  await prisma.tradeMessage.create({ data: { tradeId: trade.id, userId: me.id, content } });
  await notifyTradePartner(trade, me.id, {
    title: "거래 메시지",
    body: `${me.nickname}: ${content}`,
  });
  refreshTrade(trade.id, trade.fromUser.username, trade.toUser.username);
  return { ok: true, message: "전송했습니다." };
}

export async function cancelTradeOffer(
  _prev: TradeActionState,
  formData: FormData,
): Promise<TradeActionState> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, message: "로그인이 필요합니다." };

  const tradeId = String(formData.get("tradeId") || formData.get("offerId") || "");
  const trade = await prisma.tradeOffer.findUnique({
    where: { id: tradeId },
    include: {
      fromUser: { select: { username: true, nickname: true } },
      toUser: { select: { username: true, nickname: true } },
    },
  });
  if (!trade || !isParticipant(trade, me.id) || trade.status !== PENDING) {
    return { ok: false, message: "취소할 수 없는 거래입니다." };
  }

  await prisma.$transaction([
    prisma.tradeOffer.update({
      where: { id: trade.id },
      data: { status: CANCELLED, fromConfirmed: false, toConfirmed: false },
    }),
    prisma.tradeMessage.create({
      data: { tradeId: trade.id, system: true, content: `${me.nickname}님이 거래를 취소했습니다.` },
    }),
  ]);
  await notifyTradePartner(trade, me.id, {
    title: "거래 취소",
    body: `${me.nickname}님이 거래를 취소했습니다.`,
  });
  refreshTrade(trade.id, trade.fromUser.username, trade.toUser.username);
  return { ok: true, message: "거래를 취소했습니다." };
}
