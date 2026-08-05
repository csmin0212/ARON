// 마작 등급 — 정식 단위 체계가 아니라 순위 누적 점수로 매기는 자체 간이 랭크.
// 별도 테이블 없이 MahjongRecord 원자료를 집계해서 매번 계산한다(hall/page.tsx와 동일한 방식).

export interface RankTier {
  key: string;
  label: string;
  minPoints: number;
  color: string; // UI 배지용
}

export const RANK_TIERS: RankTier[] = [
  { key: "novice", label: "초심자", minPoints: 0, color: "slate" },
  { key: "apprentice", label: "수련생", minPoints: 100, color: "emerald" },
  { key: "expert", label: "숙련자", minPoints: 300, color: "sky" },
  { key: "master", label: "고수", minPoints: 600, color: "violet" },
  { key: "legend", label: "마작왕", minPoints: 1000, color: "amber" },
];

// 4인전: 1위 +30 / 2위 +10 / 3위 -10 / 4위 -30
// 3인전: 1위 +30 / 2위 0 / 3위 -30
export function rankPointsForPlacement(placement: number, playerCount: 3 | 4): number {
  const table4 = [30, 10, -10, -30];
  const table3 = [30, 0, -30];
  const table = playerCount === 3 ? table3 : table4;
  return table[placement - 1] ?? 0;
}

export function tierForPoints(points: number): RankTier {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (points >= t.minPoints) tier = t;
  }
  return tier;
}

export function nextTierFor(points: number): { tier: RankTier; remaining: number } | null {
  const next = RANK_TIERS.find((t) => t.minPoints > points);
  if (!next) return null;
  return { tier: next, remaining: next.minPoints - points };
}

export interface MahjongStats {
  gamesPlayed: number;
  rankPoints: number;
  tier: RankTier;
  placementCounts: number[]; // index 0 = 1위 횟수 ...
  winRate: number; // 1위 비율
  avgPlacement: number;
  totalGoldDelta: number;
}

export function computeStats(
  records: { placement: number; goldDelta: number; playerCount: number }[],
): MahjongStats {
  const placementCounts = [0, 0, 0, 0];
  let rankPoints = 0;
  let placementSum = 0;
  let totalGoldDelta = 0;

  for (const r of records) {
    placementCounts[r.placement - 1] = (placementCounts[r.placement - 1] ?? 0) + 1;
    rankPoints += rankPointsForPlacement(r.placement, r.playerCount === 3 ? 3 : 4);
    placementSum += r.placement;
    totalGoldDelta += r.goldDelta;
  }

  rankPoints = Math.max(0, rankPoints);
  const gamesPlayed = records.length;

  return {
    gamesPlayed,
    rankPoints,
    tier: tierForPoints(rankPoints),
    placementCounts,
    winRate: gamesPlayed > 0 ? placementCounts[0] / gamesPlayed : 0,
    avgPlacement: gamesPlayed > 0 ? placementSum / gamesPlayed : 0,
    totalGoldDelta,
  };
}
