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
  cooking: SkillProgress;
  perks: OwnedPerk[];
  pending: PendingChoice[];
  // 도감 — 한 번이라도 획득한 아이템 이름
  collection: { 채집: string[]; 낚시: string[] };
  // 생활 전용 임시 가방 — 일반 시트 소지품과 별도로 중량 제한을 둔다.
  bags: Record<LifeSkillKind, LifeBag>;
  tools: Record<LifeSkillKind, string>;
  catchCounts: Record<LifeSkillKind, Record<string, number>>;
  cookingBuffs: {
    lifeLuck: CookingLifeLuckBuff[];
    session: CookingSessionBuff[];
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
const toolName = (kind: LifeSkillKind) => (kind === "낚시" ? "낚싯대 숙련" : "채집 숙련");
const toolWord = (kind: LifeSkillKind) => (kind === "낚시" ? "낚싯대" : "채집 도구");

function tierPerks(kind: LifeSkillKind, rarity: PerkRarity): LifePerk[] {
  const k = kind;
  switch (rarity) {
    case "일반":
      return [
        { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 5% 증가한다.` },
        { name: "운의 축적 1", rarity, text: "0성 등장 확률이 0.5% 감소한다. (최대 5%)" },
        { name: "운의 축적 2", rarity, text: "1성 등장 확률이 1% 감소한다. (최대 20%)" },
        { name: "운의 축적 3", rarity, text: "2성 등장 확률이 1% 감소한다. (최대 20%)" },
        { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 20% 개선된다.` },
        { name: "솜씨 발휘", rarity, text: `${k} 시간 -1초` },
      ];
    case "레어":
      return [
        { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 10% 증가한다.` },
        { name: "운의 축적 1", rarity, text: "0성 등장 확률이 1% 감소한다. (최대 5%)" },
        { name: "운의 축적 2", rarity, text: "1성 등장 확률이 2% 감소한다. (최대 20%)" },
        { name: "운의 축적 3", rarity, text: "2성 등장 확률이 2% 감소한다. (최대 20%)" },
        { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 40% 개선된다.` },
        { name: "솜씨 발휘", rarity, text: `${k} 시간 -2초` },
        { name: "효율적인 정리", rarity, text: "최대 중량 +1" },
        { name: "행운아", rarity, text: `${k} 행운 공식이 1% 개선된다.` },
      ];
    case "유니크":
      return [
        { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 15% 증가한다.` },
        { name: "운의 축적 1", rarity, text: "0성 등장 확률이 1.5% 감소한다. (최대 5%)" },
        { name: "운의 축적 2", rarity, text: "1성 등장 확률이 3% 감소한다. (최대 20%)" },
        { name: "운의 축적 3", rarity, text: "2성 등장 확률이 3% 감소한다. (최대 20%)" },
        { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 60% 개선된다.` },
        { name: "솜씨 발휘", rarity, text: `${k} 시간 -3초` },
        { name: "효율적인 정리", rarity, text: "최대 중량 +2" },
        { name: "행운아", rarity, text: `${k} 행운 공식이 2% 개선된다.` },
      ];
    case "전설":
      return [
        { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 20% 증가한다.` },
        { name: "운의 축적 1", rarity, text: "0성 등장 확률이 2% 감소한다. (최대 5%)" },
        { name: "운의 축적 2", rarity, text: "1성 등장 확률이 4% 감소한다. (최대 20%)" },
        { name: "운의 축적 3", rarity, text: "2성 등장 확률이 4% 감소한다. (최대 20%)" },
        { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 80% 개선된다.` },
        { name: "솜씨 발휘", rarity, text: `${k} 시간 -4초` },
        { name: "효율적인 정리", rarity, text: "최대 중량 +3" },
        { name: "행운아", rarity, text: `${k} 행운 공식이 3% 개선된다.` },
      ];
    case "신화":
      return [
        { name: "행운의 부적", rarity, text: "0성이 영구적으로 등장하지 않게 된다." },
        { name: kind === "낚시" ? "신의 어부" : "신의 채집가", rarity, text: "5성 등장 확률이 0.3% 증가한다. (중복 x)" },
        {
          name: "천상의 축복",
          rarity,
          text: `숙련도 배율이 30%, ${toolWord(k)} 효율 공식이 100%, 환전 골드가 5% 증가한다. (중복 x)`,
        },
        { name: "리알의 가호", rarity, text: "비밀스러운 바다의 힘을 목도하라." },
        { name: "명예 VIP 훈장", rarity, text: "항구에 가지 않아도 판매를 할 수 있게 된다." },
        { name: "운명", rarity, text: "운명의 낚싯대를 취득한다." },
        { name: "이계", rarity, text: "이계의 낚시 가방을 취득한다." },
      ];
  }
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

// 특성은 5레벨마다 선택
export const PERK_EVERY = 5;

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
  cooking: { exp: 0, level: 1 },
  perks: [],
  pending: [],
  collection: { 채집: [], 낚시: [] },
  bags: {
    채집: { name: "약초꾼 가방", maxWeight: 10, items: [] },
    낚시: { name: "낚시꾼 가방", maxWeight: 10, items: [] },
  },
  tools: {
    채집: "기본 채집도구",
    낚시: "기본 낚싯대",
  },
  catchCounts: { 채집: {}, 낚시: {} },
  cookingBuffs: { lifeLuck: [], session: [] },
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

export function parseLifeState(json: string | null | undefined): LifeState {
  if (!json) return structuredClone(EMPTY);
  try {
    const v = JSON.parse(json) as Partial<LifeState>;
    return {
      fishing: v.fishing ?? { exp: 0, level: 1 },
      plant: v.plant ?? { exp: 0, level: 1 },
      cooking: v.cooking ?? { exp: 0, level: 1 },
      perks: v.perks ?? [],
      pending: v.pending ?? [],
      collection: {
        채집: v.collection?.채집 ?? [],
        낚시: v.collection?.낚시 ?? [],
      },
      bags: {
        채집: normalizeBag("채집", v.bags?.채집),
        낚시: normalizeBag("낚시", v.bags?.낚시),
      },
      tools: {
        채집: v.tools?.채집 || EMPTY.tools.채집,
        낚시: v.tools?.낚시 || EMPTY.tools.낚시,
      },
      catchCounts: {
        채집: v.catchCounts?.채집 ?? {},
        낚시: v.catchCounts?.낚시 ?? {},
      },
      cookingBuffs: {
        lifeLuck: Array.isArray(v.cookingBuffs?.lifeLuck)
          ? v.cookingBuffs.lifeLuck.filter((buff) => buff && buff.amount > 0 && buff.until)
          : [],
        session: Array.isArray(v.cookingBuffs?.session)
          ? v.cookingBuffs.session.filter((buff) => buff && buff.source && buff.effect)
          : [],
      },
    };
  } catch {
    return structuredClone(EMPTY);
  }
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
  return kind === "낚시" ? state.fishing : state.plant;
}

// 신화 특성은 중복 취득 불가
function isMyth(p: { rarity: PerkRarity }): boolean {
  return p.rarity === "신화";
}

// 레벨업 선택지 3개 생성 (희귀도 개별 추첨)
export function rollPerkOptions(
  state: LifeState,
  kind: LifeSkillKind,
  catalog?: LifeSkillCatalogEntry[],
): LifePerk[] {
  const ownedMyth = new Set(state.perks.filter(isMyth).map((p) => p.name));
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
      (p) => !(p.rarity === "신화" && ownedMyth.has(p.name)),
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
    if (prog.level % PERK_EVERY === 0) {
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

// ── 보유 특성 → 게임 수치 변환 ──
export type LifeMods = {
  expMult: number; // 숙련도 배율 (1.0 기준)
  goldMult: number; // 환전 골드 배율
  rank0Down: number; // %p 감소 (cap 5)
  rank1Down: number; // (cap 20)
  rank2Down: number; // (cap 20)
  luck: number; // 행운아 — 고랭크 가중치 가산
  rank5Up: number; // 신의 어부
  noTrash: boolean; // 행운의 부적
  weightBonus: number; // 효율적인 정리
};

const VAL: Record<string, Record<string, number>> = {
  "숙련도 배율 증가": { 일반: 5, 레어: 10, 유니크: 15, 전설: 20 },
  "운의 축적 1": { 일반: 0.5, 레어: 1, 유니크: 1.5, 전설: 2 },
  "운의 축적 2": { 일반: 1, 레어: 2, 유니크: 3, 전설: 4 },
  "운의 축적 3": { 일반: 1, 레어: 2, 유니크: 3, 전설: 4 },
  "효율적인 정리": { 레어: 1, 유니크: 2, 전설: 3 },
  행운아: { 레어: 1, 유니크: 2, 전설: 3 },
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
    case "bag_weight_bonus":
      mods.weightBonus += numValue(value);
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
    weightBonus: 0,
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
        mods.weightBonus += v;
        break;
      case "행운아":
        mods.luck += v;
        break;
      case "행운의 부적":
        mods.noTrash = true;
        break;
      case "신의 어부":
      case "신의 채집가":
        mods.rank5Up += 0.3;
        break;
      case "천상의 축복":
        mods.expMult += 0.3;
        mods.goldMult += 0.05;
        break;
      default:
        break; // 도구 숙련·솜씨 발휘·기타 신화는 보유 기록 (후속 시스템에서 사용)
    }
  }
  const now = Date.now();
  for (const buff of state.cookingBuffs.lifeLuck) {
    if (Date.parse(buff.until) <= now) continue;
    if (buff.kind === "both" || buff.kind === kind) mods.luck += buff.amount;
  }
  mods.rank0Down = Math.min(mods.rank0Down, 5);
  mods.rank1Down = Math.min(mods.rank1Down, 20);
  mods.rank2Down = Math.min(mods.rank2Down, 20);
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
