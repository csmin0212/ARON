import "server-only";

import { prisma } from "@/lib/prisma";
import { collectionItems, findLifeSkillItem, isSeaLifeItem, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import {
  WANDERING_MERCHANT_DURATION_MS,
  WANDERING_MERCHANT_LOCATION_ID,
  buildWanderingMerchantStock,
  isWanderingMerchantLifeKind,
  wanderingMerchantLifePrice,
  wanderingMerchantDay,
  type WanderingMerchantKind,
  type WanderingMerchantStockItem,
} from "@/lib/wanderingMerchant";

function rowToStock(row: {
  id: string;
  eventId: string;
  slot: string;
  kind: string;
  itemName: string;
  rank: number;
  price: number;
  stock: number;
  initialStock: number;
  meta: string | null;
}): WanderingMerchantStockItem | null {
  if (isWanderingMerchantLifeKind(row.kind)) {
    const kind = row.kind as LifeSkillKind;
    const item = findLifeSkillItem(kind, row.itemName);
    if (!item) return null;
    if (kind === "낚시" && isSeaLifeItem(item)) return null;
    return {
      id: row.id,
      eventId: row.eventId,
      slot: row.slot,
      kind,
      itemName: row.itemName,
      rank: row.rank,
      price: wanderingMerchantLifePrice(item),
      stock: row.stock,
      initialStock: row.initialStock,
      meta: row.meta,
    };
  }
  return {
    id: row.id,
    eventId: row.eventId,
    slot: row.slot,
    kind: row.kind as WanderingMerchantKind,
    itemName: row.itemName,
    rank: row.rank,
    price: row.price,
    stock: row.stock,
    initialStock: row.initialStock,
    meta: row.meta,
  };
}

async function generateStock(eventId: string): Promise<WanderingMerchantStockItem[]> {
  await loadLifeItems();
  const lifeCandidates = collectionItems(false).filter(({ item }) => item.rank >= 1 && item.rank <= 4);
  return buildWanderingMerchantStock(eventId, lifeCandidates);
}

export async function loadActiveWanderingMerchant(now = new Date()) {
  await loadLifeItems();
  const event = await prisma.wanderingMerchantEvent.findFirst({
    where: {
      locationId: WANDERING_MERCHANT_LOCATION_ID,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    orderBy: { startsAt: "desc" },
    include: { listings: { orderBy: { slot: "asc" } } },
  });
  if (!event) return null;
  return {
    id: event.id,
    day: event.day,
    locationId: event.locationId,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    stock: event.listings.map(rowToStock).filter((stock): stock is WanderingMerchantStockItem => stock != null),
  };
}

export async function countTodayWanderingMerchantSummons(now = new Date()): Promise<number> {
  return prisma.wanderingMerchantEvent.count({
    where: { day: wanderingMerchantDay(now), locationId: WANDERING_MERCHANT_LOCATION_ID },
  });
}

// 남은 시간과 상관없이 행상인을 즉시 떠나보낸다. 기록(오늘 소환 횟수)은 남기려고
// 삭제 대신 endsAt 만 현재로 당긴다.
export async function dismissWanderingMerchant(now = new Date()) {
  const active = await loadActiveWanderingMerchant(now);
  if (!active) return { dismissed: false };
  await prisma.wanderingMerchantEvent.update({
    where: { id: active.id },
    data: { endsAt: now },
  });
  return { dismissed: true };
}

export async function summonWanderingMerchant(createdById: string, now = new Date()) {
  const active = await loadActiveWanderingMerchant(now);
  if (active) return { event: active, created: false };

  const event = await prisma.wanderingMerchantEvent.create({
    data: {
      day: wanderingMerchantDay(now),
      locationId: WANDERING_MERCHANT_LOCATION_ID,
      startsAt: now,
      endsAt: new Date(now.getTime() + WANDERING_MERCHANT_DURATION_MS),
      createdById,
    },
  });
  const stock = await generateStock(event.id);
  if (stock.length > 0) {
    await prisma.wanderingMerchantListing.createMany({ data: stock });
  }
  return {
    event: {
      id: event.id,
      day: event.day,
      locationId: event.locationId,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      stock,
    },
    created: true,
  };
}
