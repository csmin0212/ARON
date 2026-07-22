"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { inventoryWeightTotal, pushInventoryToSheet, type SheetInventory } from "@/lib/googleSheets";
import {
  addLifeBagItem,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  recordCollection,
} from "@/lib/lifeSkillPerks";
import { findLifeSkillItem, type LifeSkillKind } from "@/lib/lifeSkillData";
import { kstDayKey } from "@/lib/world";
import { SKILLBOOK_META } from "@/lib/skillbook";
import {
  ensureBlackMarketStock,
  forceResetBlackMarketStock,
  loadBlackMarketQuestState,
} from "@/lib/blackMarketServer";

export type BlackMarketState = { error?: string; ok?: string } | undefined;

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
    .filter((item) => item.name.trim() === target)
    .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
}

function consumeInvItem(inv: SheetInventory, name: string, qty: number): SheetInventory {
  const target = name.trim();
  let remaining = qty;
  for (const item of inv.items) {
    if (item.name.trim() !== target || remaining <= 0) continue;
    const take = Math.min(item.qty, remaining);
    item.qty -= take;
    remaining -= take;
  }
  inv.items = inv.items.filter((item) => item.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

async function decrementDbInventory(userId: string, itemName: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
  if (!item) return;
  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: item.id, meta: null, qty: { gt: 0 } },
  });
  if (!existing) return;
  await prisma.inventoryEntry.update({
    where: { id: existing.id },
    data: { qty: Math.max(0, existing.qty - qty) },
  });
}

async function loadStorageMatches(userId: string, itemName: string) {
  return prisma.storageEntry.findMany({
    where: {
      box: { userId },
      name: itemName.trim(),
      qty: { gt: 0 },
    },
    orderBy: { updatedAt: "asc" },
  });
}

function storageTotal(rows: { qty: number }[]): number {
  return rows.reduce((sum, row) => sum + Math.max(0, row.qty), 0);
}

async function consumeStorage(rows: { id: string; qty: number }[], qty: number): Promise<void> {
  let remaining = qty;
  for (const row of rows) {
    if (remaining <= 0) break;
    const take = Math.min(row.qty, remaining);
    remaining -= take;
    if (row.qty > take) {
      await prisma.storageEntry.update({ where: { id: row.id }, data: { qty: row.qty - take } });
    } else {
      await prisma.storageEntry.delete({ where: { id: row.id } });
    }
  }
}

async function canUseBlackMarket(locationId: string | null): Promise<boolean> {
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
  return ["암상인", "암시장", "뒷골목", "연금술 책", "black market", "back alley"].some((keyword) =>
    source.includes(keyword.toLowerCase()),
  );
}

function parseMeta(meta: string | null): { skillName?: string } {
  try {
    return meta ? (JSON.parse(meta) as { skillName?: string }) : {};
  } catch {
    return {};
  }
}

export async function deliverBlackMarketQuest(): Promise<BlackMarketState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };
  if (!(await canUseBlackMarket(sheet.locationId))) {
    return { error: "암상인 의뢰는 뒷골목에서만 처리할 수 있습니다." };
  }

  const state = await loadBlackMarketQuestState(user.id, sheet);
  const offer = state.offer;
  if (!offer) return { error: "오늘의 암상인 의뢰가 아직 없습니다." };
  if (state.deliveredAt) return { error: "오늘 암상인 의뢰는 이미 처리했습니다." };

  const inv = parseInv(sheet.invJson);
  const bagHave = itemQty(inv, offer.itemName);
  const storageRows = await loadStorageMatches(user.id, offer.itemName);
  const storeHave = storageTotal(storageRows);
  if (bagHave + storeHave < offer.qty) {
    return {
      error: `${offer.itemName}이(가) 부족합니다. (보유 ${bagHave + storeHave} / 필요 ${offer.qty})`,
    };
  }

  const fromBag = Math.min(bagHave, offer.qty);
  const fromStorage = offer.qty - fromBag;
  if (fromBag > 0) {
    consumeInvItem(inv, offer.itemName, fromBag);
    await decrementDbInventory(user.id, offer.itemName, fromBag);
  }
  if (fromStorage > 0) await consumeStorage(storageRows, fromStorage);

  state.deliveredAt = new Date().toISOString();
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      blackMarketCoins: { increment: offer.rewardCoins },
      blackMarketQuestJson: JSON.stringify(state),
      invJson: JSON.stringify(inv),
      achStatsJson: bumpStat(bumpStat(sheet.achStatsJson, "의뢰완료횟수"), "암상인의뢰완료횟수"),
    },
  });
  if (fromBag > 0) void pushInventoryToSheet(sheet.sheetTab, inv);
  void checkAndGrant(user.id);
  if (sheet.locationId) {
    await postSystem(
      sheet.locationId,
      `🕯️ ${user.nickname}님이 암상인 의뢰 [${offer.itemName} x${offer.qty}]를 넘겼습니다.`,
    );
  }
  revalidatePath("/world");
  return { ok: `거래 완료. 암상인 코인 +${offer.rewardCoins}` };
}

