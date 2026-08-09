import "server-only";

import {
  adjustedRankWeights,
  baseWeightsFor,
  computeMods,
  lifeLuckModFromStats,
  progressOf,
  toolRankRateBonus,
  type LifeState,
} from "@/lib/lifeSkillPerks";
import { dailyLifeEventBonus } from "@/lib/dailyEvents";
import {
  lifeSkillRankOdds,
  type LifeSkillKind,
  type LifeSkillPoolConfig,
} from "@/lib/lifeSkillData";

// 탐지기·감정기가 가방에 띄우는 확률표.
// 낚시·채집·채광 액션과 **똑같은 입력**으로 계산해야 표시와 실제가 어긋나지 않는다.
// (등급 가중치 = adjustedRankWeights, 품목 필터 = lifeSkillRankOdds → resolveLifeSkillPool)

export type DetectorRankRow = {
  rank: number;
  chance: number; // %
  items: string[]; // 감정기(2단계)에서만 채워 보낸다
};

export type DetectorView = {
  kind: LifeSkillKind;
  tier: number; // 1 탐지기 / 2 감정기
  locationName: string;
  rows: DetectorRankRow[];
};

// 도구 이름 → 단계. 각 액션의 rodTier/toolTier 와 같은 표.
const TOOL_TIERS: Record<LifeSkillKind, Record<string, number>> = {
  낚시: { "좋은 낚싯대": 1, "고급 낚싯대": 2 },
  채집: { "숙련 채집 도구": 1, "장인의 채집 도구": 2 },
  채광: { "철 곡괭이": 1, "미스릴 곡괭이": 2 },
};

export function detectorToolTier(kind: LifeSkillKind, toolName: string): number {
  return TOOL_TIERS[kind][toolName.trim()] ?? 0;
}

export function buildDetectorView(opts: {
  kind: LifeSkillKind;
  tier: number;
  life: LifeState;
  statsJson: string | null | undefined;
  pool: LifeSkillPoolConfig | null;
  locationName: string;
}): DetectorView | null {
  const { kind, tier, life, statsJson, pool, locationName } = opts;
  if (tier <= 0 || !pool?.enabled) return null;

  // ── 여기부터 fishing/gathering/mining 액션과 동일한 순서 ──
  const mods = computeMods(life, kind, lifeLuckModFromStats(statsJson));
  const eventBonus = dailyLifeEventBonus(kind);
  mods.luck += eventBonus.luck;
  mods.luck += toolRankRateBonus(detectorToolTier(kind, life.tools[kind]), mods.toolEff);

  const level = progressOf(life, kind).level;
  const levelBase = baseWeightsFor(level, kind);
  const regionBase = pool.weights
    ? pool.weights.map((w, rank) => (levelBase[rank] > 0 ? w : 0))
    : levelBase;
  const weights = adjustedRankWeights(mods, regionBase, level);

  const odds = lifeSkillRankOdds(kind, { ...pool, weights });
  if (!odds) return null;

  return {
    kind,
    tier,
    locationName,
    rows: odds.map((row) => ({
      rank: row.rank,
      chance: row.chance,
      // 탐지기(1단계)는 확률만, 감정기(2단계)부터 품목 공개
      items: tier >= 2 ? row.items : [],
    })),
  };
}
