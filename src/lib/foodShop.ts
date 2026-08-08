// 식료품 상점 취급 품목. 아이템 탭(도감)에 행이 없고 여기서만 정의되므로,
// 경매장 하한가도 이 표를 봐야 한다 — 안 보면 고기·물·과일·치즈가 0G 로 잡힌다.

export type FoodItem = {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  weight: number;
  desc: string;
};

export const FOOD_ITEMS: readonly FoodItem[] = [
  { id: "egg", name: "달걀", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "milk", name: "우유", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "meat", name: "고기", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "vegetable", name: "채소", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "fruit", name: "과일", buyPrice: 10, sellPrice: 5, weight: 1, desc: "요리용 식재료" },
  { id: "water", name: "물", buyPrice: 5, sellPrice: 2, weight: 1, desc: "요리용 식재료" },
  { id: "wheat", name: "밀", buyPrice: 20, sellPrice: 10, weight: 1, desc: "요리용 식재료" },
  { id: "salt", name: "소금", buyPrice: 30, sellPrice: 15, weight: 1, desc: "요리용 식재료" },
  { id: "spice", name: "향신료", buyPrice: 50, sellPrice: 25, weight: 1, desc: "요리용 식재료" },
  { id: "cheese", name: "치즈", buyPrice: 50, sellPrice: 25, weight: 1, desc: "요리용 식재료" },
] as const;

export function foodShopItem(nameOrId: string): FoodItem | null {
  const raw = nameOrId.trim();
  return FOOD_ITEMS.find((item) => item.id === raw || item.name === raw) ?? null;
}

export function foodShopSellPrice(nameOrId: string): number | null {
  const item = foodShopItem(nameOrId);
  return item && item.sellPrice > 0 ? item.sellPrice : null;
}