export async function buyBlackMarketItem(
  _prev: BlackMarketState,
  formData: FormData,
): Promise<BlackMarketState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };
  const listingId = String(formData.get("listingId") ?? "");
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };
  if (!(await canUseBlackMarket(sheet.locationId))) {
    return { error: "암상인 상점은 뒷골목에서만 이용할 수 있습니다." };
  }

  await ensureBlackMarketStock();
  const listing = await prisma.blackMarketListing.findUnique({ where: { id: listingId } });
  const today = kstDayKey(new Date());
  if (!listing || listing.day !== today) return { error: "오늘 판매 목록에 없는 물품입니다." };
  if (listing.stock <= 0) return { error: "이미 매진된 물품입니다." };
  if ((sheet.blackMarketCoins ?? 0) < listing.price) {
    return {
      error: `암상인 코인이 부족합니다. (${sheet.blackMarketCoins ?? 0}/${listing.price})`,
    };
  }

  const life = parseLifeState(sheet.lifeJson);
  if (listing.kind !== "스킬북") {
    const kind = listing.kind as LifeSkillKind;
    const item = findLifeSkillItem(kind, listing.itemName);
    if (!item) return { error: "생활 아이템 정보를 찾지 못했습니다." };
    const bag = life.bags[kind];
    const nextWeight = lifeBagWeight(bag) + item.weight;
    const maxWeight = lifeBagLimit(life, kind);
    if (nextWeight > maxWeight) {
      return { error: `${bag.name} 중량이 부족합니다. (${nextWeight}/${maxWeight})` };
    }
    addLifeBagItem(life, kind, item);
    recordCollection(life, kind, item.name);
  }

  let result: "ok" | "sold-out";
  try {
    result = await prisma.$transaction(async (tx) => {
      const stock = await tx.blackMarketListing.updateMany({
        where: { id: listing.id, day: today, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (stock.count !== 1) return "sold-out" as const;

      const paid = await tx.characterSheet.updateMany({
        where: { userId: user.id, blackMarketCoins: { gte: listing.price } },
        data: {
          blackMarketCoins: { decrement: listing.price },
          ...(listing.kind !== "스킬북" ? { lifeJson: JSON.stringify(life) } : {}),
        },
      });
      if (paid.count !== 1) throw new Error("coin-shortage");

      if (listing.kind === "스킬북") {
        const existing = await tx.inventoryEntry.findFirst({
          where: { userId: user.id, itemId: listing.itemName, meta: SKILLBOOK_META },
        });
        if (existing) {
          await tx.inventoryEntry.update({
            where: { id: existing.id },
            data: { qty: existing.qty + 1 },
          });
        } else {
          await tx.inventoryEntry.create({
            data: { userId: user.id, itemId: listing.itemName, qty: 1, meta: SKILLBOOK_META },
          });
        }
      }
      return "ok" as const;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "coin-shortage") {
      return { error: "암상인 코인이 부족합니다." };
    }
    throw error;
  }

  if (result === "sold-out") return { error: "방금 매진되었습니다." };
  revalidatePath("/world");
  revalidatePath("/profile");
  const meta = parseMeta(listing.meta);
  return {
    ok: `${meta.skillName ?? listing.itemName} 구매 완료. 암상인 코인 -${listing.price}`,
  };
}

export async function resetBlackMarketStockForGm(): Promise<BlackMarketState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };
  const stock = await forceResetBlackMarketStock();
  revalidatePath("/world");
  return { ok: `암시장 재고를 다시 뽑았습니다. (${stock.length}개)` };
}
