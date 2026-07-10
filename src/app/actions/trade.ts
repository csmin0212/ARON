"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
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
import { findLifeSkillItem, lifeSkillItemKind, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";

export type TradeActionState = {
  ok?: boolean;
  message?: string;
};

// 거래 품목 출처: 기본 가방 / 낚시 가방 / 채집 가방
export type TradeSource = "basic" | LifeSkillKind;
const TRADE_SOURCE_SEP = "~@~"; // select value 인코딩 (source~@~name)

export type TradeSideItem = {
  name: string;
  effect: string | null;
  weight: number | null;
  qty: number;
  source?: TradeSource; // 없으면 basic (구버전 호환)
};

type Pool = { inv: SheetInventory; life: LifeState };

function isLifeKind(v: string): v is LifeSkillKind {
  return v === "낚시" || v === "채집" || v === "채광";
}

function lifeBagQty(life: LifeState, kind: LifeSkillKind, name: string): number {
  const t = name.trim();
  return life.bags[kind].items
    .filter((i) => i.name.trim() === t)
    .reduce((s, i) => s + Math.max(0, i.qty), 0);
}

function lifeBagFirst(life: LifeState, kind: LifeSkillKind, name: string) {
  const t = name.trim();
  return life.bags[kind].items.find((i) => i.name.trim() === t && i.qty > 0) ?? null;
}

function removeFromLifeBag(life: LifeState, kind: LifeSkillKind, name: string, qty: number): void {
  const t = name.trim();
  let remaining = qty;
  for (const it of life.bags[kind].items) {
    if (remaining <= 0 || it.name.trim() !== t) continue;
    const used = Math.min(Math.max(0, it.qty), remaining);
    it.qty -= used;
    remaining -= used;
  }
  life.bags[kind].items = life.bags[kind].items.filter((i) => i.qty > 0);
}

function availableQty(pool: Pool, source: TradeSource, name: string): number {
  return source === "basic" ? itemQty(pool.inv, name) : lifeBagQty(pool.life, source, name);
}

function parseOfferRef(raw: string): { source: TradeSource; name: string } {
  const i = raw.indexOf(TRADE_SOURCE_SEP);
  if (i < 0) return { source: "basic", name: raw.trim() };
  const src = raw.slice(0, i);
  return { source: isLifeKind(src) ? src : "basic", name: raw.slice(i + TRADE_SOURCE_SEP.length).trim() };
}

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

function parseLifeEffectSnapshot(effect: string | null | undefined): { rank: number | null; text: string | null } {
  if (!effect) return { rank: null, text: null };
  const match = effect.match(/^R(\d+)\s*·\s*(.*)$/);
  if (!match) return { rank: null, text: effect };
  return {
    rank: Number(match[1]),
    text: match[2]?.trim() || null,
  };
}

function destinationLifeBag(item: TradeSideItem): LifeSkillKind | null {
  if (item.source === "낚시" || item.source === "채집" || item.source === "채광") return item.source;
  return lifeSkillItemKind(item.name);
}

function addLifeBagItems(
  life: LifeState,
  kind: LifeSkillKind,
  item: { name: string; weight: number; rank: number; text: string },
  qty: number,
): void {
  for (let i = 0; i < qty; i++) addLifeBagItem(life, kind, item);
}

function readOfferItems(pool: Pool, formData: FormData): TradeSideItem[] {
  const names = formData.getAll("itemName").map((value) => String(value ?? "").trim());
  const qtys = formData.getAll("itemQty");
  const byKey = new Map<string, TradeSideItem>();

  for (let i = 0; i < Math.min(names.length, MAX_TRADE_ITEM_ROWS); i++) {
    const ref = parseOfferRef(names[i]);
    if (!ref.name) continue;
    const qty = positiveInt(qtys[i] ?? null, 1);

    let effect: string | null = null;
    let weight: number | null = null;
    if (ref.source === "basic") {
      const found = firstItem(pool.inv, ref.name);
      if (!found) continue;
      effect = found.effect;
      weight = found.weight;
    } else {
      const lifeItem = lifeBagFirst(pool.life, ref.source, ref.name);
      if (!lifeItem) continue;
      effect = `R${lifeItem.rank} · ${lifeItem.text}`;
      weight = lifeItem.weight;
    }
    const item = { name: ref.name, effect, weight };
    const key = `${item.name}\u0000${item.effect ?? ""}\u0000${item.weight ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.qty += qty;
    else byKey.set(key, { name: item.name, effect: item.effect, weight: item.weight, qty, source: ref.source });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function validateSide(pool: Pool, items: TradeSideItem[]): string | null {
  const needed = new Map<string, { source: TradeSource; name: string; qty: number }>();
  for (const item of items) {
    const source = item.source ?? "basic";
    const prev = needed.get(`${source} ${item.name}`);
    if (prev) prev.qty += item.qty;
    else needed.set(`${source} ${item.name}`, { source, name: item.name, qty: item.qty });
  }
  for (const { source, name, qty } of needed.values()) {
    if (availableQty(pool, source, name) < qty) return `${name} 수량이 부족합니다.`;
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

async function incrementDbInventory(
  userId: string,
  itemName: string,
  qty: number,
  snapshot?: TradeSideItem,
): Promise<void> {
  const item =
    (await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } })) ??
    (await prisma.item.create({
      data: {
        id: itemName,
        name: itemName,
        category: "기타",
        desc: snapshot?.effect ?? null,
        weight: snapshot?.weight ?? null,
      },
    }));

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
    select: { invJson: true, lifeJson: true, curGold: true },
  });
  if (!sheet) return { ok: false, message: "캐릭터 시트를 먼저 연동해주세요." };

  const pool: Pool = { inv: parseInv(sheet.invJson), life: parseLifeState(sheet.lifeJson) };
  const gold = nonNegativeInt(formData.get("gold"));
  if (gold > (sheet.curGold ?? 0)) return { ok: false, message: "올릴 골드가 부족합니다." };

  const items = readOfferItems(pool, formData);
  const invalid = validateSide(pool, items);
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
      select: { sheetTab: true, invJson: true, lifeJson: true, curGold: true, achStatsJson: true },
    }),
    prisma.characterSheet.findUnique({
      where: { userId: trade.toUserId },
      select: { sheetTab: true, invJson: true, lifeJson: true, curGold: true, achStatsJson: true },
    }),
  ]);
  if (!fromSheet || !toSheet) return { ok: false, message: "거래 당사자의 캐릭터 시트가 필요합니다." };

  const fromItems = parseTradeItems(trade.fromOfferJson);
  const toItems = parseTradeItems(trade.toOfferJson);
  const fromInv = parseInv(fromSheet.invJson);
  const toInv = parseInv(toSheet.invJson);
  const fromLife = parseLifeState(fromSheet.lifeJson);
  const toLife = parseLifeState(toSheet.lifeJson);
  const fromPool: Pool = { inv: fromInv, life: fromLife };
  const toPool: Pool = { inv: toInv, life: toLife };
  const fromGold = fromSheet.curGold ?? 0;
  const toGold = toSheet.curGold ?? 0;

  if (trade.fromGold > fromGold) return { ok: false, message: `${trade.fromUser.nickname}님의 골드가 부족합니다.` };
  if (trade.toGold > toGold) return { ok: false, message: `${trade.toUser.nickname}님의 골드가 부족합니다.` };
  const fromInvalid = validateSide(fromPool, fromItems);
  if (fromInvalid) return { ok: false, message: `${trade.fromUser.nickname}: ${fromInvalid}` };
  const toInvalid = validateSide(toPool, toItems);
  if (toInvalid) return { ok: false, message: `${trade.toUser.nickname}: ${toInvalid}` };

  await loadLifeItems();

  // 보내는 쪽은 출처(기본/생활 가방)에서 차감, 받는 쪽은 아이템 성격에 맞는 가방으로 수령.
  const removeOffered = (pool: Pool, items: TradeSideItem[]) => {
    for (const item of items) {
      const source = item.source ?? "basic";
      if (source === "basic") consumeItem(pool.inv, item.name, item.qty);
      else removeFromLifeBag(pool.life, source, item.name, item.qty);
    }
  };
  const receiveOffered = (pool: Pool, nickname: string, items: TradeSideItem[]): string | null => {
    for (const item of items) {
      const bagKind = destinationLifeBag(item);
      if (!bagKind) {
        addItem(pool.inv, item);
        continue;
      }

      const lifeItem = findLifeSkillItem(bagKind, item.name);
      const effectSnapshot = parseLifeEffectSnapshot(item.effect);
      const weight = item.weight ?? lifeItem?.weight ?? 1;
      const rank = effectSnapshot.rank ?? lifeItem?.rank ?? 0;
      const text = effectSnapshot.text ?? lifeItem?.text ?? item.effect ?? "";
      const bag = pool.life.bags[bagKind];
      const nextWeight = lifeBagWeight(bag) + weight * item.qty;
      const maxWeight = lifeBagLimit(pool.life, bagKind);
      if (nextWeight > maxWeight) {
        return `${nickname}님의 ${bag.name} 중량을 초과합니다. (${nextWeight}/${maxWeight})`;
      }
      addLifeBagItems(pool.life, bagKind, { name: item.name, weight, rank, text }, item.qty);
    }
    return null;
  };
  removeOffered(fromPool, fromItems);
  removeOffered(toPool, toItems);
  const fromReceiveInvalid = receiveOffered(fromPool, trade.fromUser.nickname, toItems);
  if (fromReceiveInvalid) return { ok: false, message: fromReceiveInvalid };
  const toReceiveInvalid = receiveOffered(toPool, trade.toUser.nickname, fromItems);
  if (toReceiveInvalid) return { ok: false, message: toReceiveInvalid };

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
        lifeJson: JSON.stringify(fromLife),
        curGold: nextFromGold,
        gold: `${nextFromGold}G`,
        achStatsJson: bumpStat(fromSheet.achStatsJson, "거래완료횟수"),
      },
    }),
    prisma.characterSheet.update({
      where: { userId: trade.toUserId },
      data: {
        invJson: JSON.stringify(toInv),
        lifeJson: JSON.stringify(toLife),
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
    if ((item.source ?? "basic") === "basic") await decrementDbInventory(trade.fromUserId, item.name, item.qty);
    if (!destinationLifeBag(item)) await incrementDbInventory(trade.toUserId, item.name, item.qty, item);
  }
  for (const item of toItems) {
    if ((item.source ?? "basic") === "basic") await decrementDbInventory(trade.toUserId, item.name, item.qty);
    if (!destinationLifeBag(item)) await incrementDbInventory(trade.fromUserId, item.name, item.qty, item);
  }

  await Promise.all([
    enqueueSheetGoldSync(trade.fromUserId),
    enqueueSheetGoldSync(trade.toUserId),
    pushInventoryToSheet(fromSheet.sheetTab, fromInv),
    pushInventoryToSheet(toSheet.sheetTab, toInv),
  ]);
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
