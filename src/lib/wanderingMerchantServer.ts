import "server-only";

import { prisma } from "@/lib/prisma";
import { collectionItems, findLifeSkillItem, isSeaLifeItem, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import {
  WANDERING_MERCHANT_DURATION_MS,
  WANDERING_MERCHANT_LOCATION_ID,
  WANDERING_MERCHANT_NATURAL_HOURS_KST,
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

// 오늘(KST 기준) 행상인이 저절로 들르는 구간들. KST = UTC+9 라 UTC 로는 9시간을 뺀다.
// 8시 구간은 UTC 기준 전날 23시가 되므로 Date.UTC 의 시(hour) 음수 보정에 맡긴다.
function naturalMerchantWindows(now: Date): { day: string; hour: number; startsAt: Date; endsAt: Date }[] {
  const day = wanderingMerchantDay(now);
  const [year, month, date] = day.split("-").map(Number);
  return WANDERING_MERCHANT_NATURAL_HOURS_KST.map((hour) => {
    const startsAt = new Date(Date.UTC(year, month - 1, date, hour - 9, 0, 0, 0));
    return {
      day,
      hour,
      startsAt,
      endsAt: new Date(startsAt.getTime() + WANDERING_MERCHANT_DURATION_MS),
    };
  });
}

function naturalMerchantWindowAt(now: Date) {
  return naturalMerchantWindows(now).find((w) => now >= w.startsAt && now < w.endsAt) ?? null;
}

// 시각마다 다른 id — 하루에 두 번 오면 각각 별개의 이벤트(재고도 따로)다.
// 20시 구간은 예전 id 를 그대로 써서, 이미 열려 있던 오늘치 이벤트와 겹치지 않게 한다.
function naturalMerchantEventId(day: string, hour: number): string {
  return hour === 20 ? `wandering-merchant-daily-${day}` : `wandering-merchant-daily-${day}-${hour}`;
}

function mapEvent(event: {
  id: string;
  day: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  listings: Parameters<typeof rowToStock>[0][];
}) {
  return {
    id: event.id,
    day: event.day,
    locationId: event.locationId,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    stock: event.listings.map(rowToStock).filter((stock): stock is WanderingMerchantStockItem => stock != null),
  };
}

async function ensureNaturalWanderingMerchant(now: Date) {
  const window = naturalMerchantWindowAt(now);
  if (!window) return null;

  const eventId = naturalMerchantEventId(window.day, window.hour);
  let event = await prisma.wanderingMerchantEvent.upsert({
    where: { id: eventId },
    update: {},
    create: {
      id: eventId,
      day: window.day,
      locationId: WANDERING_MERCHANT_LOCATION_ID,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      createdById: null,
    },
    include: { listings: { orderBy: { slot: "asc" } } },
  });

  if (event.endsAt <= now) return null;
  if (event.listings.length === 0) {
    const stock = await generateStock(event.id);
    if (stock.length > 0) {
      await prisma.wanderingMerchantListing.createMany({
        data: stock,
        skipDuplicates: true,
      });
    }
    event = await prisma.wanderingMerchantEvent.findUniqueOrThrow({
      where: { id: event.id },
      include: { listings: { orderBy: { slot: "asc" } } },
    });
  }
  return mapEvent(event);
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
  if (event) return mapEvent(event);
  return ensureNaturalWanderingMerchant(now);
}

export async function countTodayWanderingMerchantSummons(now = new Date()): Promise<number> {
  return prisma.wanderingMerchantEvent.count({
    where: {
      day: wanderingMerchantDay(now),
      locationId: WANDERING_MERCHANT_LOCATION_ID,
      createdById: { not: null },
    },
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
