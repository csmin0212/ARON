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
