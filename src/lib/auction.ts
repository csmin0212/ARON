// 경매장(거래 장터) 공용 설정·헬퍼 — 즉시구매 전용 MVP.
// DB 의존 로직(하한·카테고리 판정)은 actions/auction.ts 에 둔다. 여기는 순수 상수/타입/포맷.

import type { LifeSkillKind } from "./lifeSkillData";

// 등록 후 유효 기간(일). 지나면 판매자에게 반송.
export const LISTING_DAYS = 3;
// 판매 성사 시 떼는 수수료(골드 싱크). 판매자 수령액 = 판매가 − 수수료.
export const COMMISSION_RATE = 0.05;
// 등록 수수료(골드 싱크). 헐값 스팸 방지 + 싱크. 총 호가 기준.
export const LISTING_FEE_RATE = 0.02;

export const AUCTION_CATEGORIES = [
  "전체",
  "어획물",
  "채집품",
  "요리",
  "재료",
  "소비",
  "스킬북",
  "기타",
] as const;
export type AuctionCategory = (typeof AUCTION_CATEGORIES)[number];

// 판매 가능 출처: 휴대품(basic) / 낚시 가방 / 채집 가방
export type AuctionSource = "basic" | LifeSkillKind;

// 등록 시 아이템에서 떠 두는 스냅샷 (itemMeta 컬럼 JSON)
export type AuctionItemMeta = {
  effect: string | null;
  weight: number | null;
  rank: number | null;
  text: string | null;
  source: AuctionSource;
};

export function parseAuctionMeta(json: string | null | undefined): AuctionItemMeta {
  try {
    if (json) {
      const v = JSON.parse(json) as Partial<AuctionItemMeta>;
      return {
        effect: v.effect ?? null,
        weight: typeof v.weight === "number" ? v.weight : null,
        rank: typeof v.rank === "number" ? v.rank : null,
        text: v.text ?? null,
        source: v.source === "낚시" || v.source === "채집" ? v.source : "basic",
      };
    }
  } catch {
    // fallthrough
  }
  return { effect: null, weight: null, rank: null, text: null, source: "basic" };
}

export function isAuctionSource(value: string): value is AuctionSource {
  return value === "basic" || value === "낚시" || value === "채집";
}

// 등록 수수료(총 호가 기준). 최소 1골드.
export function listingFee(unitPrice: number, quantity: number): number {
  return Math.max(1, Math.floor(unitPrice * quantity * LISTING_FEE_RATE));
}

// 판매 성사 시 판매자 실수령액 (수수료 차감).
export function netProceeds(unitPrice: number, quantity: number): number {
  const gross = unitPrice * quantity;
  return gross - Math.floor(gross * COMMISSION_RATE);
}

export function listingExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + LISTING_DAYS * 24 * 60 * 60 * 1000);
}

// ── 요리 등급(숙련도 보상) ──
// 요리 시 확률로 등급이 붙어 성능·가격이 오른다. 최상위 '장인작'은 요리사 캐릭터 이름이 새겨진다.
// 이름 형식: "고품질 송어구이" / "명품 송어구이" / "뭇별의 송어구이"(장인작)
export type CookGrade = { key: string; effectBonus: number; priceMult: number };

export const COOK_GRADES: CookGrade[] = [
  { key: "고품질", effectBonus: 1, priceMult: 1.4 },
  { key: "명품", effectBonus: 2, priceMult: 2.0 },
];

// 시그니처(장인작) — 요리사 닉네임이 "{닉네임}의 {기본이름}" 으로 새겨지는 최상위 등급.
export const SIGNATURE_GRADE: CookGrade = { key: "장인", effectBonus: 3, priceMult: 3.0 };

const GRADE_KEYS = COOK_GRADES.map((g) => g.key);

export function gradeInfo(grade: string | null): CookGrade | null {
  if (!grade) return null;
  if (grade === SIGNATURE_GRADE.key) return SIGNATURE_GRADE;
  return COOK_GRADES.find((g) => g.key === grade) ?? null;
}

// 등급 접두어를 떼어 기본 레시피 이름을 복원. 주의: 어획물(예: "바다의 전령")과 충돌 가능하므로
// 호출부에서 먼저 생활 아이템 여부(lifeSkillItemKind)를 raw 이름으로 확인한 뒤 요리에만 사용할 것.
export function parseCookedName(name: string): { base: string; grade: string | null } {
  let s = name.trim();
  let grade: string | null = null;
  // 구버전 호환: 끝의 "(고품질)"
  if (/\(고품질\)\s*$/.test(s)) {
    grade = "고품질";
    s = s.replace(/\s*\(고품질\)\s*$/, "").trim();
  }
  const tok = s.split(/\s+/)[0];
  if (GRADE_KEYS.includes(tok)) {
    grade = tok;
    s = s.slice(tok.length).trim();
  } else if (/의$/.test(tok) && s.length > tok.length) {
    // "{닉네임}의 ..." — 장인작 서명
    grade = SIGNATURE_GRADE.key;
    s = s.slice(tok.length).trim();
  }
  return { base: s, grade };
}

export function buildCookedName(base: string, grade: string | null, nickname: string): string {
  if (grade === SIGNATURE_GRADE.key) return `${nickname}의 ${base}`;
  if (grade) return `${grade} ${base}`;
  return base;
}

// 효과 텍스트의 첫 수치를 n 만큼 강화. "+N" 우선, 없으면 회복 주사위 "[ND]" 를 +n.
export function enhanceEffectText(effect: string, n = 1): string {
  if (/\+\s*\d+/.test(effect)) {
    return effect.replace(/\+\s*(\d+)/, (_m, d: string) => `+${Number(d) + n}`);
  }
  return effect.replace(/\[(\d+)\s*D\]/, (_m, d: string) => `[${Number(d) + n}D]`);
}
