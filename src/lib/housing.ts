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

export type HousingStateData = {
  owned: HouseTier[];
  furniture: Partial<Record<HouseTier, unknown[]>>;
};

export function parseHousingState(
  value: string | null | undefined,
  legacyTier?: string | null,
): HousingStateData {
  const owned = new Set<HouseTier>();
  const legacy = houseOption(legacyTier);
  if (legacy) owned.add(legacy.tier);

  let furniture: Partial<Record<HouseTier, unknown[]>> = {};
  try {
    if (value) {
      const raw = JSON.parse(value) as Partial<HousingStateData>;
      if (Array.isArray(raw.owned)) {
        for (const tier of raw.owned) {
          if (houseOption(tier)) owned.add(tier);
        }
      }
      if (raw.furniture && typeof raw.furniture === "object") {
        furniture = raw.furniture;
      }
    }
  } catch {
    // use legacy fallback
  }

  return {
    owned: HOUSE_OPTIONS.map((option) => option.tier).filter((tier) => owned.has(tier)),
    furniture,
  };
}

export function serializeHousingState(state: HousingStateData): string {
  return JSON.stringify({
    owned: HOUSE_OPTIONS.map((option) => option.tier).filter((tier) =>
      state.owned.includes(tier),
    ),
    furniture: state.furniture ?? {},
  });
}

export function homeLocationId(userId: string, tier: HouseTier): string {
  return `${HOME_LOCATION_PREFIX}${userId}:${tier}`;
}

export function isHomeLocationId(locationId: string | null | undefined): boolean {
  return !!locationId?.startsWith(HOME_LOCATION_PREFIX);
}

export function homeTierFromLocationId(
  locationId: string | null | undefined,
): HouseTier | null {
  if (!isHomeLocationId(locationId)) return null;
  const tier = locationId?.split(":")[2];
  return houseOption(tier)?.tier ?? null;
}

export function isBellTowerLocation(location: { id?: string | null; name?: string | null } | null): boolean {
  const source = `${location?.id ?? ""} ${location?.name ?? ""}`.toLowerCase();
  return source.includes("종탑");
}
