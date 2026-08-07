// 매입소(부산물·재료 판매) 공용 설정 — 한 곳에서 관리

// 매입 대상 분류 (아이템 탭 '분류'). 무기·특수·소모품은 제외.
export const SELLABLE_MATERIAL_CATEGORIES = ["재료", "보석"];

// 판매 금지 아이템. 현재는 없음.
export const NON_SELLABLE_ITEMS: string[] = [];

// 아이템 탭에 판매가가 안 적혀 있던 시절을 위한 '최후의 폴백' 값.
// 정본은 어디까지나 시트(아이템 탭)이고, 여기 값은 시트 판매가가 0/빈칸일 때만 쓴다.
// (예전에는 이게 시트를 덮어써서, 시트에 1000을 적어도 매입소는 계속 50에 사들였다.)
export const FALLBACK_MATERIAL_SELL_PRICES: Record<string, number> = {
  "강철 파편": 50,
  "달의 파편": 50,
};

export function isNonSellable(itemName: string): boolean {
  return NON_SELLABLE_ITEMS.includes(itemName.trim());
}

export function fallbackMaterialSellPrice(itemName: string): number | null {
  return FALLBACK_MATERIAL_SELL_PRICES[itemName.trim()] ?? null;
}

// 이 이름이 매입소가 아는 특수 재료인가 — 가격이 아니라 '분류 추론'에만 쓴다.
export function isSpecialMaterial(itemName: string): boolean {
  return itemName.trim() in FALLBACK_MATERIAL_SELL_PRICES;
}

// 시트(도감) 판매가를 우선하고, 비어 있을 때만 폴백으로 내려간다.
export function resolveMaterialSellPrice(itemName: string, sheetPrice?: number | null): number {
  if (sheetPrice && sheetPrice > 0) return sheetPrice;
  return fallbackMaterialSellPrice(itemName) ?? 0;
}
