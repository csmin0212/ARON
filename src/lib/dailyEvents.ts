export type DailyLifeEventKind = "낚시" | "채집" | "채광";
export type DailyCraftEventKind = "cooking" | "crafting";

type DailyEventDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const KST_OFFSET_MS = 9 * 60 * 60_000;

function kstDay(now = new Date()): DailyEventDay {
  return new Date(now.getTime() + KST_OFFSET_MS).getUTCDay() as DailyEventDay;
}

export function nextKstMidnight(now = new Date()): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  shifted.setUTCHours(24, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

function weekdayLifeKind(day: DailyEventDay): DailyLifeEventKind | null {
  if (day === 1) return "낚시";
  if (day === 2) return "채집";
  if (day === 3) return "채광";
  return null;
}

export function dailyLifeEventBonus(
  kind: DailyLifeEventKind,
  now = new Date(),
): { apCostDown: number; luck: number } {
  const day = kstDay(now);
  if (day === 0 || weekdayLifeKind(day) === kind) return { apCostDown: 2, luck: 2 };
  return { apCostDown: 0, luck: 0 };
}

export function dailyGradeEventMultiplier(kind: DailyCraftEventKind, now = new Date()): number {
  const day = kstDay(now);
  if (day === 0) return 1.5;
  if (kind === "cooking" && day === 4) return 1.5;
  if (kind === "crafting" && day === 5) return 1.5;
  return 1;
}

export function dailyAlchemyDoubleChance(now = new Date()): number {
  const day = kstDay(now);
  return day === 0 || day === 6 ? 0.1 : 0;
}

export function rollDailyAlchemyDouble(now = new Date(), rand: () => number = Math.random): boolean {
  const chance = dailyAlchemyDoubleChance(now);
  return chance > 0 && rand() < chance;
}

export function dailyEventBuffs(now = new Date()): { icon: string; label: string; until: string }[] {
  const until = nextKstMidnight(now);
  const day = kstDay(now);
  if (day === 0) {
    return [{ icon: "🎉", label: "일요일 이벤트: 월~토 효과 전체 적용", until }];
  }
  if (day === 1) {
    return [{ icon: "🎣", label: "월요일 이벤트: 낚시 피로도 -2 · 행운 +2", until }];
  }
  if (day === 2) {
    return [{ icon: "🌿", label: "화요일 이벤트: 채집 피로도 -2 · 행운 +2", until }];
  }
  if (day === 3) {
    return [{ icon: "⛏️", label: "수요일 이벤트: 채광 피로도 -2 · 행운 +2", until }];
  }
  if (day === 4) {
    return [{ icon: "🍳", label: "목요일 이벤트: 요리 고품질·명품 확률 50% 증가", until }];
  }
  if (day === 5) {
    return [{ icon: "⚒️", label: "금요일 이벤트: 제작 고품질·명품 확률 50% 증가", until }];
  }
  return [{ icon: "⚗️", label: "토요일 이벤트: 연금술 10% 확률로 포션 2배 생성", until }];
}
