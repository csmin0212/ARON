import { kstDayKey } from "./world";
import type { LifeSkillKind, LifeSkillItem } from "./lifeSkillData";

export const BLACK_MARKET_COIN_NAME = "암상인 코인";
export const BLACK_MARKET_QUEST_REWARD = 3;

export const BLACK_MARKET_POTIONS = [
  {
    id: "망각의물약",
    itemName: "망각의 물약",
    coinPrice: 5,
  },
  {
    id: "변화의물약",
    itemName: "변화의 물약",
    coinPrice: 10,
  },
  {
    id: "망각의 축복",
    itemName: "망각의 축복",
    coinPrice: 50,
  },
] as const;

export const BLACK_MARKET_EXCHANGE_OFFERS = [
  {
    id: "coin_500",
    goldCost: 500,
    coinReward: 1,
    dailyLimit: 2,
  },
  {
    id: "coin_1000",
    goldCost: 1000,
    coinReward: 1,
    dailyLimit: 5,
  },
  {
    id: "coin_2000",
    goldCost: 2000,
    coinReward: 1,
    dailyLimit: null,
  },
] as const;

export type BlackMarketPotionProduct = (typeof BLACK_MARKET_POTIONS)[number];
export type BlackMarketExchangeOffer = (typeof BLACK_MARKET_EXCHANGE_OFFERS)[number];

export type BlackMarketExchangeState = {
  day: string;
  used: Partial<Record<BlackMarketExchangeOffer["id"], number>>;
};

export function blackMarketPotionProduct(productId: string): BlackMarketPotionProduct | null {
  return (
    BLACK_MARKET_POTIONS.find(
      (item) => item.id === productId || item.itemName === productId,
    ) ?? null
  );
}

export function blackMarketExchangeOffer(offerId: string): BlackMarketExchangeOffer | null {
  return BLACK_MARKET_EXCHANGE_OFFERS.find((offer) => offer.id === offerId) ?? null;
}

export function parseBlackMarketExchangeState(json: string | null | undefined): BlackMarketExchangeState {
  if (!json) return { day: "", used: {} };
  try {
    const v = JSON.parse(json) as Partial<BlackMarketExchangeState>;
    return {
      day: v.day ?? "",
      used: typeof v.used === "object" && v.used ? v.used : {},
    };
  } catch {
    return { day: "", used: {} };
  }
}

export function refreshBlackMarketExchangeState(
  state: BlackMarketExchangeState,
  now: Date = new Date(),
): boolean {
  const today = kstDayKey(now);
  if (state.day === today) return false;
  state.day = today;
  state.used = {};
  return true;
}

export type BlackMarketQuestOffer = {
  id: string;
  itemName: string;
  value: number;
  qty: number;
  rewardCoins: number;
};

export type BlackMarketQuestState = {
  day: string;
  offer: BlackMarketQuestOffer | null;
  deliveredAt: string | null;
};

export type BlackMarketStockItem = {
  id: string;
  day: string;
  slot: string;
  kind: LifeSkillKind | "스킬북";
  itemName: string;
  rank: number;
  price: number;
  stock: number;
  initialStock: number;
  meta: string | null;
};

export type BlackMarketLifeCandidate = {
  kind: LifeSkillKind;
  item: LifeSkillItem;
};

export const BLACK_MARKET_MATERIALS = [
  { itemName: "그리폰 깃털", value: 60 },
  { itemName: "크라그 독수리의 발톱", value: 30 },
  { itemName: "동굴 박쥐의 날개막", value: 20 },
  { itemName: "살아있는 어둠의 조각", value: 150 },
  { itemName: "모래 전갈의 독침", value: 40 },
  { itemName: "사막 도마뱀의 가죽", value: 35 },
  { itemName: "습지 악어의 이빨", value: 50 },
  { itemName: "도깨비불의 정수", value: 75 },
  { itemName: "유령의 잔재", value: 65 },
  { itemName: "숲 늑대의 송곳니", value: 25 },
  { itemName: "수사슴의 뿔 조각", value: 30 },
  { itemName: "네잎클로버", value: 25 },
  { itemName: "달빛풀", value: 50 },
  { itemName: "유령선의 녹슨 못", value: 75 },
  { itemName: "늙은 참나무의 심재", value: 25 },
  { itemName: "물에 잠긴 기도서", value: 100 },
  { itemName: "메아리 결정", value: 75 },
  { itemName: "반딧불 호박", value: 40 },
  { itemName: "정령의 눈물", value: 90 },
  { itemName: "풍화를 거부한 석상 조각", value: 100 },
  { itemName: "설표의 어금니", value: 90 },
  { itemName: "프리즘 수정", value: 75 },
  { itemName: "첫빛의 이슬", value: 60 },
  { itemName: "벼랑매의 발톱", value: 75 },
  { itemName: "지맥의 쇳덩이", value: 60 },
  { itemName: "소원이 깃든 동전", value: 100 },
  { itemName: "크라켄의 빨판", value: 200 },
  { itemName: "청옥 물방울", value: 75 },
  { itemName: "여명의 결정", value: 75 },
  { itemName: "질풍의 깃털", value: 75 },
  { itemName: "대지의 심장석", value: 75 },
  { itemName: "이무기의 비늘", value: 90 },
  { itemName: "산울림 돌", value: 90 },
  { itemName: "생명의 수정", value: 50 },
  { itemName: "마력의 수정", value: 50 },
  { itemName: "가시덩굴의 심장", value: 45 },
  { itemName: "마력 코어 파편", value: 75 },
  { itemName: "요마의 뿔", value: 120 },
  { itemName: "마족의 핵", value: 300 },
  { itemName: "거인의 골편", value: 300 },
  { itemName: "용린 조각", value: 600 },
] as const;

