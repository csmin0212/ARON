export const ADVENTURER_RANKS = ["D", "C", "B", "A", "S"] as const;

export const ADVENTURER_RANK_THRESHOLDS: Record<(typeof ADVENTURER_RANKS)[number], number> = {
  D: 0,
  C: 10,
  B: 25,
  A: 60,
  S: 100,
};

export const ADVENTURER_RANK_GOALS: Record<string, number> = {
  D: ADVENTURER_RANK_THRESHOLDS.C,
  C: ADVENTURER_RANK_THRESHOLDS.B,
  B: ADVENTURER_RANK_THRESHOLDS.A,
  A: ADVENTURER_RANK_THRESHOLDS.S,
  S: 0,
};

// 랭크 특혜 팝업을 띄우는 장소 (Location.id)
export const GUILD_LOCATION_ID = "모험가길드";

// 랭크별 길드 특혜 — 표시용 정본.
// 특혜는 누적이다(rankAtLeast 로 판정). 여기 적은 건 '그 랭크에서 새로 열리는 것'.
// 수치를 바꾸면 아래 '적용 지점'도 같이 고칠 것.
export type AdventurerRankPerks = { rank: string; fame: number; perks: string[] };

// 낮은 랭크 → 높은 랭크 순. 표시는 역순(S가 위)이지만 배열은 등급 순서를 유지한다.
export const ADVENTURER_RANK_PERKS: AdventurerRankPerks[] = [
  // auctionSlots
  { rank: "D", fame: ADVENTURER_RANK_THRESHOLDS.D, perks: ["경매장 등록 5칸"] },
  // + storageWeightBonus 10 / guildQuests.ts rerollCap 4
  {
    rank: "C",
    fame: ADVENTURER_RANK_THRESHOLDS.C,
    perks: ["경매장 등록 10칸", "창고 중량 +10", "의뢰 리롤권 4개"],
  },
  // + guildQuests.ts questOfferCount 4 (기본 3지선다)
  {
    rank: "B",
    fame: ADVENTURER_RANK_THRESHOLDS.B,
    perks: ["경매장 등록 15칸", "창고 중량 +10", "의뢰 4지선다"],
  },
  // + dungeon.ts WEEKLY_LIMIT +1 / auctionServer.ts listingFee 면제
  {
    rank: "A",
    fame: ADVENTURER_RANK_THRESHOLDS.A,
    perks: ["경매장 등록 20칸", "주간 던전 입장 횟수 +1", "경매장 등록 수수료 무료"],
  },
  // + storageWeightBonus 20. '전설의 모험가' 는 아직 효과 미정 — 표시만 한다.
  {
    rank: "S",
    fame: ADVENTURER_RANK_THRESHOLDS.S,
    perks: ["경매장 등록 25칸", "창고 중량 +20", "고유 버프 '전설의 모험가'"],
  },
];

export function normalizeAdventurerRank(rank: string | null | undefined): string {
  const upper = String(rank ?? "D").trim().toUpperCase();
  return upper in ADVENTURER_RANK_GOALS ? upper : "D";
}

export function adventurerRankFloor(rank: string | null | undefined): number {
  const normalized = normalizeAdventurerRank(rank) as (typeof ADVENTURER_RANKS)[number];
  return ADVENTURER_RANK_THRESHOLDS[normalized] ?? 0;
}

export function adventurerRankFromFame(fame: number | null | undefined): string {
  const total = Math.max(0, fame ?? 0);
  if (total >= ADVENTURER_RANK_THRESHOLDS.S) return "S";
  if (total >= ADVENTURER_RANK_THRESHOLDS.A) return "A";
  if (total >= ADVENTURER_RANK_THRESHOLDS.B) return "B";
  if (total >= ADVENTURER_RANK_THRESHOLDS.C) return "C";
  return "D";
}

export function totalFameForRank(rank: string | null | undefined, fame: number | null | undefined): number {
  return Math.max(0, fame ?? 0, adventurerRankFloor(rank));
}

export function nextAdventurerRank(rank: string | null | undefined): string | null {
  const current = normalizeAdventurerRank(rank);
  const index = ADVENTURER_RANKS.indexOf(current as (typeof ADVENTURER_RANKS)[number]);
  if (index < 0 || index >= ADVENTURER_RANKS.length - 1) return null;
  return ADVENTURER_RANKS[index + 1];
}

export function adventurerRankGoal(rank: string | null | undefined): number {
  return ADVENTURER_RANK_GOALS[normalizeAdventurerRank(rank)] ?? 0;
}

// 랭크 특혜 게이트 — rank 가 min 이상인지 (D < C < B < A < S)
export function rankAtLeast(rank: string | null | undefined, min: string): boolean {
  const order = ADVENTURER_RANKS as readonly string[];
  return order.indexOf(normalizeAdventurerRank(rank)) >= order.indexOf(min);
}

// 길드 특혜 — 창고 최대 중량. C~A +10, S +20.
export function storageWeightBonus(rank: string | null | undefined): number {
  if (rankAtLeast(rank, "S")) return 20;
  return rankAtLeast(rank, "C") ? 10 : 0;
}

// 경매장 동시 등록 슬롯 — 랭크업마다 +5 (D 5 → C 10 → B 15 → A 20 → S 25)
export function auctionSlots(rank: string | null | undefined): number {
  const order = ADVENTURER_RANKS as readonly string[];
  return 5 * (Math.max(0, order.indexOf(normalizeAdventurerRank(rank))) + 1);
}
