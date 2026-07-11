export type HouseTier = "small" | "standard" | "luxury";
export type HousingProductionKind = "낚시" | "채집";

export const HOUSING_PRODUCTION_KINDS: readonly HousingProductionKind[] = ["낚시", "채집"] as const;
export const HOUSING_PRODUCTION_MAX_SLOTS = 5;
export const HOUSING_PRODUCTION_SCORE_BY_RANK = [1, 3, 6, 10, 30, 100] as const;
export const HOUSING_PRODUCTION_COST_BY_RANK = [10, 50, 100, 250, 1000, 5000] as const;

export type HousingProductionSlot = {
  name: string;
  rank: number;
  weight: number;
  text: string;
};

export type HousingProductionState = {
  points: number;
  lastAccruedDay: string | null;
  slots: HousingProductionSlot[];
};

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
  | { type: "production"; kind: HousingProductionKind } // 어항/화분 — 투입 아이템으로 일일 포인트 생산
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
    price: 1000,
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
    price: 10000,
    desc: "눕는 순간 기억이 끊긴다. 집 휴식 회복 +40.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 40 },
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
    desc: "채집물을 최대 5개 심어 매일 화분 점수를 모은다. 점수로 도감에 등록한 채집물을 꺼낼 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "채집" },
  },
  {
    id: "aquarium",
    name: "어항",
    emoji: "🐠",
    price: 2000,
    desc: "물고기를 최대 5마리 넣어 매일 어항 점수를 모은다. 점수로 도감에 등록한 물고기를 꺼낼 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "낚시" },
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
  production: Record<HousingProductionKind, HousingProductionState>;
};

function emptyProductionState(): Record<HousingProductionKind, HousingProductionState> {
  return {
    낚시: { points: 0, lastAccruedDay: null, slots: [] },
    채집: { points: 0, lastAccruedDay: null, slots: [] },
  };
}

function clampRank(rank: unknown): number {
  const n = typeof rank === "number" ? rank : Number(rank);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(n)));
}

function normalizeProduction(
  value: Partial<Record<HousingProductionKind, Partial<HousingProductionState>>> | undefined,
): Record<HousingProductionKind, HousingProductionState> {
  const normalized = emptyProductionState();
  for (const kind of HOUSING_PRODUCTION_KINDS) {
    const source = value?.[kind];
    normalized[kind] = {
      points: Math.max(0, Math.trunc(Number(source?.points ?? 0) || 0)),
      lastAccruedDay: typeof source?.lastAccruedDay === "string" ? source.lastAccruedDay : null,
      slots: Array.isArray(source?.slots)
        ? source.slots
            .filter((slot) => slot && typeof slot.name === "string" && slot.name.trim())
            .slice(0, HOUSING_PRODUCTION_MAX_SLOTS)
            .map((slot) => ({
              name: slot.name.trim(),
              rank: clampRank(slot.rank),
              weight: Math.max(0, Math.trunc(Number(slot.weight ?? 1) || 1)),
              text: typeof slot.text === "string" ? slot.text : "",
            }))
        : [],
    };
  }
  return normalized;
}

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
  let production = emptyProductionState();
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
        items = [
          ...new Set(raw.items.filter((id): id is string => !!furnitureOption(id as string))),
        ];
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
      if (raw.production && typeof raw.production === "object") {
        production = normalizeProduction(raw.production);
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
    production,
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
    production: normalizeProduction(state.production),
  });
}

function kstDayKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

function dayIndex(dayKey: string): number | null {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

export function productionDailyPoints(state: HousingProductionState): number {
  return state.slots.reduce(
    (sum, slot) => sum + (HOUSING_PRODUCTION_SCORE_BY_RANK[clampRank(slot.rank)] ?? 0),
    0,
  );
}

export function productionRedeemCost(rank: number): number {
  return HOUSING_PRODUCTION_COST_BY_RANK[clampRank(rank)] ?? HOUSING_PRODUCTION_COST_BY_RANK[0];
}

export function accrueHousingProduction(state: HousingStateData, now = new Date()): boolean {
  const today = kstDayKey(now);
  const todayIndex = dayIndex(today);
  if (todayIndex == null) return false;

  let changed = false;
  for (const kind of HOUSING_PRODUCTION_KINDS) {
    const production = state.production[kind];
    if (!production.lastAccruedDay) {
      production.lastAccruedDay = today;
      changed = true;
      continue;
    }
    const previousIndex = dayIndex(production.lastAccruedDay);
    if (previousIndex == null || previousIndex >= todayIndex) continue;
    const days = todayIndex - previousIndex;
    production.points += productionDailyPoints(production) * days;
    production.lastAccruedDay = today;
    changed = true;
  }
  return changed;
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
