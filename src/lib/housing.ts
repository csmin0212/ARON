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

export function houseSellPrice(tier: string | null | undefined): number {
  const option = houseOption(tier);
  return option ? Math.floor(option.price / 2) : 0;
}

export function ownedHouseOptions(state: HousingStateData): HouseOption[] {
  return HOUSE_OPTIONS.filter((option) => state.owned.includes(option.tier));
}

// ── 가구 ──
// 가구는 집이 아니라 캐릭터에 귀속된다(items) — 집을 옮기거나 팔아도 유지.
export type FurnitureEffect =
  | { type: "rest_bonus"; amount: number } // 침구류 — 집 휴식 회복량 가산 (보유 침대 중 최댓값만 적용)
  | { type: "daily_ap"; amount: number } // 하루 1회 상호작용 — 피로도 회복
  | { type: "daily_gold"; min: number; max: number } // 하루 1회 상호작용 — 골드
  | { type: "daily_forage"; kind: "낚시" | "채집" | "채광"; maxRank: number } // 하루 1회 — 저랭크 생활 아이템
  | { type: "nameplate" } // 집 이름 짓기 해금
  | { type: "guestbook" }; // 방문객 방명록 해금

export type FurnitureOption = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  interactLabel: string | null; // null 이면 패시브(버튼 없음)
  effect: FurnitureEffect;
};

export const FURNITURE_OPTIONS: readonly FurnitureOption[] = [
  {
    id: "bed_old",
    name: "낡은 침대",
    emoji: "🛏️",
    price: 800,
    desc: "삐걱거리지만 눕긴 눕는다. 집 휴식 회복 +10.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 10 },
  },
  {
    id: "bed_cozy",
    name: "포근한 침대",
    emoji: "🛌",
    price: 2500,
    desc: "볕에 말린 이불 냄새가 난다. 집 휴식 회복 +20.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 20 },
  },
  {
    id: "bed_cloud",
    name: "구름솜 침대",
    emoji: "☁️",
    price: 6000,
    desc: "눕는 순간 기억이 끊긴다. 집 휴식 회복 +35.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 35 },
  },
  {
    id: "fireplace",
    name: "벽난로",
    emoji: "🔥",
    price: 1500,
    desc: "장작 타는 소리가 마음을 녹인다. 하루 1회 불을 쬐면 피로도 +10.",
    interactLabel: "불 쬐기",
    effect: { type: "daily_ap", amount: 10 },
  },
  {
    id: "planter",
    name: "약초 화분",
    emoji: "🪴",
    price: 2000,
    desc: "창가에서 무럭무럭 자란다. 하루 1회 돌보면 채집물이 하나 자라 있다.",
    interactLabel: "돌보기",
    effect: { type: "daily_forage", kind: "채집", maxRank: 1 },
  },
  {
    id: "aquarium",
    name: "어항",
    emoji: "🐠",
    price: 2000,
    desc: "물고기가 유유히 헤엄친다. 하루 1회 먹이를 주면 한 마리 불어나 있다.",
    interactLabel: "먹이 주기",
    effect: { type: "daily_forage", kind: "낚시", maxRank: 1 },
  },
  {
    id: "piggy_bank",
    name: "돼지 저금통",
    emoji: "🐖",
    price: 1000,
    desc: "어디서 모아오는 걸까. 하루 1회 흔들면 동전이 떨어진다. (5~30G)",
    interactLabel: "흔들기",
    effect: { type: "daily_gold", min: 5, max: 30 },
  },
  {
    id: "nameplate",
    name: "문패",
    emoji: "🪧",
    price: 500,
    desc: "집에 이름을 새길 수 있다. 문패를 달면 집 이름을 직접 지을 수 있어요.",
    interactLabel: null,
    effect: { type: "nameplate" },
  },
  {
    id: "guestbook_stand",
    name: "방명록대",
    emoji: "📖",
    price: 800,
    desc: "깃펜과 두툼한 장부. 놀러 온 친구가 글을 남길 수 있게 된다.",
    interactLabel: null,
    effect: { type: "guestbook" },
  },
] as const;

export function furnitureOption(id: string | null | undefined): FurnitureOption | null {
  return FURNITURE_OPTIONS.find((option) => option.id === id) ?? null;
}

export type HousingStateData = {
  owned: HouseTier[];
  furniture: Partial<Record<HouseTier, unknown[]>>; // 레거시 — 과거 배치 기록 (가구배치수 업적 호환)
  items: string[]; // 보유 가구 id 목록
  homeName: string | null; // 문패로 지은 집 이름
  usedAt: Record<string, string>; // 가구 id → 마지막 일일 상호작용 ISO 시각
};

export function parseHousingState(
  value: string | null | undefined,
  legacyTier?: string | null,
): HousingStateData {
  const owned = new Set<HouseTier>();
  const legacy = houseOption(legacyTier);
  if (legacy) owned.add(legacy.tier);

  let furniture: Partial<Record<HouseTier, unknown[]>> = {};
  let items: string[] = [];
  let homeName: string | null = null;
  let usedAt: Record<string, string> = {};
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
      if (Array.isArray(raw.items)) {
        items = raw.items.filter((id): id is string => !!furnitureOption(id as string));
      }
      if (typeof raw.homeName === "string" && raw.homeName.trim()) {
        homeName = raw.homeName.trim().slice(0, 16);
      }
      if (raw.usedAt && typeof raw.usedAt === "object") {
        usedAt = Object.fromEntries(
          Object.entries(raw.usedAt).filter(
            ([id, at]) => furnitureOption(id) && typeof at === "string",
          ),
        );
      }
    }
  } catch {
    // use legacy fallback
  }

  return {
    owned: HOUSE_OPTIONS.map((option) => option.tier).filter((tier) => owned.has(tier)),
    furniture,
    items,
    homeName,
    usedAt,
  };
}

export function serializeHousingState(state: HousingStateData): string {
  return JSON.stringify({
    owned: HOUSE_OPTIONS.map((option) => option.tier).filter((tier) =>
      state.owned.includes(tier),
    ),
    furniture: state.furniture ?? {},
    items: state.items ?? [],
    homeName: state.homeName ?? null,
    usedAt: state.usedAt ?? {},
  });
}

// 보유 침구류 중 최고 휴식 보너스 (중첩 없음)
export function bedRestBonus(state: HousingStateData): number {
  return state.items.reduce((max, id) => {
    const effect = furnitureOption(id)?.effect;
    return effect?.type === "rest_bonus" ? Math.max(max, effect.amount) : max;
  }, 0);
}

export function hasFurnitureEffect(
  state: HousingStateData,
  type: FurnitureEffect["type"],
): boolean {
  return state.items.some((id) => furnitureOption(id)?.effect.type === type);
}

// 집 표시명 — "OO의 작은 집" / 문패가 있으면 "OO의 {지은 이름}"
export function homeDisplayName(
  ownerNickname: string,
  state: HousingStateData,
  tier: HouseTier | null,
): string {
  const base = state.homeName ?? houseOption(tier)?.name ?? "집";
  return `${ownerNickname}의 ${base}`;
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

// 집 장소ID의 소유자 userId — "home:{userId}:{tier}"
export function homeOwnerFromLocationId(locationId: string | null | undefined): string | null {
  if (!isHomeLocationId(locationId)) return null;
  return locationId?.split(":")[1] || null;
}

export function isBellTowerLocation(location: { id?: string | null; name?: string | null } | null): boolean {
  const source = `${location?.id ?? ""} ${location?.name ?? ""}`.toLowerCase();
  return source.includes("종탑");
}
