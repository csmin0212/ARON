export type Tier = "free" | "low" | "mid" | "high";

export interface TierConfig {
  tier: Tier;
  gold: number;
  startPoints: number;
  aiLevel: AiLevel; // 이 등급 방에 앉는 AI 의 실력
}

// AI 실력 — 1(연습) → 4(상급). 무료방일수록 실수가 잦고, 상급으로 갈수록
// 유효패 계산과 오리기(降り)까지 한다. 자세한 동작은 lib/mahjong/ai.ts 참고.
export type AiLevel = 1 | 2 | 3 | 4;

export const AI_LEVEL_LABEL: Record<AiLevel, string> = {
  1: "연습",
  2: "보통",
  3: "숙련",
  4: "고수",
};

export const AI_LEVEL_DESC: Record<AiLevel, string> = {
  1: "가끔 엉뚱한 패를 버리고 아무거나 웁니다.",
  2: "샹텐만 보고 진행합니다. 위험패 개념은 없어요.",
  3: "유효패가 많은 쪽으로 버리고, 역 없는 울기는 참습니다.",
  4: "남은 대기 장수를 세고, 상대 리치엔 현물로 오리기까지 합니다.",
};

export const TIERS_3P: Record<Tier, TierConfig> = {
  free: { tier: "free", gold: 0, startPoints: 35000, aiLevel: 1 },
  low: { tier: "low", gold: 35, startPoints: 35000, aiLevel: 2 },
  mid: { tier: "mid", gold: 70, startPoints: 35000, aiLevel: 3 },
  high: { tier: "high", gold: 350, startPoints: 35000, aiLevel: 4 },
};

export const TIERS_4P: Record<Tier, TierConfig> = {
  free: { tier: "free", gold: 0, startPoints: 25000, aiLevel: 1 },
  low: { tier: "low", gold: 25, startPoints: 25000, aiLevel: 2 },
  mid: { tier: "mid", gold: 50, startPoints: 25000, aiLevel: 3 },
  high: { tier: "high", gold: 250, startPoints: 25000, aiLevel: 4 },
};

export const TIER_LABEL: Record<Tier, string> = {
  free: "무료",
  low: "하급",
  mid: "중급",
  high: "상급",
};

export function tiersFor(playerCount: 3 | 4): Record<Tier, TierConfig> {
  return playerCount === 3 ? TIERS_3P : TIERS_4P;
}

export function goldRate(config: TierConfig): number {
  return config.gold / config.startPoints;
}

// 무료방은 환산율이 0 이라 어떤 점수로 끝나도 0골드다(입장료도 0이므로 손익 0).
export function pointsToGold(points: number, config: TierConfig): number {
  return Math.round(points * goldRate(config));
}

export interface DailyAiGoldState {
  day: string; // KST yyyy-mm-dd
  earned: number;
}

export const DAILY_AI_GOLD_CAP = 100;

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
