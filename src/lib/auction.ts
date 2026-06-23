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
