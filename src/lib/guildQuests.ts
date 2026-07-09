// 길드 일일 납품 의뢰 + 스킬 파편/스킬북 뽑기 (CharacterSheet.guildQuestJson)
//
// - 매일 3~4개 의뢰 게시 → 1개만 선택 수락(당일 한정). KST 자정 갱신.
// - 리롤권: 매일 1개 지급, 최대 3개(C랭크+ 4개). 리롤 시 미수락 상태에서 전체 갱신.
// - 긴급 의뢰: 확률적으로 1개가 ⚡긴급(보상 2배).
// - 보상: 골드 + 스킬 파편(일반/고급 — 고급은 A랭크+ 상위 의뢰).
// - 파편 10개 → 스킬북1 계열(N%4==1) 랜덤 스킬북.
// - 주간: 일퀘 3회 클리어 → 명성 1 + 리롤권 1 (주 1회).

import { kstDayKey, dungeonWeekKey } from "./world";
import { rankAtLeast } from "./adventurerRank";
import {
  getActiveItems,
  isSeaLifeItem,
  lifeSkillMarketPrice,
  type LifeSkillKind,
} from "./lifeSkillData";

export type GuildQuestKind = LifeSkillKind | "요리";
export type FragKind = "일반" | "고급";

export type QuestOffer = {
  id: string;
  kind: GuildQuestKind;
  itemName: string;
  qty: number;
  rank: number; // 자원 등급 0~5 (요리는 레시피 R숫자)
  gold: number;
  fragKind: FragKind;
  fragCount: number;
  urgent: boolean;
};

export type GuildQuestState = {
  day: string; // 의뢰 게시 기준일 (KST)
  offers: QuestOffer[];
  acceptedId: string | null;
  deliveredAt: string | null; // 오늘 납품 완료 시각(ISO) — 하루 1회
  rerolls: number; // 보유 리롤권
  rerollDay: string; // 마지막 리롤권 지급일
  week: string; // 주간 키 (dungeonWeekKey)
  weekCount: number; // 이번 주 일퀘 클리어 횟수
  weekClaimed: boolean; // 주간 보상(명성+리롤권) 지급 여부
  frags: Record<FragKind, number>;
};

export const FRAG_COST = 10; // 파편 → 스킬북 교환 개수
export const WEEK_GOAL = 3; // 주간 명성 보상 클리어 횟수
export const URGENT_CHANCE = 0.15;
// 교환소 환급 (스킬북 1권 → 파편)
export const EXCHANGE_REFUND = 3;

const EMPTY: GuildQuestState = {
  day: "",
  offers: [],
  acceptedId: null,
  deliveredAt: null,
  rerolls: 1,
  rerollDay: "",
  week: "",
  weekCount: 0,
  weekClaimed: false,
  frags: { 일반: 0, 고급: 0 },
};

