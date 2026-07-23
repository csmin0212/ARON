import { kstDayKey } from "./world";
import { type LifeSkillItem, type LifeSkillKind } from "./lifeSkillData";

export const WANDERING_MERCHANT_LOCATION_ID = "대상야영지";
export const WANDERING_MERCHANT_LOCATION_NAME = "대상 야영지";
export const WANDERING_MERCHANT_DURATION_MS = 60 * 60 * 1000;
export const VITALITY_POTION_EVENT_NAME = "활력의 포션 이벤트";
export const MYSTERY_PARCHMENT_NAME = "의문의 양피지";

export type WanderingMerchantKind = LifeSkillKind | "포션" | "소모품";

export type WanderingMerchantStockItem = {
  id: string;
  eventId: string;
  slot: string;
  kind: WanderingMerchantKind;
  itemName: string;
  rank: number;
  price: number;
  stock: number;
  initialStock: number;
  meta: string | null;
};

export type WanderingMerchantLifeCandidate = {
  kind: LifeSkillKind;
  item: LifeSkillItem;
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uniqueLifeKey(entry: WanderingMerchantLifeCandidate): string {
  return `${entry.kind}:${entry.item.name}`;
}

function lifePrice(entry: WanderingMerchantLifeCandidate): number {
  return wanderingMerchantLifePrice(entry.item);
}

export function isWanderingMerchantLifeKind(kind: string): kind is LifeSkillKind {
  return kind === "낚시" || kind === "채집" || kind === "채광";
}

export function wanderingMerchantLifePrice(item: LifeSkillItem): number {
  return Math.max(1, item.price * 2);
}

export function wanderingMerchantDay(now = new Date()): string {
  return kstDayKey(now);
}

export function buildWanderingMerchantStock(
  eventId: string,
  lifeCandidates: WanderingMerchantLifeCandidate[],
): WanderingMerchantStockItem[] {
  const stock: WanderingMerchantStockItem[] = [];
  const used = new Set<string>();
  const byRank = (rank: number) =>
    lifeCandidates.filter((entry) => entry.item.rank === rank && !used.has(uniqueLifeKey(entry)));

  const addLife = (
    slot: string,
    entry: WanderingMerchantLifeCandidate,
    initialStock: number,
  ) => {
    used.add(uniqueLifeKey(entry));
    stock.push({
      id: `${eventId}-${slot}`,
      eventId,
      slot,
      kind: entry.kind,
      itemName: entry.item.name,
      rank: entry.item.rank,
      price: lifePrice(entry),
      stock: initialStock,
      initialStock,
      meta: null,
    });
  };

  const rankRules = [
    { rank: 1, count: 3, qty: 5 },
    { rank: 2, count: 3, qty: 3 },
    { rank: 3, count: 3, qty: 1 },
    { rank: 4, count: 1, qty: 1 },
  ];
  for (const rule of rankRules) {
    let pool = byRank(rule.rank);
    for (let i = 0; i < rule.count && pool.length > 0; i += 1) {
      const entry = pick(pool);
      addLife(`r${rule.rank}-${i + 1}`, entry, rule.qty);
      pool = pool.filter((candidate) => uniqueLifeKey(candidate) !== uniqueLifeKey(entry));
    }
  }

  stock.push({
    id: `${eventId}-vitality-200`,
    eventId,
    slot: "vitality-200",
    kind: "포션",
    itemName: VITALITY_POTION_EVENT_NAME,
    rank: 0,
    price: 200,
    stock: 5,
    initialStock: 5,
    meta: JSON.stringify({ label: "기본가" }),
  });

  if (Math.random() < 0.3) {
    stock.push({
      id: `${eventId}-vitality-150`,
      eventId,
      slot: "vitality-150",
      kind: "포션",
      itemName: VITALITY_POTION_EVENT_NAME,
      rank: 0,
      price: 150,
      stock: 5,
      initialStock: 5,
      meta: JSON.stringify({ label: "할인가" }),
    });
  }

  if (Math.random() < 0.3) {
    stock.push({
      id: `${eventId}-parchment`,
      eventId,
      slot: "parchment",
      kind: "소모품",
      itemName: MYSTERY_PARCHMENT_NAME,
      rank: 0,
      price: 1500,
      stock: 1,
      initialStock: 1,
      meta: null,
    });
  }

  return stock;
}
