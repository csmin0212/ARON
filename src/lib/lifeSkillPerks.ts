// 생활스킬 레벨·특성 시스템 (level_up_fishing.py / level_up_plant.py 포팅)
//
// 레벨업 시 특성 3개가 제시되고 하나를 선택한다.
// 특성 희귀도 등장률: 일반 50% / 레어 30% / 유니크 16% / 전설 4% (신화는 현재 비활성)

import type { LifeSkillKind } from "./lifeSkillData";

export type PerkRarity = "일반" | "레어" | "유니크" | "전설" | "신화";

export type LifePerk = {
  name: string;
  rarity: PerkRarity;
  text: string;
  effectKey?: string | null;
  effectValue?: string | null;
};

export type LifeSkillCatalogEntry = LifePerk & {
  kind: LifeSkillKind;
};

export type OwnedPerk = LifePerk & { kind: LifeSkillKind };

export type PendingChoice = {
  kind: LifeSkillKind;
  level: number; // 도달한 레벨
  options: LifePerk[];
};

export type SkillProgress = { exp: number; level: number };

export type LifeState = {
  fishing: SkillProgress;
  plant: SkillProgress;
  mining: SkillProgress;
  cooking: SkillProgress;
  smithing: SkillProgress; // 대장(장비 제작) — 레벨업 시 마이너 슬롯 확장
  perks: OwnedPerk[];
  pending: PendingChoice[];
  // 도감 — 한 번이라도 획득한 아이템 이름
  collection: { 채집: string[]; 낚시: string[]; 채광: string[] };
  // 도감 장소 기록 — 실제로 획득한 적 있는 장소 ID만 아이템별로 누적한다.
  locationRecords: Record<LifeSkillKind, Record<string, string[]>>;
  // 생활 전용 임시 가방 — 일반 시트 소지품과 별도로 중량 제한을 둔다.
  bags: Record<LifeSkillKind, LifeBag>;
  tools: Record<LifeSkillKind, string>;
  catchCounts: Record<LifeSkillKind, Record<string, number>>;
  cookingBuffs: {
    lifeLuck: CookingLifeLuckBuff[];
    session: CookingSessionBuff[];
    stat: CookingStatBuff[];
  };
};

export type CookingLifeLuckBuff = {
  kind: LifeSkillKind | "both";
  amount: number;
  until: string;
  source: string;
};

export type CookingSessionBuff = {
  source: string;
  effect: string;
  usedAt: string;
};

// 월드 판정 버프 — "30분 동안 감지 판정 +1" 요리. label '모든'은 전 능력치에 적용.
export type CookingStatBuff = {
  label: string;
  amount: number;
  until: string;
  source: string;
};

export type LifeBagItem = {
  name: string;
  qty: number;
  weight: number;
  rank: number;
  text: string;
};

export type LifeBag = {
  name: string;
  maxWeight: number;
  items: LifeBagItem[];
};

export const RARITY_COLORS: Record<PerkRarity, string> = {
  일반: "text-muted",
  레어: "text-sky-500",
  유니크: "text-violet-500",
  전설: "text-amber-500",
  신화: "text-rose-500",
};

// ── 특성 테이블 (수치는 희귀도별 차등) ──
// 시트 '스킬' 탭이 정본. 여기는 탭에 해당 종류(예: 채광)가 없을 때의 폴백 —
// 수치·문구를 시트와 같게 유지한다.
const toolName = (kind: LifeSkillKind) =>
  kind === "낚시" ? "낚싯대 숙련" : kind === "채광" ? "곡괭이 숙련" : "채집 숙련";
const toolWord = (kind: LifeSkillKind) =>
  kind === "낚시" ? "낚싯대" : kind === "채광" ? "곡괭이" : "채집 도구";
const kindWithRo = (kind: LifeSkillKind) => (kind === "낚시" ? "낚시로" : `${kind}으로`);

// 희귀도 인덱스: 일반 0 · 레어 1 · 유니크 2 · 전설 3
const TIER_NUM = {
  exp: [5, 10, 15, 20],
  rank0: [1, 2, 3, 4],
  rank1: [2, 3, 4, 5],
  rank2: [2, 3, 4, 5],
  tool: [20, 40, 60, 80],
  gauge: [5, 10, 15, 20],
  ap: [0, 1, 2, 3],
  luck: [0, 1, 2, 3],
};

