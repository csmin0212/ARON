// 클래스 이름 대조용 정규화.
//
// 외래어 표기에서 ㅈ·ㅉ·ㅊ 뒤의 ㅑㅕㅛㅠ 는 ㅏㅓㅗㅜ 와 소리가 같아 표기가 갈린다.
// 실제로 DB 안에서도 갈려 있었다 — 전투스킬 '직업'은 '일루져니스트',
// 캐릭터 시트 클래스는 '일루저니스트' 라 스킬북이 "전용 스킬이에요" 로 막혔다.
// 국립국어원 표기는 '저' 쪽이지만 둘 다 통용되므로 대조할 때만 한쪽으로 모은다
// (표시 문구는 원본을 그대로 쓴다).

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

// 초성 ㅈ(12) ㅉ(13) ㅊ(14)
const PALATAL_CHO = new Set([12, 13, 14]);
// 중성 ㅑ(2)→ㅏ(0) · ㅕ(6)→ㅓ(4) · ㅛ(12)→ㅗ(8) · ㅠ(17)→ㅜ(13)
const JUNG_FOLD: Record<number, number> = { 2: 0, 6: 4, 12: 8, 17: 13 };

function foldSyllable(ch: string): string {
  const code = ch.codePointAt(0);
  if (code == null || code < HANGUL_BASE || code > HANGUL_LAST) return ch;
  const offset = code - HANGUL_BASE;
  const cho = Math.floor(offset / (JUNG_COUNT * JONG_COUNT));
  const jung = Math.floor((offset % (JUNG_COUNT * JONG_COUNT)) / JONG_COUNT);
  const jong = offset % JONG_COUNT;
  if (!PALATAL_CHO.has(cho)) return ch;
  const folded = JUNG_FOLD[jung];
  if (folded == null) return ch;
  return String.fromCodePoint(HANGUL_BASE + (cho * JUNG_COUNT + folded) * JONG_COUNT + jong);
}

// 위 규칙(ㅈ·ㅉ·ㅊ + ㅑㅕㅛㅠ)으로는 못 잡는 표기 흔들림을 쌍으로 적는다.
// 첫 항목이 대표 표기 — 대조할 때 나머지가 여기로 모인다.
// 실제 사례: 스킬 '직업' 은 '건슬링어', 어떤 시트는 '건슬링거' 로 적혀 있었다.
const CLASS_ALIAS_GROUPS: string[][] = [["건슬링어", "건슬링거"]];

function foldKey(name: string): string {
  return String(name ?? "")
    .normalize("NFC")
    .replace(/[\s·・\-_]/g, "")
    .split("")
    .map(foldSyllable)
    .join("")
    .toLowerCase();
}

const ALIAS_TO_CANONICAL = new Map<string, string>(
  CLASS_ALIAS_GROUPS.flatMap((group) => {
    const canonical = foldKey(group[0]);
    return group.map((variant) => [foldKey(variant), canonical] as const);
  }),
);

// 대조 전용 키. 공백·구분자를 지우고 표기 흔들림을 한쪽으로 모은다.
export function classMatchKey(name: string | null | undefined): string {
  const folded = foldKey(String(name ?? ""));
  return ALIAS_TO_CANONICAL.get(folded) ?? folded;
}

// 두 클래스 이름이 같은 클래스인지 (표기 차이 무시)
export function sameClass(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = classMatchKey(a);
  return left.length > 0 && left === classMatchKey(b);
}
