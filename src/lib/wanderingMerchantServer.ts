import "server-only";

import { prisma } from "@/lib/prisma";
import { getActiveItems } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import {
  WANDERING_MERCHANT_DURATION_MS,
  WANDERING_MERCHANT_LOCATION_ID,
  buildWanderingMerchantStock,
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
}): WanderingMerchantStockItem {
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
  const lifeCandidates = (["낚시", "채집", "채광"] as const).flatMap((kind) =>
    getActiveItems(kind)
      .filter((item) => item.rank >= 1 && item.rank <= 4)
      .map((item) => ({ kind, item })),
  );
  return buildWanderingMerchantStock(eventId, lifeCandidates);
}

export async function loadActiveWanderingMerchant(now = new Date()) {
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
    stock: event.listings.map(rowToStock),
  };
}

export async function countTodayWanderingMerchantSummons(now = new Date()): Promise<number> {
  return prisma.wanderingMerchantEvent.count({
    where: { day: wanderingMerchantDay(now), locationId: WANDERING_MERCHANT_LOCATION_ID },
  });
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