function tierPerks(kind: LifeSkillKind, rarity: PerkRarity): LifePerk[] {
  const k = kind;
  if (rarity === "신화") {
    return [
      { name: "행운의 부적", rarity, text: "0성이 영구적으로 등장하지 않게 된다.", effectKey: "no_trash", effectValue: null },
      {
        name: kind === "낚시" ? "신의 어부" : kind === "채광" ? "신의 광부" : "신의 채집가",
        rarity,
        text: "5성 등장 확률이 0.3% 증가한다. (중복 x)",
        effectKey: "rank5_up_pct",
        effectValue: "0.3",
      },
      {
        name: "천상의 축복",
        rarity,
        text: `숙련도 배율이 30%, ${toolWord(k)} 효율 공식이 100%, 환전 골드가 5% 증가한다. (중복 x)`,
        effectKey: "blessing",
        effectValue: "exp_mult_pct:30, tool_efficiency_pct:100, gold_mult_pct:5",
      },
      { name: "리알의 가호", rarity, text: "비밀스러운 바다의 힘을 목도하라." },
      { name: "명예 VIP 훈장", rarity, text: "항구에 가지 않아도 판매를 할 수 있게 된다." },
      { name: "운명", rarity, text: "운명의 낚싯대를 취득한다." },
      { name: "이계", rarity, text: "이계의 낚시 가방을 취득한다." },
    ];
  }
  const t = rarity === "일반" ? 0 : rarity === "레어" ? 1 : rarity === "유니크" ? 2 : 3;
  const perks: LifePerk[] = [
    { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 ${TIER_NUM.exp[t]}% 증가한다.`, effectKey: "exp_mult_pct", effectValue: String(TIER_NUM.exp[t]) },
    { name: "운의 축적 1", rarity, text: `0성 등장 확률이 ${TIER_NUM.rank0[t]}% 감소한다. (최대 10%)`, effectKey: "rank0_down_pct", effectValue: String(TIER_NUM.rank0[t]) },
    { name: "운의 축적 2", rarity, text: `1성 등장 확률이 ${TIER_NUM.rank1[t]}% 감소한다. (최대 20%)`, effectKey: "rank1_down_pct", effectValue: String(TIER_NUM.rank1[t]) },
    { name: "운의 축적 3", rarity, text: `2성 등장 확률이 ${TIER_NUM.rank2[t]}% 감소한다. (최대 20%)`, effectKey: "rank2_down_pct", effectValue: String(TIER_NUM.rank2[t]) },
    { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 ${TIER_NUM.tool[t]}% 개선된다.`, effectKey: "tool_efficiency_pct", effectValue: String(TIER_NUM.tool[t]) },
    { name: "솜씨 발휘", rarity, text: `${k} 게이지가 ${TIER_NUM.gauge[t]}% 천천히 감소한다.`, effectKey: "time_reduce_sec", effectValue: String(TIER_NUM.gauge[t]) },
  ];
  if (t >= 1) {
    perks.push(
      { name: "효율적인 정리", rarity, text: `${kindWithRo(k)} 인한 피로도 감소량에 -${TIER_NUM.ap[t]}한다.`, effectKey: "bag_weight_bonus", effectValue: String(TIER_NUM.ap[t]) },
      { name: "행운아", rarity, text: `${k} 행운 공식이 ${TIER_NUM.luck[t]}% 개선된다.`, effectKey: "luck_formula_pct", effectValue: String(TIER_NUM.luck[t]) },
    );
  }
  return perks;
}
// 신화는 일단 제외 (추첨에서 등장하지 않음)
const RARITY_ROLL: { rarity: PerkRarity; weight: number }[] = [
  { rarity: "일반", weight: 50 },
  { rarity: "레어", weight: 30 },
  { rarity: "유니크", weight: 16 },
  { rarity: "전설", weight: 4 },
];

