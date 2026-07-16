// ── 연금술 — 타이머 제조 규칙 ──
// 핵심 메커니즘은 '기다림': 레시피마다 숨겨진 최적 시간(분)이 있고, 플레이어가 직접
// 제조 시간을 정한다. 정확히(오차 이내) 맞추면 '완벽한 ~'(완벽효과 부여),
// 크게 벗어나면 '약한 ~'(효과 절반·판매가 절반). 등급([고품질] 등)은 요리와 동일 확률.
// 이름 형식: "완벽한 MP 포션 [고품질]" — 수식어는 앞, 등급은 뒤.

import { COOK_GRADES, SIGNATURE_GRADE } from "@/lib/auction";

export const BREW_AP_COST = 10;
export const BREW_MIN_MINUTES = 1;
export const BREW_MAX_MINUTES = 30;

export type BrewModifier = "완벽한" | "약한" | null;

// '약한' 판정 가격 배수 — 공식가(판매가)의 절반
export const WEAK_PRICE_MULT = 0.5;

// 무수식어 허용 구간 — 최적시간의 ±35% (최소 ±2분). 이보다 벗어나면 '약한'.
export function normalWindow(bestMinutes: number): number {
  return Math.max(2, Math.round(bestMinutes * 0.35));
}

// 제조 시간 판정. tolerance = 레시피 오차(시트) + 공방 티어 보너스(0/1/2).
export function judgeBrew(minutes: number, bestMinutes: number, tolerance: number): BrewModifier {
  const d = Math.abs(minutes - bestMinutes);
  if (d <= tolerance) return "완벽한";
  if (d <= normalWindow(bestMinutes)) return null;
  return "약한";
}

const GRADE_KEYS = COOK_GRADES.map((g) => g.key);

// "완벽한 MP 포션 [고품질]" / "약한 화주" / "성수 [뭇별의 장인작]"
export function buildPotionName(
  base: string,
  modifier: BrewModifier,
  grade: string | null,
  nickname: string,
): string {
  const prefix = modifier ? `${modifier} ` : "";
  const suffix =
    grade === SIGNATURE_GRADE.key
      ? ` [${nickname}의 장인작]`
      : grade
        ? ` [${grade}]`
        : "";
  return `${prefix}${base}${suffix}`;
}

export function parsePotionName(raw: string): {
  base: string;
  modifier: BrewModifier;
  grade: string | null;
} {
  let s = raw.trim();
  let modifier: BrewModifier = null;
  let grade: string | null = null;

  for (const mod of ["완벽한", "약한"] as const) {
    if (s.startsWith(`${mod} `)) {
      modifier = mod;
      s = s.slice(mod.length).trim();
      break;
    }
  }

  const m = s.match(/\s\[([^\]]+)\]$/);
  if (m) {
    const label = m[1];
    if (GRADE_KEYS.includes(label)) grade = label;
    else if (/의 장인작$/.test(label)) grade = SIGNATURE_GRADE.key;
    if (grade) s = s.slice(0, s.length - m[0].length).trim();
  }

  return { base: s, modifier, grade };
}

// 진행 중인 제조 상태 (CharacterSheet.pendingBrewJson)
export type PendingBrew = {
  recipeId: string;
  minutes: number;
  startedAt: number; // epoch ms
  readyAt: number; // epoch ms
};

export function parsePendingBrew(json: string | null | undefined): PendingBrew | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<PendingBrew>;
    if (
      typeof v.recipeId !== "string" ||
      typeof v.minutes !== "number" ||
      typeof v.readyAt !== "number"
    ) {
      return null;
    }
    return {
      recipeId: v.recipeId,
      minutes: v.minutes,
      startedAt: typeof v.startedAt === "number" ? v.startedAt : v.readyAt - v.minutes * 60_000,
      readyAt: v.readyAt,
    };
  } catch {
    return null;
  }
}

// 수령 시 방향 힌트 — 최적시간은 비밀이지만, 어느 쪽으로 틀렸는지는 알려줘 실험을 돕는다.
export function brewHint(minutes: number, bestMinutes: number, modifier: BrewModifier): string {
  if (modifier === "완벽한") return "가마의 불과 시간이 완벽하게 맞아떨어졌다!";
  if (minutes < bestMinutes) return "불을 너무 일찍 뺐는지 빛깔이 옅다. 조금 더 오래 달여볼까.";
  if (minutes > bestMinutes) return "너무 오래 달여 향이 날아갔다. 다음엔 조금 일찍 꺼내보자.";
  return "시간은 맞았는데… 어딘가 미묘하게 어긋났다.";
}
