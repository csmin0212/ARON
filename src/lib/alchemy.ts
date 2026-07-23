// ── 연금술 — 타이머 제조 규칙 ──
// 핵심 메커니즘은 '기다림': 레시피마다 숨겨진 최적 시간(분)이 있고, 플레이어가 직접
// 제조 시간을 정한다. 정확히(오차 이내) 맞추면 '완벽한 ~'(완벽효과 부여),
// 크게 벗어나면 '약한 ~'(효과 절반·판매가 절반). 숙련 등급은 포션별 누적 숙련도로 결정된다.
// 이름 형식: "완벽한 MP 포션 [고급]" — 수식어는 앞, 숙련 표기는 뒤.

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

export const ALCHEMY_GRADE_INFO: Record<string, { priceMult: number }> = {
  고급: { priceMult: 1.2 },
  명품: { priceMult: 1.5 },
};

const GRADE_KEYS = Object.keys(ALCHEMY_GRADE_INFO);

// "완벽한 MP 포션 [고급]" / "약한 화주" / "성수 [명품]"
export function buildPotionName(
  base: string,
  modifier: BrewModifier,
  grade: string | null,
): string {
  const prefix = modifier ? `${modifier} ` : "";
  const suffix = grade ? ` [${grade}]` : "";
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
    else if (label === "고품질") grade = "고급"; // 구버전 연금술 포션 호환
    else if (label === "명장" || label === "장인") grade = "명품"; // 구버전/별칭 호환
    if (grade) s = s.slice(0, s.length - m[0].length).trim();
  }

  return { base: s, modifier, grade };
}

export function alchemyGradeInfo(grade: string | null): { priceMult: number } | null {
  if (!grade) return null;
  return ALCHEMY_GRADE_INFO[grade] ?? null;
}

export function alchemyAcceleratorMinutes(
  rawName: string,
  effectText?: string | null,
): number | null {
  const parsed = parsePotionName(rawName);
  let base = parsed.base;
  let grade = parsed.grade;
  let legacyMaster = false;

  const bracket = base.match(/^(연금 가속 포션)\s*\[([^\]]+)\]$/);
  if (bracket) {
    base = bracket[1];
    const label = bracket[2];
    if (label === "고품질" || label === "고급") grade = "고급";
    if (label === "명장" || label === "장인") legacyMaster = true;
    if (label === "명품") grade = "명품";
  }

  if (base === "연금 가속 포션") {
    let minutes = 10;
    if (grade === "고급") minutes = 15;
    if (grade === "명품" || legacyMaster) minutes = 30;
    if (parsed.modifier === "완벽한") minutes += 5;
    if (parsed.modifier === "약한") minutes = Math.max(1, Math.ceil(minutes * WEAK_PRICE_MULT));
    return Math.min(30, minutes);
  }

  const text = effectText ?? "";
  const match = text.match(/연금\s*가속\s*(\d+)\s*분/);
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes > 0 ? Math.min(30, minutes) : null;
}

export function alchemyAcceleratorEffect(minutes: number): string {
  return `마이너 액션. 연금술 공방에서 진행 중인 제조의 남은 시간을 ${minutes}분 감소시킨다. 남은 시간이 0분 이하가 되면 즉시 완료된다. 소모품.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addFlatRecoveryBonus(effect: string, bonus: number): string | null {
  if (bonus <= 0 || !/\[(\d+)\s*D\]/.test(effect)) return null;
  let changed = false;
  const next = effect.replace(
    /\[(\d+)\s*D\](?:\s*\+\s*(\d+))?(\s*점?\s*회복)/g,
    (_m, dice: string, flat: string | undefined, tail: string) => {
      changed = true;
      return `[${dice}D]+${Number(flat ?? 0) + bonus}${tail}`;
    },
  );
  return changed ? next : null;
}

function addTargetBonus(effect: string, target: string, bonus: number): string | null {
  if (bonus <= 0 || !target.trim()) return null;
  const normalizedTarget = target.trim();

  if (normalizedTarget.includes("대미지 경감")) {
    let changed = false;
    const next = effect.replace(/(대미지에\s*)-(\d+)/, (_m, head: string, value: string) => {
      changed = true;
      return `${head}-${Number(value) + bonus}`;
    });
    return changed ? next : null;
  }

  const targetPattern = escapeRegExp(normalizedTarget).replace(/\\\s+/g, "\\s*");
  const re = new RegExp(`(${targetPattern}[^.。\\n]*?\\+)\\s*(\\d+)`);
  let changed = false;
  const next = effect.replace(re, (_m, head: string, value: string) => {
    changed = true;
    return `${head}${Number(value) + bonus}`;
  });
  return changed ? next : null;
}

// 완벽 효과를 별도 줄로 늘어놓지 않고 기본 효과의 수식에 합친다.
// 예: "HP [2D] 회복" + "회복량에 +3" x2 => "HP [2D]+6 회복"
export function mergePotionPerfectEffect(
  baseEffect: string | null | undefined,
  perfectEffect: string | null | undefined,
  stacks: number,
): { effect: string; merged: boolean } {
  const base = baseEffect?.trim() ?? "";
  const perfect = perfectEffect?.trim() ?? "";
  if (!base || !perfect || stacks <= 0) return { effect: base, merged: false };

  const recovery = perfect.match(/회복량에\s*\+(\d+)/);
  if (recovery) {
    const merged = addFlatRecoveryBonus(base, Number(recovery[1]) * stacks);
    if (merged) return { effect: merged, merged: true };
  }

  const targetBonus = perfect.match(/추가로\s*(.+?)에\s*\+(\d+)/);
  if (targetBonus) {
    const merged = addTargetBonus(base, targetBonus[1], Number(targetBonus[2]) * stacks);
    if (merged) return { effect: merged, merged: true };
  }

  return { effect: base, merged: false };
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
