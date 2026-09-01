// ── 연금술 — 타이머 제조 규칙 ──
// 핵심 메커니즘은 '기다림': 레시피마다 숨겨진 최적 시간(분)이 있고, 플레이어가 직접
// 제조 시간을 정한다. 정확히(오차 이내) 맞추면 '완벽한 ~'(완벽효과 부여),
// 크게 벗어나면 '약한 ~'(효과 절반·판매가 절반). 숙련 등급은 포션별 누적 숙련도로 결정된다.
// 이름 형식: "완벽한 MP 포션 [고급]" — 수식어는 앞, 숙련 표기는 뒤.

export const BREW_AP_COST = 10;
export const BREW_MIN_MINUTES = 1;
export const BREW_MAX_MINUTES = 30;
export const ALCHEMY_BASE_POTION_NAME = "조제 포션";
export const ALCHEMY_CUSTOM_POTION_MARKER = "연금술 조제 포션";
export const ALCHEMY_OPTION_PRICE_PATTERN = /판매가\s*([0-9,]+)\s*G/;
export const ALCHEMY_OPTION_LIMIT = 3;

export type BrewModifier = "완벽한" | "약한" | null;
export type CustomAlchemyGrade = "고품질" | "명품" | "네이밍";

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

export function alchemyMaterialPoints(rank: number): number {
  if (rank >= 5) return 25;
  if (rank === 4) return 10;
  if (rank === 3) return 5;
  if (rank === 2) return 3;
  if (rank === 1) return 1;
  return 0;
}

export function alchemyMaterialPointsForItem(name: string, rank: number): number {
  const normalized = name.trim().replace(/\s+/g, "");
  if (normalized === "마력을품은이끼" || normalized === "마력이깃든나뭇가지") return 7;
  if (rank === 1 && (normalized === "붉은허브" || normalized === "푸른허브")) return 4;
  if (rank === 2 && (normalized === "시프의요깃거리" || normalized === "백양초")) return 6;
  return alchemyMaterialPoints(rank);
}

// 포션이지만 예외적으로 연금 재료로 되먹일 수 있는 것.
// 효과문(또는 이름)의 '연금 포인트 +N' 에서 N 을 읽는다.
// 시트에 옵션만 추가하면 +3·+10 짜리도 코드 수정 없이 늘어난다.
//
// 중복 옵션은 한 줄로 합쳐지며 숫자가 배수로 곱해지므로(scaleAlchemyOptionEffect),
// '연금 포인트 5 · 중복가능 · 중복증가 5' 한 줄이면 이렇게 굴러간다:
//   1개  비용 5        → 회수 +5   (본전. 1~2성 재료를 3성급으로 치환)
//   2개  비용 5+10=15  → 회수 +10  (손해지만 슬롯 하나에 몰아넣어 상위 옵션을 연다)
// 재료 슬롯이 3~5칸이라 이 '압축' 이 상한을 여는 수단이 된다.
// 등급(고품질·명품)은 enhanceEffectText 가 숫자를 올려주므로 회수량도 같이 오른다.
// 효과문은 중복분이 이미 곱해진 총량('+10')을 담지만, 이름은 '(연금 포인트 +5x2)' 처럼
// 1개분 값과 개수를 따로 적는다. 두 표기를 모두 읽는다.
const ALCHEMY_POINT_ITEM = /연금\s*포인트\s*(?:에\s*)?\+\s*(\d+)(?:\s*[x×*]\s*(\d+))?/;

export function alchemyPointItemValue(text: string | null | undefined): number | null {
  const match = ALCHEMY_POINT_ITEM.exec(String(text ?? ""));
  if (!match) return null;
  const each = Number(match[1]);
  const copies = match[2] ? Number(match[2]) : 1;
  if (!Number.isFinite(each) || each <= 0) return null;
  if (!Number.isFinite(copies) || copies <= 0) return each;
  return each * copies;
}

export function alchemyLabSlotLimit(tier: number | null | undefined): number {
  if ((tier ?? 0) >= 3) return 5;
  if ((tier ?? 0) >= 2) return 4;
  return 3;
}

export function buildCustomPotionName(optionNames: string[], grade?: CustomAlchemyGrade | null): string {
  const counts = new Map<string, number>();
  for (const name of optionNames.map((item) => item.trim()).filter(Boolean)) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const labels = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name}x${count}` : name));
  const base = labels.length === 0 ? ALCHEMY_BASE_POTION_NAME : `${ALCHEMY_BASE_POTION_NAME} (${labels.join(", ")})`;
  return grade ? `${base} [${grade}]` : base;
}

export function isCustomAlchemyPotionName(rawName: string): boolean {
  const base = parsePotionName(rawName).base;
  return base === ALCHEMY_BASE_POTION_NAME || base.startsWith(`${ALCHEMY_BASE_POTION_NAME} (`);
}

export function customAlchemyBonusCopies(grade: CustomAlchemyGrade | null): number {
  if (grade === "네이밍") return 3;
  if (grade === "명품") return 2;
  if (grade === "고품질") return 1;
  return 0;
}

export function customPotionSellPrice(effectText?: string | null): number | null {
  const text = effectText ?? "";
  if (!text.includes(ALCHEMY_CUSTOM_POTION_MARKER) && !text.includes("연금 포인트")) return null;
  const match = text.match(ALCHEMY_OPTION_PRICE_PATTERN);
  if (!match) return null;
  const price = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function alchemyOptionRepeatable(tags?: string | null): boolean {
  return /(^|[,;\s])(?:중복가능|repeatable)(?=$|[,;\s])/i.test(tags ?? "");
}

export function alchemyOptionRepeatPointStep(tags?: string | null): number {
  const match = (tags ?? "").match(/(?:중복증가|중복시증가|repeatStep|repeat_step)\s*[:=]\s*(\d+)/i);
  if (!match) return 0;
  const step = Number(match[1]);
  return Number.isFinite(step) && step > 0 ? Math.floor(step) : 0;
}

export function alchemyOptionPointCost(
  basePointCost: number,
  tags: string | null | undefined,
  copyIndex: number,
): number {
  const base = Math.max(0, Math.floor(basePointCost));
  if (copyIndex <= 0) return base;
  if (!alchemyOptionRepeatable(tags)) return Number.POSITIVE_INFINITY;
  return base + alchemyOptionRepeatPointStep(tags) * copyIndex;
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
  optionIds?: string[];
  ingredientNames?: string[];
  customName?: string;
  resultName?: string;
  effect?: string;
  price?: number;
  weight?: number;
  availablePoints?: number;
  spentPoints?: number;
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
      optionIds: Array.isArray(v.optionIds)
        ? v.optionIds.map((item) => String(item ?? "").trim()).filter(Boolean)
        : undefined,
      ingredientNames: Array.isArray(v.ingredientNames)
        ? v.ingredientNames.map((item) => String(item ?? "").trim()).filter(Boolean)
        : undefined,
      customName: typeof v.customName === "string" ? v.customName : undefined,
      resultName: typeof v.resultName === "string" ? v.resultName : undefined,
      effect: typeof v.effect === "string" ? v.effect : undefined,
      price: typeof v.price === "number" && Number.isFinite(v.price) ? v.price : undefined,
      weight: typeof v.weight === "number" && Number.isFinite(v.weight) ? v.weight : undefined,
      availablePoints:
        typeof v.availablePoints === "number" && Number.isFinite(v.availablePoints)
          ? v.availablePoints
          : undefined,
      spentPoints:
        typeof v.spentPoints === "number" && Number.isFinite(v.spentPoints) ? v.spentPoints : undefined,
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