export function parseGuildQuestState(json: string | null | undefined): GuildQuestState {
  if (!json) return structuredClone(EMPTY);
  try {
    const v = JSON.parse(json) as Partial<GuildQuestState>;
    return {
      day: v.day ?? "",
      offers: Array.isArray(v.offers) ? v.offers : [],
      acceptedId: v.acceptedId ?? null,
      deliveredAt: v.deliveredAt ?? null,
      rerolls: typeof v.rerolls === "number" ? v.rerolls : 1,
      rerollDay: v.rerollDay ?? "",
      week: v.week ?? "",
      weekCount: typeof v.weekCount === "number" ? v.weekCount : 0,
      weekClaimed: !!v.weekClaimed,
      frags: { 일반: v.frags?.일반 ?? 0, 고급: v.frags?.고급 ?? 0 },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

// ── 랭크 특혜 ──
export function questOfferCount(rank: string): number {
  return rankAtLeast(rank, "B") ? 4 : 3; // B랭크+ 4지선다
}
export function rerollCap(rank: string): number {
  return rankAtLeast(rank, "C") ? 4 : 3; // C랭크+ 리롤권 4개 보유
}
export function maxQuestItemRank(rank: string): number {
  if (rankAtLeast(rank, "S")) return 5;
  if (rankAtLeast(rank, "A")) return 4;
  if (rankAtLeast(rank, "C")) return 3;
  return 2;
}
export function premiumEligible(rank: string): boolean {
  return rankAtLeast(rank, "A"); // A랭크+ 고급 파편 의뢰 등장
}

// ── 의뢰 생성 ──
export type RecipePoolEntry = { name: string; rank: number; sellPrice: number };

const QTY_BY_RANK: Record<number, [number, number]> = {
  1: [4, 6],
  2: [3, 5],
  3: [2, 3],
  4: [1, 2],
  5: [1, 1],
};

function rollInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 등급별 파편 보상 — 고급 파편은 A랭크+ 에서 R4+ 자원 의뢰에만
function fragReward(itemRank: number, premium: boolean): { kind: FragKind; count: number } {
  if (itemRank >= 4 && premium) return { kind: "고급", count: itemRank >= 5 ? 2 : 1 };
  if (itemRank >= 4) return { kind: "일반", count: 3 };
  if (itemRank >= 3) return { kind: "일반", count: 2 };
  return { kind: "일반", count: 1 };
}

export function generateOffers(
  guildRank: string,
  day: string,
  recipes: RecipePoolEntry[],
): QuestOffer[] {
  const maxRank = maxQuestItemRank(guildRank);
  const premium = premiumEligible(guildRank);
  const count = questOfferCount(guildRank);

  type Candidate = { kind: GuildQuestKind; name: string; rank: number; unit: number };
  const pool: Candidate[] = [];
  for (const kind of ["낚시", "채집", "채광"] as const) {
    for (const item of getActiveItems(kind)) {
      if (item.rank < 1 || item.rank > maxRank) continue;
      if (kind === "낚시" && isSeaLifeItem(item)) continue; // 바다 어종은 상위 지역 전용
      pool.push({ kind, name: item.name, rank: item.rank, unit: lifeSkillMarketPrice(kind, item) });
    }
  }
  for (const recipe of recipes) {
    if (recipe.rank < 1 || recipe.rank > maxRank) continue;
    pool.push({ kind: "요리", name: recipe.name, rank: recipe.rank, unit: recipe.sellPrice });
  }
  if (pool.length === 0) return [];

  const offers: QuestOffer[] = [];
  const usedNames = new Set<string>();
  const urgentSlot = Math.random() < URGENT_CHANCE ? Math.floor(Math.random() * count) : -1;
  let guard = 0;
  while (offers.length < count && guard++ < 80) {
    const cand = pick(pool);
    if (usedNames.has(cand.name)) continue;
    usedNames.add(cand.name);
    const [qMin, qMax] = QTY_BY_RANK[cand.rank] ?? [1, 2];
    // 요리는 만들기 수고가 커서 수량을 절반으로
    const qty = cand.kind === "요리" ? Math.max(1, Math.ceil(rollInt(qMin, qMax) / 2)) : rollInt(qMin, qMax);
    const urgent = offers.length === urgentSlot;
    const frag = fragReward(cand.rank, premium);
    const gold = Math.max(10, Math.round(cand.unit * qty * 0.6));
    offers.push({
      id: `${day}-${offers.length + 1}`,
      kind: cand.kind,
      itemName: cand.name,
      qty,
      rank: cand.rank,
      gold: urgent ? gold * 2 : gold,
      fragKind: frag.kind,
      fragCount: urgent ? frag.count * 2 : frag.count,
      urgent,
    });
  }
  return offers;
}

// ── 일일/주간 lazy 리셋 — 변경이 있으면 true (저장 필요) ──
export function refreshGuildQuestState(
  state: GuildQuestState,
  guildRank: string,
  recipes: RecipePoolEntry[],
  now: Date = new Date(),
): boolean {
  let dirty = false;
  const today = kstDayKey(now);
  const week = dungeonWeekKey(now);

  if (state.week !== week) {
    state.week = week;
    state.weekCount = 0;
    state.weekClaimed = false;
    dirty = true;
  }
  if (state.rerollDay !== today) {
    state.rerolls = Math.min(rerollCap(guildRank), state.rerolls + 1);
    state.rerollDay = today;
    dirty = true;
  }
  if (state.day !== today) {
    state.day = today;
    state.offers = generateOffers(guildRank, today, recipes);
    state.acceptedId = null;
    state.deliveredAt = null;
    dirty = true;
  }
  return dirty;
}

export function acceptedOffer(state: GuildQuestState): QuestOffer | null {
  if (!state.acceptedId) return null;
  return state.offers.find((offer) => offer.id === state.acceptedId) ?? null;
}

// ── 스킬북 넘버링 — 클래스당 4권, N%4==0 이 유니크 ──
export function skillbookNumber(sourceItem: string | null | undefined): number | null {
  const m = (sourceItem ?? "").trim().match(/^스킬북\s*(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function isUniqueSkillbook(n: number): boolean {
  return n % 4 === 0;
}

// 뽑기 — 초반 풀은 스킬북1 계열(1, 5, 9, 13...)만 사용한다.
export function drawSkillbookNumber(_fragKind: FragKind, numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const pool = numbers.filter((n) => n % 4 === 1);
  return pool.length > 0 ? pick(pool) : null;
}
