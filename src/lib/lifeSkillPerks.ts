// 생활스킬 레벨·특성 시스템 (level_up_fishing.py / level_up_plant.py 포팅)
//
// 레벨업 시 특성 3개가 제시되고 하나를 선택한다.
// 특성 희귀도 등장률: 일반 50% / 레어 30% / 유니크 16% / 전설 3.5% / 신화 0.5%

import type { LifeSkillKind } from "./lifeSkillData";

export type PerkRarity = "일반" | "레어" | "유니크" | "전설" | "신화";

export type LifePerk = {
  name: string;
  rarity: PerkRarity;
  text: string;
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
  perks: OwnedPerk[];
  pending: PendingChoice[];
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
        { name: "교섭술", rarity, text: `${k} 환전 골드 + 1%` },
        { name: "솜씨 발휘", rarity, text: `${k} 시간 -1초` },
      ];
    case "레어":
      return [
        { name: "숙련도 배율 증가", rarity, text: `${k} 숙련도 배율이 10% 증가한다.` },
        { name: "운의 축적 1", rarity, text: "0성 등장 확률이 1% 감소한다. (최대 5%)" },
        { name: "운의 축적 2", rarity, text: "1성 등장 확률이 2% 감소한다. (최대 20%)" },
        { name: "운의 축적 3", rarity, text: "2성 등장 확률이 2% 감소한다. (최대 20%)" },
        { name: toolName(k), rarity, text: `${toolWord(k)} 효율 공식이 40% 개선된다.` },
        { name: "교섭술", rarity, text: `${k} 환전 골드 + 2%` },
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
        { name: "교섭술", rarity, text: `${k} 환전 골드 + 3%` },
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
        { name: "교섭술", rarity, text: `${k} 환전 골드 + 4%` },
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

const RARITY_ROLL: { rarity: PerkRarity; weight: number }[] = [
  { rarity: "일반", weight: 50 },
  { rarity: "레어", weight: 30 },
  { rarity: "유니크", weight: 16 },
  { rarity: "전설", weight: 3.5 },
  { rarity: "신화", weight: 0.5 },
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

// ── 상태 파싱/직렬화 ──
const EMPTY: LifeState = {
  fishing: { exp: 0, level: 1 },
  plant: { exp: 0, level: 1 },
  perks: [],
  pending: [],
};

export function parseLifeState(json: string | null | undefined): LifeState {
  if (!json) return structuredClone(EMPTY);
  try {
    const v = JSON.parse(json) as Partial<LifeState>;
    return {
      fishing: v.fishing ?? { exp: 0, level: 1 },
      plant: v.plant ?? { exp: 0, level: 1 },
      perks: v.perks ?? [],
      pending: v.pending ?? [],
    };
  } catch {
    return structuredClone(EMPTY);
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
export function rollPerkOptions(state: LifeState, kind: LifeSkillKind): LifePerk[] {
  const ownedMyth = new Set(state.perks.filter(isMyth).map((p) => p.name));
  const options: LifePerk[] = [];
  let guard = 0;
  while (options.length < 3 && guard++ < 60) {
    const rarity = rollRarity();
    const pool = tierPerks(kind, rarity).filter(
      (p) => !(p.rarity === "신화" && ownedMyth.has(p.name)),
    );
    if (pool.length === 0) continue;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (options.some((o) => o.name === pick.name && o.rarity === pick.rarity)) continue;
    options.push(pick);
  }
  return options;
}

// 경험치 적용 → 레벨업 시 pending 선택지 적재. 도달한 레벨 목록 반환.
export function applyExp(state: LifeState, kind: LifeSkillKind, gained: number): number[] {
  const prog = progressOf(state, kind);
  prog.exp += gained;
  const leveled: number[] = [];
  while (prog.exp >= expForNext(prog.level)) {
    prog.exp -= expForNext(prog.level);
    prog.level += 1;
    leveled.push(prog.level);
    state.pending.push({ kind, level: prog.level, options: rollPerkOptions(state, kind) });
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
  교섭술: { 일반: 1, 레어: 2, 유니크: 3, 전설: 4 },
  "효율적인 정리": { 레어: 1, 유니크: 2, 전설: 3 },
  행운아: { 레어: 1, 유니크: 2, 전설: 3 },
};

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
      case "교섭술":
        mods.goldMult += v / 100;
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
  mods.rank0Down = Math.min(mods.rank0Down, 5);
  mods.rank1Down = Math.min(mods.rank1Down, 20);
  mods.rank2Down = Math.min(mods.rank2Down, 20);
  return mods;
}

// 기본 등급 가중치 [0성..5성] 에 특성 보정 적용
export function adjustedRankWeights(mods: LifeMods): number[] {
  const w = [40, 30, 20, 6, 3, 1];
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
  // 제거된 확률은 3/4/5성에 6:3:1 비율로 재분배
  if (removed > 0) {
    w[3] += (removed * 6) / 10;
    w[4] += (removed * 3) / 10;
    w[5] += removed / 10;
  }
  // 행운아: 4/5성 가산, 신의 어부: 5성 가산
  w[4] += mods.luck * 0.67;
  w[5] += mods.luck * 0.33 + mods.rank5Up;
  return w;
}
