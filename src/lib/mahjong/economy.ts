export type Tier = "low" | "mid" | "high";

export interface TierConfig {
  tier: Tier;
  gold: number;
  startPoints: number;
}

export const TIERS_3P: Record<Tier, TierConfig> = {
  low: { tier: "low", gold: 35, startPoints: 35000 },
  mid: { tier: "mid", gold: 70, startPoints: 35000 },
  high: { tier: "high", gold: 350, startPoints: 35000 },
};

export const TIERS_4P: Record<Tier, TierConfig> = {
  low: { tier: "low", gold: 25, startPoints: 25000 },
  mid: { tier: "mid", gold: 50, startPoints: 25000 },
  high: { tier: "high", gold: 250, startPoints: 25000 },
};

export function tiersFor(playerCount: 3 | 4): Record<Tier, TierConfig> {
  return playerCount === 3 ? TIERS_3P : TIERS_4P;
}

export function goldRate(config: TierConfig): number {
  return config.gold / config.startPoints;
}

export function pointsToGold(points: number, config: TierConfig): number {
  return Math.round(points * goldRate(config));
}

export interface DailyAiGoldState {
  day: string; // KST yyyy-mm-dd
  earned: number;
}

export const DAILY_AI_GOLD_CAP = 250;

// AI가 낀 판의 순이익 골드를 하루 상한(DAILY_AI_GOLD_CAP)으로 클램프한다. 손실은 상한 없이 그대로 반영하고,
// 사람끼리만 둔 판은 이 함수를 거치지 않는다(무제한).
export function settleAiCappedGold(
  state: DailyAiGoldState,
  today: string,
  rawGain: number,
): { state: DailyAiGoldState; payableGain: number } {
  const base: DailyAiGoldState = state.day === today ? state : { day: today, earned: 0 };
  if (rawGain <= 0) {
    return { state: base, payableGain: rawGain };
  }
  const remaining = Math.max(0, DAILY_AI_GOLD_CAP - base.earned);
  const payableGain = Math.min(rawGain, remaining);
  return { state: { day: today, earned: base.earned + payableGain }, payableGain };
}