const BLACK_MARKET_QUEST_QTY_1 = new Set([
  "마족의 핵",
  "거인의 골편",
  "용린 조각",
  "크라켄의 빨판",
]);

const BLACK_MARKET_QUEST_QTY_2 = new Set([
  "소원이 깃든 동전",
  "요마의 뿔",
  "풍화를 거부한 석상 조각",
  "정령의 눈물",
  "물에 잠긴 기도서",
  "살아있는 어둠의 조각",
]);

const EMPTY_QUEST_STATE: BlackMarketQuestState = {
  day: "",
  offer: null,
  deliveredAt: null,
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uniqueByName<T extends { itemName: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.itemName)) return false;
    seen.add(item.itemName);
    return true;
  });
}

export function blackMarketQuestQty(itemName: string): number {
  const name = itemName.trim();
  if (BLACK_MARKET_QUEST_QTY_1.has(name)) return 1;
  if (BLACK_MARKET_QUEST_QTY_2.has(name)) return 2;
  return 4;
}

export function generateBlackMarketQuest(day = kstDayKey(new Date())): BlackMarketQuestOffer {
  const material = pick(BLACK_MARKET_MATERIALS);
  return {
    id: `${day}-${material.itemName}`,
    itemName: material.itemName,
    value: material.value,
    qty: blackMarketQuestQty(material.itemName),
    rewardCoins: BLACK_MARKET_QUEST_REWARD,
  };
}

export function parseBlackMarketQuestState(json: string | null | undefined): BlackMarketQuestState {
  if (!json) return structuredClone(EMPTY_QUEST_STATE);
  try {
    const v = JSON.parse(json) as Partial<BlackMarketQuestState>;
    return {
      day: v.day ?? "",
      offer: v.offer ?? null,
      deliveredAt: v.deliveredAt ?? null,
    };
  } catch {
    return structuredClone(EMPTY_QUEST_STATE);
  }
}

export function refreshBlackMarketQuestState(
  state: BlackMarketQuestState,
  now: Date = new Date(),
): boolean {
  const today = kstDayKey(now);
  if (state.day === today && state.offer) return false;
  state.day = today;
  state.offer = generateBlackMarketQuest(today);
  state.deliveredAt = null;
  return true;
}

export function buildBlackMarketStock(
  day: string,
  lifeCandidates: BlackMarketLifeCandidate[],
  skillbooks: { itemId: string; skillName: string }[],
): BlackMarketStockItem[] {
  const byRank = (rank: number) => lifeCandidates.filter((entry) => entry.item.rank === rank);
  const stock: BlackMarketStockItem[] = [];
  const used = new Set<string>();

  const addLife = (slot: string, entry: BlackMarketLifeCandidate, price: number, initialStock: number) => {
    used.add(`${entry.kind}:${entry.item.name}`);
    stock.push({
      id: `${day}-${slot}`,
      day,
      slot,
      kind: entry.kind,
      itemName: entry.item.name,
      rank: entry.item.rank,
      price,
      stock: initialStock,
      initialStock,
      meta: null,
    });
  };

  let rank3Pool = byRank(3);
  for (let i = 0; i < 3 && rank3Pool.length > 0; i += 1) {
    const entry = pick(rank3Pool);
    addLife(`r3-${i + 1}`, entry, 1, 3);
    rank3Pool = rank3Pool.filter((candidate) => `${candidate.kind}:${candidate.item.name}` !== `${entry.kind}:${entry.item.name}`);
  }

  const rank4Pool = byRank(4).filter((entry) => !used.has(`${entry.kind}:${entry.item.name}`));
  if (rank4Pool.length > 0) addLife("r4-1", pick(rank4Pool), 10, 1);

  if (Math.random() < 0.1 && skillbooks.length > 0) {
    const book = pick(skillbooks);
    stock.push({
      id: `${day}-skillbook-1`,
      day,
      slot: "skillbook-1",
      kind: "스킬북",
      itemName: book.itemId,
      rank: 0,
      price: 20,
      stock: 1,
      initialStock: 1,
      meta: JSON.stringify({ skillName: book.skillName }),
    });
  }

  const rank5Pool = byRank(5).filter((entry) => !used.has(`${entry.kind}:${entry.item.name}`));
  if (Math.random() < 0.03 && rank5Pool.length > 0) {
    addLife("r5-1", pick(rank5Pool), 70, 1);
  }

  return uniqueByName(stock);
}
