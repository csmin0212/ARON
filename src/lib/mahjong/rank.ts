// 마작 등급 — 정식 단위 체계가 아니라 순위 누적 점수로 매기는 자체 간이 랭크.
// 별도 테이블 없이 MahjongRecord 원자료를 집계해서 매번 계산한다(hall/page.tsx와 동일한 방식).
// 이름은 작혼식 4단계(작사·작걸·작호·작성), 단(段)은 두지 않는다.

export type RankMetal = "copper" | "silver" | "gold" | "holo";

export interface RankTier {
  key: string;
  label: string; // 작사
  hanja: string; // 雀士
  minPoints: number;
  metal: RankMetal; // 배지 재질 — MahjongRankBadge 가 해석한다
}

export const RANK_TIERS: RankTier[] = [
  { key: "jakushi", label: "작사", hanja: "雀士", minPoints: 0, metal: "copper" },
  { key: "jakuketsu", label: "작걸", hanja: "雀傑", minPoints: 150, metal: "silver" },
  { key: "jakugou", label: "작호", hanja: "雀豪", minPoints: 400, metal: "gold" },
  { key: "jakusei", label: "작성", hanja: "雀聖", minPoints: 800, metal: "holo" },
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

// 현재 등급 구간 안에서 얼마나 왔는지 (0~1). 최상위 등급은 항상 1.
export function tierProgress(points: number): number {
  const cur = tierForPoints(points);
  const next = RANK_TIERS.find((t) => t.minPoints > points);
  if (!next) return 1;
  const span = next.minPoints - cur.minPoints;
  return span <= 0 ? 1 : Math.min(1, Math.max(0, (points - cur.minPoints) / span));
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
