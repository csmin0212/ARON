export const ADVENTURER_RANK_GOALS: Record<string, number> = {
  D: 10,
  C: 25,
  B: 60,
  A: 100,
  S: 0,
};

export const ADVENTURER_RANKS = ["D", "C", "B", "A", "S"] as const;

export function normalizeAdventurerRank(rank: string | null | undefined): string {
  const upper = String(rank ?? "D").trim().toUpperCase();
  return upper in ADVENTURER_RANK_GOALS ? upper : "D";
}

export function nextAdventurerRank(rank: string | null | undefined): string | null {
  const current = normalizeAdventurerRank(rank);
  const index = ADVENTURER_RANKS.indexOf(current as (typeof ADVENTURER_RANKS)[number]);
  if (index < 0 || index >= ADVENTURER_RANKS.length - 1) return null;
  return ADVENTURER_RANKS[index + 1];
}

export function adventurerRankGoal(rank: string | null | undefined): number {
  return ADVENTURER_RANK_GOALS[normalizeAdventurerRank(rank)] ?? 0;
}

// 랭크 특혜 게이트 — rank 가 min 이상인지 (D < C < B < A < S)
export function rankAtLeast(rank: string | null | undefined, min: string): boolean {
  const order = ADVENTURER_RANKS as readonly string[];
  return order.indexOf(normalizeAdventurerRank(rank)) >= order.indexOf(min);
}

// C랭크+ 길드 특혜 — 창고 최대 중량 +10
export function storageWeightBonus(rank: string | null | undefined): number {
  return rankAtLeast(rank, "C") ? 10 : 0;
}

// 경매장 동시 등록 슬롯 — 랭크업마다 +5 (D 5 → C 10 → B 15 → A 20 → S 25)
export function auctionSlots(rank: string | null | undefined): number {
  const order = ADVENTURER_RANKS as readonly string[];
  return 5 * (Math.max(0, order.indexOf(normalizeAdventurerRank(rank))) + 1);
}
