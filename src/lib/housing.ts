export type HouseTier = "small" | "standard" | "luxury";

export type HouseOption = {
  tier: HouseTier;
  name: string;
  price: number;
  restAmount: number;
  note: string;
};

export const HOME_LOCATION_PREFIX = "home:";

export const HOUSE_OPTIONS: readonly HouseOption[] = [
  {
    tier: "small",
    name: "작은 집",
    price: 1000,
    restAmount: 30,
    note: "작지만 내 침대가 있는 방. 휴식 시 피로도 30 회복.",
  },
  {
    tier: "standard",
    name: "아늑한 주택",
    price: 5000,
    restAmount: 60,
    note: "손님을 맞을 여유가 있는 평범한 집. 휴식 시 피로도 60 회복.",
  },
  {
    tier: "luxury",
    name: "호화로운 저택",
    price: 20000,
    restAmount: 100,
    note: "종탑 거리에서도 눈에 띄는 넓은 저택. 휴식 시 피로도 100 회복.",
  },
] as const;

export function houseOption(tier: string | null | undefined): HouseOption | null {
  return HOUSE_OPTIONS.find((option) => option.tier === tier) ?? null;
}

export function homeLocationId(userId: string): string {
  return `${HOME_LOCATION_PREFIX}${userId}`;
}

export function isHomeLocationId(locationId: string | null | undefined): boolean {
  return !!locationId?.startsWith(HOME_LOCATION_PREFIX);
}

export function isBellTowerLocation(location: { id?: string | null; name?: string | null } | null): boolean {
  const source = `${location?.id ?? ""} ${location?.name ?? ""}`.toLowerCase();
  return source.includes("종탑");
}
