"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import {
  appendSheetItem,
  inventoryWeightTotal,
  inventoryWeightOverflowMessage,
  type SheetInventory,
} from "@/lib/googleSheets";
import {
  addLifeBagItem,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  recordCollection,
} from "@/lib/lifeSkillPerks";
import { findLifeSkillItem, isSeaLifeItem, type LifeSkillKind } from "@/lib/lifeSkillData";
import { prisma } from "@/lib/prisma";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import { postSystem } from "@/lib/play";
import {
  MYSTERY_PARCHMENT_NAME,
  VITALITY_POTION_EVENT_NAME,
  WANDERING_MERCHANT_LOCATION_ID,
  WANDERING_MERCHANT_LOCATION_NAME,
  isWanderingMerchantLifeKind,
  wanderingMerchantLifePrice,
} from "@/lib/wanderingMerchant";
import {
  countTodayWanderingMerchantSummons,
  dismissWanderingMerchant,
  loadActiveWanderingMerchant,
  summonWanderingMerchant,
} from "@/lib/wanderingMerchantServer";

export type WanderingMerchantState = { error?: string; ok?: string } | undefined;

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
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
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

function itemFallback(itemName: string): { effect: string | null; weight: number | null } {
  if (itemName === VITALITY_POTION_EVENT_NAME) return { effect: "피로도 50 회복", weight: 1 };
  if (itemName === MYSTERY_PARCHMENT_NAME) return { effect: "아무도 없는 곳에서 열어보자.", weight: 1 };
  return { effect: null, weight: 1 };
}

async function canUseMerchant(locationId: string | null): Promise<boolean> {
  if (!locationId) return false;
  if (locationId === WANDERING_MERCHANT_LOCATION_ID) return true;
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { name: true },
  });
  return location?.name === WANDERING_MERCHANT_LOCATION_NAME;
}

export async function summonWanderingMerchantForGm(): Promise<WanderingMerchantState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const result = await summonWanderingMerchant(user.id);
  if (result.created) {
    await postSystem(
      WANDERING_MERCHANT_LOCATION_ID,
      `🧳 행상인이 ${WANDERING_MERCHANT_LOCATION_NAME}에 도착했습니다. 1시간 뒤 떠납니다.`,
    );
  }
  revalidatePath("/world");
  const count = await countTodayWanderingMerchantSummons();
  return result.created
    ? { ok: `행상인을 불렀습니다. 오늘 ${count}회 소환.` }
    : { ok: `이미 행상인이 머물고 있습니다. 오늘 ${count}회 소환.` };
}

export async function dismissWanderingMerchantForGm(): Promise<WanderingMerchantState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const result = await dismissWanderingMerchant();
  if (!result.dismissed) return { error: "지금은 행상인이 머물고 있지 않습니다." };

  await postSystem(
    WANDERING_MERCHANT_LOCATION_ID,
    `🧳 행상인이 ${WANDERING_MERCHANT_LOCATION_NAME}를 떠났습니다.`,
  );
  revalidatePath("/world");
  return { ok: "행상인을 돌려보냈습니다." };
}

