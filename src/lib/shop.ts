// 매입소(부산물·재료 판매) 공용 설정 — 한 곳에서 관리

// 매입 대상 분류 (아이템 탭 '분류'). 무기·특수·소모품은 제외.
export const SELLABLE_MATERIAL_CATEGORIES = ["재료", "보석"];

// 판매 금지(보호) 아이템 — 강화·제련 등에 쓰여 실수로 팔면 곤란한 것들.
// 분류가 '재료'여도 이 목록에 있으면 매입소에 노출되지 않고, 판매도 거부된다.
export const NON_SELLABLE_ITEMS = ["강철 파편", "달의 파편"];

export function isNonSellable(itemName: string): boolean {
  return NON_SELLABLE_ITEMS.includes(itemName.trim());
}
