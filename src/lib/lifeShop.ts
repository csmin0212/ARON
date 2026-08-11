import type { LifeSkillKind } from "./lifeSkillData";

// 생활 장비 상점 카탈로그 — 서버(구매 처리)와 클라이언트(목록 표시)가 같은 표를 본다.
// 예전에는 services.ts 와 WorldServices.tsx 에 목록이 따로 있어서, 한쪽만 고치면 조용히 어긋났다.

export type LifeGearGroup = "가방" | "도구" | "탐지";

export type LifeGearProduct = {
  id: string;
  kind: LifeSkillKind;
  group: LifeGearGroup;
  name: string;
  price: number;
  tier: number; // 가방은 최대 중량, 도구·탐지는 단계(1·2)
  note: string;
};

export const LIFE_GEAR_PRODUCTS: readonly LifeGearProduct[] = [
  { id: "fish_bag_10", kind: "낚시", group: "가방", name: "낚시꾼 가방 10칸", price: 1000, tier: 10, note: "낚시 가방 최대 중량 10" },
  { id: "fish_bag_20", kind: "낚시", group: "가방", name: "낚시꾼 가방 20칸", price: 2500, tier: 20, note: "낚시 가방 최대 중량 20" },
  { id: "fish_bag_30", kind: "낚시", group: "가방", name: "낚시꾼 가방 30칸", price: 5000, tier: 30, note: "낚시 가방 최대 중량 30" },
  { id: "plant_bag_10", kind: "채집", group: "가방", name: "약초꾼 가방 10칸", price: 1000, tier: 10, note: "채집 가방 최대 중량 10" },
  { id: "plant_bag_20", kind: "채집", group: "가방", name: "약초꾼 가방 20칸", price: 2500, tier: 20, note: "채집 가방 최대 중량 20" },
  { id: "plant_bag_30", kind: "채집", group: "가방", name: "약초꾼 가방 30칸", price: 5000, tier: 30, note: "채집 가방 최대 중량 30" },
  { id: "mine_bag_10", kind: "채광", group: "가방", name: "광부 가방 10칸", price: 1000, tier: 10, note: "채광 가방 최대 중량 10" },
  { id: "mine_bag_20", kind: "채광", group: "가방", name: "광부 가방 20칸", price: 2500, tier: 20, note: "채광 가방 최대 중량 20" },
  { id: "mine_bag_30", kind: "채광", group: "가방", name: "광부 가방 30칸", price: 5000, tier: 30, note: "채광 가방 최대 중량 30" },

  { id: "good_rod", kind: "낚시", group: "도구", name: "좋은 낚싯대", price: 2500, tier: 1, note: "낚시 장비 1단계" },
  { id: "master_rod", kind: "낚시", group: "도구", name: "고급 낚싯대", price: 7000, tier: 2, note: "낚시 장비 2단계" },
  { id: "good_sickle", kind: "채집", group: "도구", name: "숙련 채집 도구", price: 2500, tier: 1, note: "채집 장비 1단계" },
  { id: "master_sickle", kind: "채집", group: "도구", name: "장인의 채집 도구", price: 7000, tier: 2, note: "채집 장비 2단계" },
  { id: "iron_pick", kind: "채광", group: "도구", name: "철 곡괭이", price: 2500, tier: 1, note: "채광 장비 1단계" },
  { id: "mithril_pick", kind: "채광", group: "도구", name: "미스릴 곡괭이", price: 7000, tier: 2, note: "채광 장비 2단계" },

  { id: "fish_radar_1", kind: "낚시", group: "탐지", name: "어군 탐지기", price: 4000, tier: 1, note: "가방에 등급별 확률 표시" },
  { id: "fish_radar_2", kind: "낚시", group: "탐지", name: "어군 감정기", price: 15000, tier: 2, note: "확률 + 나오는 어종까지" },
  { id: "plant_radar_1", kind: "채집", group: "탐지", name: "약초 탐지기", price: 4000, tier: 1, note: "가방에 등급별 확률 표시" },
  { id: "plant_radar_2", kind: "채집", group: "탐지", name: "약초 감정기", price: 15000, tier: 2, note: "확률 + 나오는 약초까지" },
  { id: "mine_radar_1", kind: "채광", group: "탐지", name: "광물 탐지기", price: 4000, tier: 1, note: "가방에 등급별 확률 표시" },
  { id: "mine_radar_2", kind: "채광", group: "탐지", name: "광물 감정기", price: 15000, tier: 2, note: "확률 + 나오는 광물까지" },
] as const;

export const LIFE_GEAR_GROUPS: readonly LifeGearGroup[] = ["가방", "도구", "탐지"];

export function lifeGearProduct(id: string): LifeGearProduct | null {
  return LIFE_GEAR_PRODUCTS.find((product) => product.id === id) ?? null;
}

// 같은 종류·그룹에서 특정 단계의 정가 (하위 장비 매각 환불 계산용)
export function lifeGearPriceAt(kind: LifeSkillKind, group: LifeGearGroup, tier: number): number {
  return LIFE_GEAR_PRODUCTS.find((p) => p.kind === kind && p.group === group && p.tier === tier)?.price ?? 0;
}

export function lifeGearNameAt(kind: LifeSkillKind, group: LifeGearGroup, tier: number): string | null {
  return LIFE_GEAR_PRODUCTS.find((p) => p.kind === kind && p.group === group && p.tier === tier)?.name ?? null;
}
