// 쌍별 — 두 글자 한국어 단어 맞히기. 하루 한 판, 전원 같은 정답, 기회 7번.
//
// 판정은 자모 단위로 한다. 겹받침(ㄳ)·모음 합자(ㅘ)는 구성 자모를 각각 가진 것으로 보고,
// 쌍자음(ㄲ)과 ㅐ/ㅔ/ㅒ/ㅖ는 별개 자모로 센다.

import { STARWORD_ANSWERS, STARWORD_EXTRA } from "./starwordWords";

export const STARWORD_MAX_TRIES = 7;
export const STARWORD_ENTRY_FEE = 50;
export const STARWORD_CLEAR_REWARD = 100;
/** 리더보드 1·2·3등 추가 보상 — 다음 날 정산해 우편으로 보낸다. */
export const STARWORD_RANK_REWARDS = [100, 50, 30];

// ── 판정 ──
export type StarwordVerdict = "별" | "항성" | "행성" | "혜성" | "위성" | "공허";

export const STARWORD_ICON: Record<StarwordVerdict, string> = {
  별: "⭐",
  항성: "🌟",
  행성: "🪐",
  혜성: "☄️",
  위성: "🌑",
  공허: "🕳️",
};

export const STARWORD_LEGEND: { verdict: StarwordVerdict; text: string }[] = [
  { verdict: "별", text: "글자가 정확히 일치" },
  { verdict: "항성", text: "첫 자음이 같고, 나머지도 하나 이상 일치" },
  { verdict: "행성", text: "자모가 둘 이상 일치하지만 첫 자음은 다름" },
  { verdict: "혜성", text: "자모가 하나만 일치" },
  { verdict: "위성", text: "이 자리엔 없고 반대쪽 글자에 있음" },
  { verdict: "공허", text: "어디에도 없음" },
];

// ── 한글 분해 ──
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("");

// 겹받침·합자 → 구성 자모. 표에 없으면 그 자체가 단일 자모다.
const COMPOSITE: Record<string, string[]> = {
  ㄳ: ["ㄱ", "ㅅ"],
  ㄵ: ["ㄴ", "ㅈ"],
  ㄶ: ["ㄴ", "ㅎ"],
  ㄺ: ["ㄹ", "ㄱ"],
  ㄻ: ["ㄹ", "ㅁ"],
  ㄼ: ["ㄹ", "ㅂ"],
  ㄽ: ["ㄹ", "ㅅ"],
  ㄾ: ["ㄹ", "ㅌ"],
  ㄿ: ["ㄹ", "ㅍ"],
  ㅀ: ["ㄹ", "ㅎ"],
  ㅄ: ["ㅂ", "ㅅ"],
  ㅘ: ["ㅗ", "ㅏ"],
  ㅙ: ["ㅗ", "ㅐ"],
  ㅚ: ["ㅗ", "ㅣ"],
  ㅝ: ["ㅜ", "ㅓ"],
  ㅞ: ["ㅜ", "ㅔ"],
  ㅟ: ["ㅜ", "ㅣ"],
  ㅢ: ["ㅡ", "ㅣ"],
};

const expand = (jamo: string): string[] => COMPOSITE[jamo] ?? [jamo];

export type SyllableParts = {
  /** 첫 자음 (초성) */
  cho: string;
  /** 초·중·종성을 구성 자모로 모두 펼친 목록 */
  jamo: string[];
};

export function isHangulSyllable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

export function splitSyllable(ch: string): SyllableParts | null {
  if (!isHangulSyllable(ch)) return null;
  const index = (ch.codePointAt(0) as number) - HANGUL_BASE;
  const cho = CHO[Math.floor(index / 588)];
  const jung = JUNG[Math.floor((index % 588) / 28)];
  const jong = JONG[index % 28];
  const jamo = [cho, ...expand(jung)];
  if (jong !== "_") jamo.push(...expand(jong));
  return { cho, jamo };
}

/** 두 글자 한글인지 (입력 검증용) */
export function isValidStarwordShape(word: string): boolean {
  const w = word.trim();
  return w.length === 2 && [...w].every(isHangulSyllable);
}

// 한 글자 판정 — 우선순위가 높은 것부터 검사한다.
function judgeSyllable(guess: string, answerHere: string, answerOther: string): StarwordVerdict {
  if (guess === answerHere) return "별";

  const g = splitSyllable(guess);
  const here = splitSyllable(answerHere);
  const other = splitSyllable(answerOther);
  if (!g || !here || !other) return "공허";

  // 같은 자모가 여러 번 나올 수 있으므로 다중집합으로 센다 (ㅗ+ㅗ 는 두 번 필요).
  const countMatches = (target: SyllableParts): number => {
    const pool = [...target.jamo];
    let hit = 0;
    for (const j of g.jamo) {
      const at = pool.indexOf(j);
      if (at >= 0) {
        pool.splice(at, 1);
        hit++;
      }
    }
    return hit;
  };

  const hitsHere = countMatches(here);
  // 둘 이상 맞았을 때만 초성 일치 여부로 항성/행성이 갈린다.
  // 하나만 맞은 건 그게 초성이든 아니든 혜성 — 원작의 가지(🍆)와 같은 자리.
  if (hitsHere >= 2) return g.cho === here.cho ? "항성" : "행성";
  if (hitsHere === 1) return "혜성";
  return countMatches(other) > 0 ? "위성" : "공허";
}

/** 추측 한 줄의 판정 (글자별). 반드시 두 글자여야 한다. */
export function judgeStarword(guess: string, answer: string): StarwordVerdict[] {
  const g = [...guess.trim()];
  const a = [...answer.trim()];
  return [judgeSyllable(g[0], a[0], a[1]), judgeSyllable(g[1], a[1], a[0])];
}

export function isStarwordCleared(verdicts: StarwordVerdict[]): boolean {
  return verdicts.length === 2 && verdicts.every((v) => v === "별");
}

// ── 그날의 정답 ──
// 날짜 문자열을 시드로 뽑으므로 전원 같은 답이 나오고, 자정이 지나면 저절로 바뀐다.
// (별도 스케줄러가 필요 없다)
export function starwordDayKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function starwordOfDay(day: string = starwordDayKey()): string {
  return STARWORD_WORDS[hashString(`쌍별:${day}`) % STARWORD_WORDS.length];
}

/** 소요 시간 표기 — 리더보드용 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

// ── 어휘 ──
// 정답 풀과 추측 허용 목록은 starwordWords 에 있다. 정답은 "아는 말"로 좁히고,
// 추측은 넓게 열어 떠오르는 단어를 그냥 넣어볼 수 있게 한다.
export const STARWORD_WORDS = STARWORD_ANSWERS;

const GUESSABLE = new Set([...STARWORD_ANSWERS, ...STARWORD_EXTRA]);

/** 입력 가능한 단어인지 (정답 풀보다 넓다) */
export function isKnownStarword(word: string): boolean {
  return GUESSABLE.has(word.trim());
}
