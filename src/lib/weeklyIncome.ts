// 분수 광장 주간 수입 — 프리 플레이 소지금 증가 스킬·아이템.
// 시트 스킬란에서 SL 1+ 로 배운 스킬과 소지품의 우상을 주 1회(던전 주간과 동일, 월요일 자정) 환전한다.

export type WeeklyIncomeSkill = {
  name: string; // 시트 스킬란 표기와 대조 (공백 무시)
  stat: string; // 능력치 라벨 — 금액 = 판정 보정치(2D+X 의 X) × 100G
  emoji: string;
};

export const WEEKLY_INCOME_SKILLS: readonly WeeklyIncomeSkill[] = [
  { name: "퍼포먼스", stat: "민첩", emoji: "🤸" },
  { name: "버스커", stat: "정신", emoji: "🎸" },
  { name: "플라시즈", stat: "재주", emoji: "🎭" },
  { name: "엑설런트 럭", stat: "행운", emoji: "🍀" },
  { name: "프로모터", stat: "근력", emoji: "📣" },
  { name: "패트로네이즈", stat: "지력", emoji: "🎩" },
  { name: "도네이션", stat: "행운", emoji: "🙏" },
  { name: "스피치 미팅", stat: "지력", emoji: "🎤" },
] as const;

export const WEEKLY_INCOME_STAT_MULT = 100; // 능력치 × 100G

// 소지품에 있으면 주 1회 CL × 50G
export const WEEKLY_INCOME_IDOL = {
  key: "고블린의 황금빛 우상",
  name: "고블린의 황금빛 우상",
  emoji: "🗿",
  perLevel: 50,
} as const;

export const normalizeSkillName = (name: string) => name.replace(/\s+/g, "").toLowerCase();

// 수령 상태 JSON — { week: "YYYY-MM-DD"(그 주 월요일), claimed: [엔트리 키] }
export type WeeklyIncomeState = { week: string | null; claimed: string[] };

export function parseWeeklyIncomeState(
  json: string | null | undefined,
  currentWeek: string,
): WeeklyIncomeState {
  try {
    if (json) {
      const raw = JSON.parse(json) as Partial<WeeklyIncomeState>;
      if (raw.week === currentWeek && Array.isArray(raw.claimed)) {
        return { week: raw.week, claimed: raw.claimed.filter((k): k is string => typeof k === "string") };
      }
    }
  } catch {
    // 주가 바뀌었거나 파싱 실패 — 초기화
  }
  return { week: currentWeek, claimed: [] };
}

export type WeeklyIncomeEntryView = {
  key: string; // 수령 키 (스킬명 또는 우상)
  kind: "skill" | "item";
  emoji: string;
  name: string;
  formula: string; // "【재주】 8 × 100G" 같은 근거 표기
  amount: number; // 이번 주 수령액
  claimed: boolean;
};

export type WeeklyIncomeView = {
  week: string; // 이번 주 월요일 날짜
  entries: WeeklyIncomeEntryView[];
};

// ── 수령 가능 목록 계산 (서버·클라 공용 순수 함수) ──
// charsheet.ts 를 끌어오지 않도록 필요한 최소 형태만 받는다.
// 【능력치】는 판정 보정치(2D+X 의 X, mod)를 가리킨다 — 기본치(value)가 아님.
type StatLike = { label: string; value: number | null; mod: number | null };
type SkillLike = { name: string; sl: number };
type InvLike = { items?: { name: string; qty: number }[] };

function parseJson<T>(json: string | null | undefined): T | null {
  try {
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
}

// "강철 검(+1)" → "강철 검" — 꼬리표 제거 후 대조
const baseName = (name: string) => name.trim().replace(/\s*\([^()]*\)\s*$/, "").trim();

export function buildWeeklyIncomeEntries(input: {
  sheetSkillsJson: string | null;
  statsJson: string | null;
  invJson: string | null;
  level: number | null;
  claimed: string[];
}): WeeklyIncomeEntryView[] {
  const learned = parseJson<SkillLike[]>(input.sheetSkillsJson) ?? [];
  const stats = parseJson<StatLike[]>(input.statsJson) ?? [];
  const inv = parseJson<InvLike>(input.invJson);
  const statValue = (label: string) =>
    stats.find((stat) => stat.label === label)?.mod ?? null;
  const learnedSet = new Set(learned.filter((s) => s.sl >= 1).map((s) => normalizeSkillName(s.name)));
  const claimedSet = new Set(input.claimed);

  const entries: WeeklyIncomeEntryView[] = [];
  for (const skill of WEEKLY_INCOME_SKILLS) {
    if (!learnedSet.has(normalizeSkillName(skill.name))) continue;
    const value = statValue(skill.stat);
    entries.push({
      key: skill.name,
      kind: "skill",
      emoji: skill.emoji,
      name: skill.name,
      formula:
        value != null
          ? `【${skill.stat}】 +${value} × ${WEEKLY_INCOME_STAT_MULT}G`
          : `【${skill.stat}】 능력치 미확인 — 시트 재동기화 필요`,
      amount: value != null ? Math.max(0, value * WEEKLY_INCOME_STAT_MULT) : 0,
      claimed: claimedSet.has(skill.name),
    });
  }

  const hasIdol = (inv?.items ?? []).some(
    (item) =>
      item.qty > 0 &&
      normalizeSkillName(baseName(item.name)) === normalizeSkillName(WEEKLY_INCOME_IDOL.name),
  );
  if (hasIdol) {
    const level = input.level;
    entries.push({
      key: WEEKLY_INCOME_IDOL.key,
      kind: "item",
      emoji: WEEKLY_INCOME_IDOL.emoji,
      name: WEEKLY_INCOME_IDOL.name,
      formula:
        level != null
          ? `CL ${level} × ${WEEKLY_INCOME_IDOL.perLevel}G`
          : "CL 미확인 — 시트 재동기화 필요",
      amount: level != null ? Math.max(0, level * WEEKLY_INCOME_IDOL.perLevel) : 0,
      claimed: claimedSet.has(WEEKLY_INCOME_IDOL.key),
    });
  }

  return entries;
}
