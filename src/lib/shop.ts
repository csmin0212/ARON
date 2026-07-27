// 매입소(부산물·재료 판매) 공용 설정 — 한 곳에서 관리

// 매입 대상 분류 (아이템 탭 '분류'). 무기·특수·소모품은 제외.
export const SELLABLE_MATERIAL_CATEGORIES = ["재료", "보석"];

// 판매 금지 아이템. 현재는 없음.
export const NON_SELLABLE_ITEMS: string[] = [];

export const SPECIAL_MATERIAL_SELL_PRICES: Record<string, number> = {
  "강철 파편": 50,
  "달의 파편": 50,
};

export function isNonSellable(itemName: string): boolean {
  return NON_SELLABLE_ITEMS.includes(itemName.trim());
}

export function specialMaterialSellPrice(itemName: string): number | null {
  return SPECIAL_MATERIAL_SELL_PRICES[itemName.trim()] ?? null;
}