function rollRarity(): PerkRarity {
  const total = RARITY_ROLL.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of RARITY_ROLL) {
    roll -= r.weight;
    if (roll <= 0) return r.rarity;
  }
  return "일반";
}

// ── 레벨 곡선 ──
export function expForNext(level: number): number {
  return Math.round(20 * Math.pow(level, 1.6));
}

// 특성은 Lv4부터 3레벨마다 선택 (4·7·10·13…)
export const PERK_EVERY = 3;

export function isPerkChoiceLevel(level: number): boolean {
  return level > 1 && (level - 1) % PERK_EVERY === 0;
}

// ── 등급 등장 구간표 (레벨 구간별 기본 가중치 [0성..5성]) ──
// 여기 숫자만 고치면 밸런스가 바뀐다. 상위 구간은 추후 천천히 설계.
export const LEVEL_BANDS: { min: number; max: number; weights: number[] }[] = [
  { min: 1, max: 30, weights: [30, 40, 25, 5, 0, 0] }, // Lv1~30: 0~3성
  { min: 31, max: 60, weights: [20, 35, 35, 9, 1, 0] }, // Lv31~60: 4성까지 살짝
  { min: 61, max: 999, weights: [10, 30, 30, 20, 9, 1] }, // Lv61+: 5성까지
];

export function baseWeightsFor(level: number): number[] {
  const band = LEVEL_BANDS.find((b) => level >= b.min && level <= b.max);
  return [...(band ?? LEVEL_BANDS[LEVEL_BANDS.length - 1]).weights];
}

// ── 상태 파싱/직렬화 ──
const EMPTY: LifeState = {
  fishing: { exp: 0, level: 1 },
  plant: { exp: 0, level: 1 },
  mining: { exp: 0, level: 1 },
  cooking: { exp: 0, level: 1 },
  smithing: { exp: 0, level: 1 },
  perks: [],
  pending: [],
  collection: { 채집: [], 낚시: [], 채광: [] },
  locationRecords: { 채집: {}, 낚시: {}, 채광: {} },
  bags: {
    채집: { name: "약초꾼 가방", maxWeight: 5, items: [] },
    낚시: { name: "낚시꾼 가방", maxWeight: 5, items: [] },
    채광: { name: "광부 가방", maxWeight: 5, items: [] },
  },
  tools: {
    채집: "기본 채집도구",
    낚시: "기본 낚싯대",
    채광: "기본 곡괭이",
  },
  catchCounts: { 채집: {}, 낚시: {}, 채광: {} },
  cookingBuffs: { lifeLuck: [], session: [], stat: [] },
};

function defaultBag(kind: LifeSkillKind): LifeBag {
  return structuredClone(EMPTY.bags[kind]);
}

function normalizeBag(kind: LifeSkillKind, bag: Partial<LifeBag> | undefined): LifeBag {
  const fallback = defaultBag(kind);
  return {
    name: bag?.name || fallback.name,
    maxWeight: typeof bag?.maxWeight === "number" ? bag.maxWeight : fallback.maxWeight,
    items: Array.isArray(bag?.items)
      ? bag.items
          .filter((item) => item && item.name && item.qty > 0)
          .map((item) => ({
            name: item.name,
            qty: item.qty,
            weight: item.weight ?? 1,
            rank: item.rank ?? 0,
            text: item.text ?? "",
          }))
      : [],
  };
}

const LIFE_KINDS: LifeSkillKind[] = ["채집", "낚시", "채광"];

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function normalizeLocationRecords(
  records: Partial<Record<LifeSkillKind, Record<string, unknown>>> | undefined,
): Record<LifeSkillKind, Record<string, string[]>> {
  const normalized: Record<LifeSkillKind, Record<string, string[]>> = { 채집: {}, 낚시: {}, 채광: {} };
  for (const kind of LIFE_KINDS) {
    for (const [itemName, locationIds] of Object.entries(records?.[kind] ?? {})) {
      const ids = uniqueStrings(locationIds);
      if (itemName && ids.length > 0) normalized[kind][itemName] = ids;
    }
  }
  return normalized;
}