export async function buyWanderingMerchantItem(
  _prev: WanderingMerchantState,
  formData: FormData,
): Promise<WanderingMerchantState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const listingId = String(formData.get("listingId") ?? "").trim();
  if (!listingId) return { error: "구매할 물품을 찾지 못했습니다." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };
  if (!(await canUseMerchant(sheet.locationId))) return { error: "행상인은 대상 야영지에서만 만날 수 있습니다." };

  const active = await loadActiveWanderingMerchant();
  if (!active) return { error: "지금은 행상인이 머물고 있지 않습니다." };

  const listing = await prisma.wanderingMerchantListing.findUnique({
    where: { id: listingId },
    include: { event: true },
  });
  const now = new Date();
  if (!listing || listing.eventId !== active.id || listing.event.endsAt <= now) {
    return { error: "이미 떠난 행상인의 물품입니다." };
  }
  const life = parseLifeState(sheet.lifeJson);
  const inv = parseInv(sheet.invJson);
  const isLife = isWanderingMerchantLifeKind(listing.kind);
  let price = listing.price;

  let basicItem: { itemId: string | null; itemName: string; effect: string | null; weight: number | null } | null = null;
  if (isLife) {
    const kind = listing.kind as LifeSkillKind;
    const item = findLifeSkillItem(kind, listing.itemName);
    if (!item) return { error: "생활 아이템 정보를 찾지 못했습니다." };
    if (kind === "낚시" && isSeaLifeItem(item)) return { error: "행상인은 강 물고기만 취급합니다." };
    price = wanderingMerchantLifePrice(item);
    const bag = life.bags[kind];
    const nextWeight = lifeBagWeight(bag) + item.weight;
    const maxWeight = lifeBagLimit(life, kind);
    if (nextWeight > maxWeight) return { error: `${bag.name} 중량이 부족합니다. (${nextWeight}/${maxWeight})` };
    addLifeBagItem(life, kind, item);
    recordCollection(life, kind, item.name);
  } else {
    const item = await prisma.item.findFirst({
      where: { OR: [{ id: listing.itemName }, { name: listing.itemName }] },
    });
    const fallback = itemFallback(listing.itemName);
    basicItem = {
      itemId: item?.id ?? null,
      itemName: item?.name ?? listing.itemName,
      effect: item?.desc ?? fallback.effect,
      weight: item?.weight ?? fallback.weight,
    };
    addInvItem(inv, { name: basicItem.itemName, effect: basicItem.effect, weight: basicItem.weight }, 1);
    const overflow = inventoryWeightOverflowMessage(inv);
    if (overflow) return { error: overflow };
  }
  if (listing.stock <= 0) return { error: "이미 매진된 물품입니다." };
  if ((sheet.curGold ?? 0) < price) {
    return { error: `골드가 부족합니다. (${(sheet.curGold ?? 0).toLocaleString()}G/${price.toLocaleString()}G)` };
  }

  const nextGold = (sheet.curGold ?? 0) - price;
  inv.gold = `${nextGold}G`;

  try {
    await prisma.$transaction(async (tx) => {
      const stock = await tx.wanderingMerchantListing.updateMany({
        where: { id: listing.id, eventId: active.id, stock: { gt: 0 } },
        data: { stock: { decrement: 1 }, price },
      });
      if (stock.count !== 1) throw new Error("sold-out");

      const paid = await tx.characterSheet.updateMany({
        where: { userId: user.id, curGold: { gte: price } },
        data: {
          curGold: { decrement: price },
          gold: `${nextGold}G`,
          invJson: JSON.stringify(inv),
          ...(isLife ? { lifeJson: JSON.stringify(life) } : {}),
        },
      });
      if (paid.count !== 1) throw new Error("gold-shortage");

      if (basicItem?.itemId) {
        const existing = await tx.inventoryEntry.findFirst({
          where: { userId: user.id, itemId: basicItem.itemId, meta: null },
        });
        if (existing) {
          await tx.inventoryEntry.update({
            where: { id: existing.id },
            data: { qty: existing.qty + 1 },
          });
        } else {
          await tx.inventoryEntry.create({
            data: { userId: user.id, itemId: basicItem.itemId, qty: 1, meta: null },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "sold-out") return { error: "방금 매진되었습니다." };
    if (error instanceof Error && error.message === "gold-shortage") return { error: "골드가 부족합니다." };
    throw error;
  }

  void enqueueSheetGoldSync(user.id, { delayMs: 0 });
  if (basicItem) {
    void appendSheetItem(sheet.sheetTab, basicItem.itemName, 1, {
      effect: basicItem.effect,
      weight: basicItem.weight ?? undefined,
    });
  }
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `${listing.itemName} 구매 완료. -${price.toLocaleString()}G` };
}
