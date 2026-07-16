export type HouseTier = "small" | "standard" | "luxury";
export type HousingProductionKind = "낚시" | "채집";

export const HOUSING_PRODUCTION_KINDS: readonly HousingProductionKind[] = ["낚시", "채집"] as const;
// 파싱 시 허용하는 절대 상한 (최상위 가구 기준). 실제 보관 한도는 보유 가구의 slots.
export const HOUSING_PRODUCTION_MAX_SLOTS = 15;
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
  | { type: "production"; kind: HousingProductionKind; slots: number } // 어항/화분 — 투입 한도는 티어별
  | { type: "nameplate" } // 집 이름 짓기 해금
  | { type: "guestbook" } // 방문객 방명록 해금
  | { type: "alchemy"; tolerance: number }; // 연금술 공방 — 완벽 판정 허용 오차(분) 보너스

export type FurnitureOption = {
  id: string;
  name: string;
  emoji: string;
  price: number;
  desc: string;
  interactLabel: string | null; // null 이면 패시브(버튼 없음)
  effect: FurnitureEffect;
  // 같은 family 는 한 개만 보유 — 상위 tier 구매 시 하위를 반값에 자동 판매하고 교체 (집과 동일)
  family?: "bed" | "aquarium" | "planter" | "bank" | "alchemy";
  tier?: number; // family 내 등급 (1이 최하위)
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
    family: "bed",
    tier: 1,
  },
  {
    id: "bed_cozy",
    name: "포근한 침대",
    emoji: "🛌",
    price: 2500,
    desc: "볕에 말린 이불 냄새가 난다. 집 휴식 회복 +20.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 20 },
    family: "bed",
    tier: 2,
  },
  {
    id: "bed_cloud",
    name: "구름솜 침대",
    emoji: "☁️",
    price: 10000,
    desc: "눕는 순간 기억이 끊긴다. 집 휴식 회복 +40.",
    interactLabel: null,
    effect: { type: "rest_bonus", amount: 40 },
    family: "bed",
    tier: 3,
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
    effect: { type: "production", kind: "채집", slots: 5 },
    family: "planter",
    tier: 1,
  },
  {
    id: "planter_terrace",
    name: "약초 화단",
    emoji: "🌷",
    price: 5000,
    desc: "창가를 가득 채운 화단. 채집물을 최대 10개까지 심어둘 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "채집", slots: 10 },
    family: "planter",
    tier: 2,
  },
  {
    id: "planter_garden",
    name: "비밀 정원",
    emoji: "🌺",
    price: 15000,
    desc: "집 뒤편에 꾸민 나만의 정원. 채집물을 최대 15개까지 심어둘 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "채집", slots: 15 },
    family: "planter",
    tier: 3,
  },
  {
    id: "aquarium",
    name: "어항",
    emoji: "🐠",
    price: 2000,
    desc: "물고기를 최대 5마리 넣어 매일 어항 점수를 모은다. 점수로 도감에 등록한 물고기를 꺼낼 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "낚시", slots: 5 },
    family: "aquarium",
    tier: 1,
  },
  {
    id: "aquarium_grand",
    name: "큰 어항",
    emoji: "🐟",
    price: 5000,
    desc: "수초와 자갈까지 갖춘 널찍한 어항. 물고기를 최대 10마리까지 넣을 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "낚시", slots: 10 },
    family: "aquarium",
    tier: 2,
  },
  {
    id: "aquarium_coral",
    name: "산호 수족관",
    emoji: "🪸",
    price: 15000,
    desc: "산호가 흔들리는 바닷속 한 조각. 물고기를 최대 15마리까지 넣을 수 있다.",
    interactLabel: null,
    effect: { type: "production", kind: "낚시", slots: 15 },
    family: "aquarium",
    tier: 3,
  },
  {
    id: "piggy_bank",
    name: "돼지 저금통",
    emoji: "🐖",
    price: 1000,
    desc: "어디서 모아오는 걸까. 하루 1회 흔들면 동전이 떨어진다. (5~30G)",
    interactLabel: "흔들기",
    effect: { type: "daily_gold", min: 5, max: 30 },
    family: "bank",
    tier: 1,
  },
  {
    id: "piggy_gold",
    name: "황금 돼지 저금통",
    emoji: "🪙",
    price: 5000,
    desc: "금빛으로 반질반질한 복돼지. 하루 1회 흔들면 제법 묵직하게 떨어진다. (30~50G)",
    interactLabel: "흔들기",
    effect: { type: "daily_gold", min: 30, max: 50 },
    family: "bank",
    tier: 2,
  },
  {
    id: "dragon_vault",
    name: "용의 금고",
    emoji: "🐉",
    price: 12000,
    desc: "작은 용이 보물을 물어다 쌓아두는 금고. 하루 1회 열면 반짝인다. (50~100G)",
    interactLabel: "금고 열기",
    effect: { type: "daily_gold", min: 50, max: 100 },
    family: "bank",
    tier: 3,
  },
  {
    id: "alchemy_lab",
    name: "연금술 공방",
    emoji: "⚗️",
    price: 1000,
    desc: "포션을 달이는 작은 가마와 증류기. 집에서 연금술 제조가 가능해진다. (완벽 판정: 최적 시간 정확히)",
    interactLabel: null,
    effect: { type: "alchemy", tolerance: 0 },
    family: "alchemy",
    tier: 1,
  },
  {
    id: "alchemy_lab_fine",
    name: "정밀 연금 공방",
    emoji: "🧪",
    price: 3000,
    desc: "눈금이 촘촘한 유리 기구와 모래시계. 완벽 판정 허용 오차 ±1분.",
    interactLabel: null,
    effect: { type: "alchemy", tolerance: 1 },
    family: "alchemy",
    tier: 2,
  },
  {
    id: "alchemy_lab_sage",
    name: "현자의 연금 공방",
    emoji: "🔮",
    price: 10000,
    desc: "스스로 온도를 맞추는 마도 가마. 완벽 판정 허용 오차 ±2분.",
    interactLabel: null,
    effect: { type: "alchemy", tolerance: 2 },
    family: "alchemy",
    tier: 3,
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

export function furnitureSellPrice(option: FurnitureOption): number {
  return Math.floor(option.price / 2);
}

// family 내에서 보유 중인 가구 (한 개만 존재한다는 전제 — 최고 티어 반환)
export function ownedFamilyOption(
  state: HousingStateData,
  family: NonNullable<FurnitureOption["family"]>,
): FurnitureOption | null {
  return state.items
    .map((id) => furnitureOption(id))
    .filter((option): option is FurnitureOption => option?.family === family)
    .reduce<FurnitureOption | null>(
      (best, option) => (!best || (option.tier ?? 0) > (best.tier ?? 0) ? option : best),
      null,
    );
}

// 보유한 연금술 공방 (최고 티어) — 없으면 null
export function ownedAlchemyLab(state: HousingStateData): FurnitureOption | null {
  return ownedFamilyOption(state, "alchemy");
}

// 공방 티어에 따른 완벽 판정 허용 오차(분) 보너스 — 미보유 시 null
export function alchemyToleranceBonus(state: HousingStateData): number | null {
  const lab = ownedAlchemyLab(state);
  return lab?.effect.type === "alchemy" ? lab.effect.tolerance : null;
}

// 보유한 생산 가구 (어항/화분 계열) — 없으면 null
export function ownedProductionOption(
  state: HousingStateData,
  kind: HousingProductionKind,
): FurnitureOption | null {
  return ownedFamilyOption(state, kind === "낚시" ? "aquarium" : "planter");
}

// 해당 종류의 보관 한도 — 보유 가구 티어 기준 (없으면 0)
export function productionSlotCap(state: HousingStateData, kind: HousingProductionKind): number {
  const owned = ownedProductionOption(state, kind);
  return owned?.effect.type === "production" ? owned.effect.slots : 0;
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