export function parseLifeState(json: string | null | undefined): LifeState {
  if (!json) return structuredClone(EMPTY);
  try {
    const v = JSON.parse(json) as Partial<LifeState>;
    return {
      fishing: v.fishing ?? { exp: 0, level: 1 },
      plant: v.plant ?? { exp: 0, level: 1 },
      mining: v.mining ?? { exp: 0, level: 1 },
      cooking: v.cooking ?? { exp: 0, level: 1 },
      smithing: v.smithing ?? { exp: 0, level: 1 },
      perks: v.perks ?? [],
      pending: v.pending ?? [],
      collection: {
        채집: v.collection?.채집 ?? [],
        낚시: v.collection?.낚시 ?? [],
        채광: v.collection?.채광 ?? [],
      },
      locationRecords: normalizeLocationRecords(v.locationRecords),
      bags: {
        채집: normalizeBag("채집", v.bags?.채집),
        낚시: normalizeBag("낚시", v.bags?.낚시),
        채광: normalizeBag("채광", v.bags?.채광),
      },
      tools: {
        채집: v.tools?.채집 || EMPTY.tools.채집,
        낚시: v.tools?.낚시 || EMPTY.tools.낚시,
        채광: v.tools?.채광 || EMPTY.tools.채광,
      },
      catchCounts: {
        채집: v.catchCounts?.채집 ?? {},
        낚시: v.catchCounts?.낚시 ?? {},
        채광: v.catchCounts?.채광 ?? {},
      },
      cookingBuffs: {
        // 만료된 버프는 읽는 시점에 걸러낸다 — 다음 저장 때 상태에서도 사라짐.
        lifeLuck: Array.isArray(v.cookingBuffs?.lifeLuck)
          ? v.cookingBuffs.lifeLuck.filter(
              (buff) => buff && buff.amount > 0 && buff.until && Date.parse(buff.until) > Date.now(),
            )
          : [],
        session: Array.isArray(v.cookingBuffs?.session)
          ? v.cookingBuffs.session.filter((buff) => buff && buff.source && buff.effect)
          : [],
        stat: Array.isArray(v.cookingBuffs?.stat)
          ? v.cookingBuffs.stat.filter(
              (buff) =>
                buff && buff.label && buff.amount > 0 && buff.until && Date.parse(buff.until) > Date.now(),
            )
          : [],
      },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

// 요리 판정 버프 — 해당 능력치 판정에 더할 보정.
// '모든' 라벨은 전 능력치에 적용되며, 겹치면 최대값 하나만 적용(중첩 없음).
export function statBuffBonus(state: LifeState, label: string): number {
  const now = Date.now();
  let best = 0;
  for (const buff of state.cookingBuffs.stat) {
    if (Date.parse(buff.until) <= now) continue;
    if (buff.label === label || buff.label === "모든") best = Math.max(best, buff.amount);
  }
  return best;
}

// 도감 기록 — 처음 잡은 아이템이면 true 반환
export function recordCollection(
  state: LifeState,
  kind: LifeSkillKind,
  itemName: string,
): boolean {
  const list = state.collection[kind];
  if (list.includes(itemName)) return false;
  list.push(itemName);
  return true;
}

export function recordLifeCatch(state: LifeState, kind: LifeSkillKind, itemName: string): number {
  const counts = state.catchCounts[kind];
  counts[itemName] = (counts[itemName] ?? 0) + 1;
  return counts[itemName];
}

export function recordLifeItemLocation(
  state: LifeState,
  kind: LifeSkillKind,
  itemName: string,
  locationId: string | null | undefined,
): boolean {
  const id = locationId?.trim();
  if (!id) return false;
  const records = state.locationRecords[kind];
  const itemRecords = records[itemName] ?? [];
  if (itemRecords.includes(id)) return false;
  records[itemName] = [...itemRecords, id];
  return true;
}

export function lifeBagWeight(bag: LifeBag): number {
  return bag.items.reduce((sum, item) => sum + item.weight * item.qty, 0);
}

export function lifeBagLimit(state: LifeState, kind: LifeSkillKind, bonus = 0): number {
  return state.bags[kind].maxWeight + bonus;
}

export function addLifeBagItem(
  state: LifeState,
  kind: LifeSkillKind,
  item: { name: string; weight: number; rank: number; text: string },
): void {
  const bag = state.bags[kind];
  const found = bag.items.find((entry) => entry.name === item.name);
  if (found) {
    found.qty += 1;
    found.weight = item.weight;
    found.rank = item.rank;
    found.text = item.text;
  } else {
    bag.items.push({
      name: item.name,
      qty: 1,
      weight: item.weight,
      rank: item.rank,
      text: item.text,
    });
  }
}

export function progressOf(state: LifeState, kind: LifeSkillKind): SkillProgress {
  return kind === "낚시" ? state.fishing : kind === "채광" ? state.mining : state.plant;
}

// 신화 특성은 중복 취득 불가
function isMyth(p: { rarity: PerkRarity }): boolean {
  return p.rarity === "신화";
}

export function perkIdentityKey(p: Pick<LifePerk, "name" | "rarity">): string {
  return `${p.name.trim()}\u0000${p.rarity}`;
}

// 레벨업 선택지 3개 생성 (희귀도 개별 추첨)
export function rollPerkOptions(
  state: LifeState,
  kind: LifeSkillKind,
  catalog?: LifeSkillCatalogEntry[],
): LifePerk[] {
  const ownedMyth = new Set(state.perks.filter(isMyth).map((p) => p.name));
  const ownedPerks = new Set(state.perks.map(perkIdentityKey));
  const options: LifePerk[] = [];
  let guard = 0;
  while (options.length < 3 && guard++ < 60) {
    const rarity = rollRarity();
    const catalogPool =
      catalog
        ?.filter((p) => p.kind === kind && p.rarity === rarity)
        .map(({ name, rarity, text, effectKey, effectValue }) => ({
          name,
          rarity,
          text,
          effectKey,
          effectValue,
        })) ?? [];
    const pool = (catalogPool.length > 0 ? catalogPool : tierPerks(kind, rarity)).filter(
      (p) => !ownedPerks.has(perkIdentityKey(p)) && !(p.rarity === "신화" && ownedMyth.has(p.name)),
    );
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (options.some((o) => o.name === pick.name && o.rarity === pick.rarity)) continue;
    options.push(pick);
  }
  return options;
}

// 경험치 적용 → 레벨업 시 도달 레벨 반환. 특성 선택지는 PERK_EVERY 레벨마다 적재.
export function applyExp(
  state: LifeState,
  kind: LifeSkillKind,
  gained: number,
  catalog?: LifeSkillCatalogEntry[],
): number[] {
  const prog = progressOf(state, kind);
  prog.exp += gained;
  const leveled: number[] = [];
  while (prog.exp >= expForNext(prog.level)) {
    prog.exp -= expForNext(prog.level);
    prog.level += 1;
    leveled.push(prog.level);
    // 특성은 Lv4부터 3레벨마다(4·7·10·13·16·19…). (레벨-1)%3==0, 시작 레벨1은 제외.
    if (isPerkChoiceLevel(prog.level)) {
      state.pending.push({ kind, level: prog.level, options: rollPerkOptions(state, kind, catalog) });
    }
  }
  return leveled;
}

export function applyCookingExp(state: LifeState, gained: number): number[] {
  const prog = state.cooking;
  prog.exp += gained;
  const leveled: number[] = [];
  while (prog.exp >= expForNext(prog.level)) {
    prog.exp -= expForNext(prog.level);
    prog.level += 1;
    leveled.push(prog.level);
  }
  return leveled;
}

// 대장(장비 제작) 숙련 — 요리와 동일 곡선, 특성 없이 레벨만 (레벨업 = 마이너 슬롯 확장)
export function applySmithingExp(state: LifeState, gained: number): number[] {
  const prog = state.smithing;
  prog.exp += gained;
  const leveled: number[] = [];
  while (prog.exp >= expForNext(prog.level)) {
    prog.exp -= expForNext(prog.level);
    prog.level += 1;
    leveled.push(prog.level);
  }
  return leveled;
}

// ── 보유 특성 → 게임 수치 변환 ──
export type LifeMods = {
  expMult: number; // 숙련도 배율 (1.0 기준)
  goldMult: number; // 환전 골드 배율
  rank0Down: number; // %p 감소 (cap 10)
  rank1Down: number; // (cap 20)
  rank2Down: number; // (cap 20)
  luck: number; // 행운아 — 고랭크 가중치 가산
  rank5Up: number; // 신의 어부
  noTrash: boolean; // 행운의 부적
  toolEff: number; // 도구 숙련 — 도구 보정 공식 개선 % (기본 도구는 보정 0이라 효과 없음)
  gaugeSlow: number; // 솜씨 발휘 — 미니게임 게이지/마커 감속 % (cap 50)
  apCostDown: number; // 효율적인 정리 — 생활 행동 피로도 소모 감소 (최소 1은 소모)
  doubleDrop: number; // 일석이조(채광) — 획득 시 N% 확률로 결과물 1개 추가 (cap 100)
};

// 효과키가 없는 옛 특성(스냅샷)용 폴백 — 이름·희귀도 → 수치. 시트 '스킬' 탭과 동일하게 유지.
const VAL: Record<string, Record<string, number>> = {
  "숙련도 배율 증가": { 일반: 5, 레어: 10, 유니크: 15, 전설: 20 },
  "운의 축적 1": { 일반: 1, 레어: 2, 유니크: 3, 전설: 4 },
  "운의 축적 2": { 일반: 2, 레어: 3, 유니크: 4, 전설: 5 },
  "운의 축적 3": { 일반: 2, 레어: 3, 유니크: 4, 전설: 5 },
  "효율적인 정리": { 레어: 1, 유니크: 2, 전설: 3 },
  행운아: { 레어: 1, 유니크: 2, 전설: 3 },
  "낚싯대 숙련": { 일반: 20, 레어: 40, 유니크: 60, 전설: 80 },
  "채집 숙련": { 일반: 20, 레어: 40, 유니크: 60, 전설: 80 },
  "곡괭이 숙련": { 일반: 20, 레어: 40, 유니크: 60, 전설: 80 },
  "솜씨 발휘": { 일반: 5, 레어: 10, 유니크: 15, 전설: 20 },
};

function numValue(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function applyEffectKey(mods: LifeMods, key: string | null | undefined, value: string | null | undefined): boolean {
  if (!key) return false;
  switch (key) {
    case "exp_mult_pct":
      mods.expMult += numValue(value) / 100;
      return true;
    case "gold_mult_pct":
      mods.goldMult += numValue(value) / 100;
      return true;
    case "rank0_down_pct":
      mods.rank0Down += numValue(value);
      return true;
    case "rank1_down_pct":
      mods.rank1Down += numValue(value);
      return true;
    case "rank2_down_pct":
      mods.rank2Down += numValue(value);
      return true;
    case "luck_formula_pct":
      mods.luck += numValue(value);
      return true;
    case "rank5_up_pct":
      mods.rank5Up += numValue(value);
      return true;
    case "tool_efficiency_pct":
      mods.toolEff += numValue(value);
      return true;
    case "time_reduce_sec": // 옛 이름 (하위호환) — 값은 초가 아니라 %
    case "gauge_slow_pct":
      // 미니게임 게이지/마커 감속 %
      mods.gaugeSlow += numValue(value);
      return true;
    case "bag_weight_bonus": // 옛 이름 (하위호환) — 가방 중량이 아니라 피로도 감소
    case "ap_cost_down":
      mods.apCostDown += numValue(value);
      return true;
    case "double_drop_pct":
      mods.doubleDrop += numValue(value);
      return true;
    case "no_trash":
      mods.noTrash = true;
      return true;
    case "blessing":
      for (const part of (value ?? "").split(",")) {
        const [childKey, childValue] = part.split(":").map((s) => s.trim());
        if (childKey) applyEffectKey(mods, childKey, childValue);
      }
      return true;
    default:
      return false;
  }
}

export function computeMods(state: LifeState, kind: LifeSkillKind): LifeMods {
  const mods: LifeMods = {
    expMult: 1,
    goldMult: 1,
    rank0Down: 0,
    rank1Down: 0,
    rank2Down: 0,
    luck: 0,
    rank5Up: 0,
    noTrash: false,
    toolEff: 0,
    gaugeSlow: 0,
    apCostDown: 0,
    doubleDrop: 0,
  };
  for (const p of state.perks) {
    if (p.kind !== kind) continue;
    if (applyEffectKey(mods, p.effectKey, p.effectValue)) continue;
    const v = VAL[p.name]?.[p.rarity] ?? 0;
    switch (p.name) {
      case "숙련도 배율 증가":
        mods.expMult += v / 100;
        break;
      case "운의 축적 1":
        mods.rank0Down += v;
        break;
      case "운의 축적 2":
        mods.rank1Down += v;
        break;
      case "운의 축적 3":
        mods.rank2Down += v;
        break;
      case "효율적인 정리":
        mods.apCostDown += v;
        break;
      case "행운아":
        mods.luck += v;
        break;
      case "낚싯대 숙련":
      case "채집 숙련":
      case "곡괭이 숙련":
        mods.toolEff += v;
        break;
      case "솜씨 발휘":
        mods.gaugeSlow += v;
        break;
      case "행운의 부적":
        mods.noTrash = true;
        break;
      case "신의 어부":
      case "신의 채집가":
      case "신의 광부":
        mods.rank5Up += 0.3;
        break;
      case "천상의 축복":
        mods.expMult += 0.3;
        mods.goldMult += 0.05;
        mods.toolEff += 100;
        break;
      default:
        break; // 기타 신화(리알의 가호 등)는 보유 기록 (후속 시스템에서 사용)
    }
  }
  const now = Date.now();
  for (const buff of state.cookingBuffs.lifeLuck) {
    if (Date.parse(buff.until) <= now) continue;
    if (buff.kind === "both" || buff.kind === kind) mods.luck += buff.amount;
  }
  mods.rank0Down = Math.min(mods.rank0Down, 10);
  mods.rank1Down = Math.min(mods.rank1Down, 20);
  mods.rank2Down = Math.min(mods.rank2Down, 20);
  mods.gaugeSlow = Math.min(mods.gaugeSlow, 50);
  mods.doubleDrop = Math.min(mods.doubleDrop, 100);
  return mods;
}

// 등급 가중치 [0성..5성] 에 특성 보정 적용.
// base 는 레벨 구간표(baseWeightsFor) — 구간에서 잠긴 등급(기본치 0)은 절대 열리지 않는다.
export function adjustedRankWeights(mods: LifeMods, base?: number[]): number[] {
  const orig = base ? [...base] : [30, 40, 25, 5, 0, 0];
  const w = [...orig];
  let removed = 0;
  const take = (idx: number, amount: number) => {
    const cut = Math.min(w[idx], amount);
    w[idx] -= cut;
    removed += cut;
  };
  if (mods.noTrash) take(0, w[0]);
  else take(0, mods.rank0Down);
  take(1, mods.rank1Down);
  take(2, mods.rank2Down);

  // 제거된 확률은 "이 구간에서 허용된" 상위 등급(3~5성)에 6:3:1 비율로 재분배
  const RATIO: Record<number, number> = { 3: 6, 4: 3, 5: 1 };
  const upper = [3, 4, 5].filter((i) => orig[i] > 0);
  if (removed > 0 && upper.length > 0) {
    const ratioSum = upper.reduce((s, i) => s + RATIO[i], 0);
    for (const i of upper) w[i] += (removed * RATIO[i]) / ratioSum;
  } else if (removed > 0) {
    w[2] += removed; // 상위 등급이 모두 잠긴 극단 케이스
  }

  // 행운아: 허용된 최상위 1~2개 등급에 2:1 가산
  if (mods.luck > 0 && upper.length > 0) {
    const top = upper[upper.length - 1];
    const second = upper.length > 1 ? upper[upper.length - 2] : null;
    if (second != null) {
      w[second] += (mods.luck * 2) / 3;
      w[top] += mods.luck / 3;
    } else {
      w[top] += mods.luck;
    }
  }
  // 신의 어부(5성 확률 증가): 5성이 열린 구간에서만 효과
  if (orig[5] > 0) w[5] += mods.rank5Up;

  return w;
}
