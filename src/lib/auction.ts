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

// ── 요리 등급(숙련도 보상) + 랜덤 작명 (MMO식) ──
// 요리 시 확률로 등급이 붙어 성능·가격이 오른다. 작명 접두어는 순수 플레이버(성능 무관).
// 아이템 이름 형식: "[등급] [작명의] 기본이름"  예) "명품 불꽃의 송어구이"
export type CookGrade = { key: string; effectBonus: number; priceMult: number };

export const COOK_GRADES: CookGrade[] = [
  { key: "고품질", effectBonus: 1, priceMult: 1.4 },
  { key: "명품", effectBonus: 2, priceMult: 2.0 },
];

// 랜덤 작명 접두어 (플레이버 전용). 단일 토큰만 — 파싱 안정성 위해 공백 없는 한 단어.
export const COOK_AFFIXES: string[] = [
  "불꽃의", "서리의", "여명의", "황혼의", "현자의", "방랑자의", "미식가의", "폭풍의",
  "대지의", "별빛의", "심연의", "용맹의", "고요의", "영광의", "노을의", "청명한",
  "따스한", "풍요의", "정령의", "만월의", "명장의", "전설의", "축복의", "황금의", "새벽의",
];

const GRADE_KEYS = COOK_GRADES.map((g) => g.key);
const AFFIX_SET = new Set(COOK_AFFIXES);

export function gradeInfo(grade: string | null): CookGrade | null {
  return grade ? (COOK_GRADES.find((g) => g.key === grade) ?? null) : null;
}

// 등급·작명 접두어를 떼어 기본 레시피 이름을 복원. (구버전 "(고품질)" 접미사도 호환)
export function parseCookedName(name: string): { base: string; grade: string | null; affix: string | null } {
  let s = name.trim();
  let grade: string | null = null;
  let affix: string | null = null;
  // 구버전 호환: 끝의 "(고품질)"
  if (/\(고품질\)\s*$/.test(s)) {
    grade = "고품질";
    s = s.replace(/\s*\(고품질\)\s*$/, "").trim();
  }
  let tok = s.split(/\s+/)[0];
  if (GRADE_KEYS.includes(tok)) {
    grade = tok;
    s = s.slice(tok.length).trim();
    tok = s.split(/\s+/)[0];
  }
  if (AFFIX_SET.has(tok)) {
    affix = tok;
    s = s.slice(tok.length).trim();
  }
  return { base: s, grade, affix };
}

export function buildCookedName(base: string, grade: string | null, affix: string | null): string {
  return [grade, affix, base].filter(Boolean).join(" ");
}

// 효과 텍스트의 첫 수치를 n 만큼 강화. "+N" 우선, 없으면 회복 주사위 "[ND]" 를 +n.
export function enhanceEffectText(effect: string, n = 1): string {
  if (/\+\s*\d+/.test(effect)) {
    return effect.replace(/\+\s*(\d+)/, (_m, d: string) => `+${Number(d) + n}`);
  }
  return effect.replace(/\[(\d+)\s*D\]/, (_m, d: string) => `[${Number(d) + n}D]`);
}
