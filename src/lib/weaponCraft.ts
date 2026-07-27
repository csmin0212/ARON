// 대장간 무기·방어구 제작 (C안: 하이브리드)
//
// - 무엇을 만들지 토글(종별) → 메이저 광물 투입 개수 = 장비 레벨(1~5)
// - 기준 스탯 = 공식 룰북 시트의 (종별, 레벨) 평균 — BASELINE 표
// - 메이저 보정: 투입 광물 제작효과의 개수 가중평균(질 좋은 광물 섞을수록 소폭 상향)
// - 마이너(기본 최대 2): 제작효과 수치 합산 + [태그] 부여
//   Lv15/25 확장 슬롯(3~4번째)은 지정된 특수 재료만 허용.
// - 등급(고품질/명품/장인작): 확률 롤 — 요리 등급 체계와 동일 문법.
//   생산 클래스 원칙 "상한은 평등, 기대값은 이점": 블랙스미스는 확률이 유리, 최대치는 동일.

import type { LifeSkillItem } from "./lifeSkillData";

export type CraftGroup = "무기" | "방어구";

export type CraftCategory = {
  key: string;
  group: CraftGroup;
  emoji: string;
};

export const CRAFT_CATEGORIES: CraftCategory[] = [
  { key: "격투", group: "무기", emoji: "🥊" },
  { key: "단검", group: "무기", emoji: "🗡️" },
  { key: "장검", group: "무기", emoji: "⚔️" },
  { key: "양손검", group: "무기", emoji: "🗡️" },
  { key: "도끼", group: "무기", emoji: "🪓" },
  { key: "타격", group: "무기", emoji: "🔨" },
  { key: "창", group: "무기", emoji: "🔱" },
  { key: "채찍", group: "무기", emoji: "〰️" },
  { key: "카타나", group: "무기", emoji: "🈁" },
  { key: "활", group: "무기", emoji: "🏹" },
  { key: "방패", group: "방어구", emoji: "🛡️" },
  { key: "몸통", group: "방어구", emoji: "🎽" },
  { key: "머리", group: "방어구", emoji: "🪖" },
  { key: "전신", group: "방어구", emoji: "🛡️" },
  { key: "보조", group: "방어구", emoji: "🧤" },
];

export const MAX_MAJORS = 5; // 메이저 투입 상한 = 최대 레벨
export const MAX_MINORS = 2; // 기본 마이너 슬롯 (대장 레벨로 확장)
export const CRAFT_AP_COST = 60;
export const CRAFT_BASE_FEE_RATE = 0.25;
export const CRAFT_BLACKSMITH_FEE_RATE = 0.8;
export const CRAFT_SELL_PRICE_RATE = 0.4;
export const CRAFT_MAX_NET_GOLD_PER_CRAFT = 40;

// 대장 숙련 레벨 → 마이너 슬롯 수 (Lv15에 3칸, Lv25에 4칸)
export function minorSlotsFor(smithLevel: number): number {
  if (smithLevel >= 25) return 4;
  if (smithLevel >= 15) return 3;
  return MAX_MINORS;
}

const EXTRA_MINOR_MATERIAL_NAMES = [
  "그리폰깃털",
  "그리폰 깃털",
  "독수리발톱",
  "크라그 독수리의 발톱",
  "박쥐날개막",
  "동굴 박쥐의 날개막",
  "어둠의조각",
  "살아있는 어둠의 조각",
  "전갈독침",
  "모래 전갈의 독침",
  "도마뱀가죽",
  "사막 도마뱀의 가죽",
  "늪악어이빨",
  "습지 악어의 이빨",
  "도깨비불정수",
  "도깨비불의 정수",
  "유령의잔재",
  "유령의 잔재",
  "늑대송곳니",
  "숲 늑대의 송곳니",
  "사슴뿔조각",
  "수사슴의 뿔 조각",
  "네잎클로버",
  "달빛풀",
  "유령선못",
  "유령선의 녹슨 못",
  "참나무심재",
  "늙은 참나무의 심재",
  "잠긴기도서",
  "물에 잠긴 기도서",
  "메아리결정",
  "메아리 결정",
  "반딧불호박",
  "반딧불 호박",
  "정령의눈물",
  "정령의 눈물",
  "석상조각",
  "풍화를 거부한 석상 조각",
  "설표어금니",
  "설표의 어금니",
  "프리즘수정",
  "프리즘 수정",
  "첫빛이슬",
  "첫빛의 이슬",
  "벼랑매발톱",
  "벼랑매의 발톱",
  "지맥쇳덩이",
  "지맥의 쇳덩이",
  "소원동전",
  "소원이 깃든 동전",
  "크라켄빨판",
  "크라켄의 빨판",
  "청옥물방울",
  "청옥 물방울",
  "여명결정",
  "여명의 결정",
  "질풍깃털",
  "질풍의 깃털",
  "대지심장석",
  "대지의 심장석",
  "이무기비늘",
  "이무기의 비늘",
  "산울림돌",
  "산울림 돌",
  "생명의수정",
  "생명의 수정",
  "마력수정",
  "마력의 수정",
  "가시덩굴심장",
  "가시덩굴의 심장",
  "마력코어파편",
  "마력 코어 파편",
  "요마의뿔",
  "요마의 뿔",
  "마족의핵",
  "마족의 핵",
  "거인의골편",
  "거인의 골편",
  "용린조각",
  "용린 조각",
];

const EXTRA_MINOR_MATERIAL_SET = new Set(
  EXTRA_MINOR_MATERIAL_NAMES.map((name) => name.normalize("NFKC").replace(/\s+/g, "")),
);

export function isCraftMinorMaterial(item: LifeSkillItem): boolean {
  return EXTRA_MINOR_MATERIAL_SET.has(item.name.normalize("NFKC").replace(/\s+/g, ""));
}

// 제작 피로도 — 하루 300 기준 5회 제작으로 제한
export function craftApCost(level: number): number {
  void level;
  return CRAFT_AP_COST;
}

// 제작 숙련도 — 기준가 비례 (좋은 광물·높은 레벨일수록 많이)
export function craftSmithExp(basePrice: number): number {
  return Math.max(5, Math.round(basePrice * 0.14));
}

// 제작 스탯 — 무기: hit/atk, 방어구: dodge/pdef/mdef. price는 기준가(수수료·판매가 산정용).
export type CraftStats = {
  hit: number;
  atk: number;
  dodge: number;
  pdef: number;
  mdef: number;
};

type BaselineRow = CraftStats & { price: number; rep: string; part: string };

// 공식 룰북 시트 평균(2026-07 추출, 결측 레벨은 인접값 보간·단조 보정). 인덱스 = 레벨-1.
export const BASELINE: Record<string, BaselineRow[]> = {
  격투: [
    { hit: 0, atk: 3, dodge: 0, pdef: 0, mdef: 0, price: 30, rep: "바그 나우", part: "두손" },
    { hit: 0, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 85, rep: "클로", part: "두손" },
    { hit: 1, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 200, rep: "훅", part: "두손" },
    { hit: 0, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 400, rep: "바드 나우", part: "두손" },
    { hit: 1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "너클", part: "두손" },
  ],
  단검: [
    { hit: 0, atk: 4, dodge: 0, pdef: 0, mdef: 0, price: 30, rep: "대거", part: "한손" },
    { hit: 0, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 100, rep: "카타르", part: "한손" },
    { hit: 0, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 250, rep: "파인 대거", part: "한손" },
    { hit: 0, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "슈리켄", part: "한손" },
    { hit: 0, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 800, rep: "소드 브레이커", part: "한손" },
  ],
  장검: [
    { hit: -1, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 150, rep: "롱소드", part: "한손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 180, rep: "브로드 소드", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "피란기", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "파인 소드", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 580, rep: "펄션", part: "한손" },
  ],
  양손검: [
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 275, rep: "그레이트 소드", part: "양손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 400, rep: "펄스", part: "양손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 640, rep: "룸파이아", part: "양손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 800, rep: "파인 클레이모어", part: "양손" },
    { hit: -1, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "플랑베르주", part: "양손" },
  ],
  도끼: [
    { hit: -2, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 160, rep: "그레이트 액스", part: "양손" },
    { hit: -2, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 230, rep: "부주", part: "양손" },
    { hit: -2, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 510, rep: "폴 액스", part: "양손" },
    { hit: -2, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 620, rep: "헤비 핼버드", part: "양손" },
    { hit: -2, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "버디슈", part: "양손" },
  ],
  타격: [
    { hit: -1, atk: 4, dodge: 0, pdef: 0, mdef: 0, price: 80, rep: "라이트 메이스", part: "한손" },
    { hit: -1, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 250, rep: "픽", part: "한손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 360, rep: "모닝스타", part: "한손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 480, rep: "파인 메이스", part: "한손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "헤비 플레일", part: "한손" },
  ],
  창: [
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 140, rep: "숏 스피어", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 350, rep: "트라이던트", part: "양손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 450, rep: "헤비 스피어", part: "양손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 590, rep: "랜시아", part: "양손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 705, rep: "파이크", part: "한손" },
  ],
  채찍: [
    { hit: -2, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 30, rep: "윕", part: "한손" },
    { hit: -2, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 80, rep: "체인 윕", part: "한손" },
    { hit: -2, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 130, rep: "헤비 윕", part: "한손" },
    { hit: -2, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 390, rep: "파인 윕", part: "한손" },
    { hit: -2, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 600, rep: "체인 대거", part: "한손" },
  ],
  카타나: [
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 200, rep: "키쿠이치몬지", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 350, rep: "키쿠이치몬지", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "마사무네", part: "한손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 750, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "무라마사", part: "한손" },
  ],
  활: [
    { hit: -1, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 380, rep: "라이트 크로스 보우", part: "양손" },
    { hit: -2, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "롱 보우", part: "양손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 600, rep: "헤비 크로스 보우", part: "양손" },
    { hit: -2, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 690, rep: "파인 크로스 보우", part: "양손" },
    { hit: -2, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 980, rep: "컴보짓 보우", part: "양손" },
  ],
  방패: [
    { hit: 0, atk: 0, dodge: -1, pdef: 3, mdef: 0, price: 100, rep: "라운드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 4, mdef: 0, price: 150, rep: "카이트 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 5, mdef: 0, price: 400, rep: "하이 퀄리티 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 6, mdef: 0, price: 650, rep: "파인 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 1000, rep: "하드 실드", part: "한손" },
  ],
  몸통: [
    { hit: 0, atk: 0, dodge: 0, pdef: 3, mdef: 0, price: 100, rep: "레더 재킷", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 250, rep: "스터디드 메일", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 400, rep: "스케일 아머", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 8, mdef: 0, price: 650, rep: "하프 플레이트", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 8, mdef: 0, price: 900, rep: "스니킹 슈트", part: "몸통" },
  ],
  머리: [
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 50, rep: "해적 모자", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 100, rep: "메이지 햇", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 3, mdef: 0, price: 200, rep: "클로스 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 400, rep: "그레이트 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 5, mdef: 0, price: 700, rep: "그랜드 헬름", part: "머리" },
  ],
  전신: [
    { hit: 0, atk: 0, dodge: -2, pdef: 9, mdef: 0, price: 400, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -2, pdef: 11, mdef: 0, price: 700, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -2, pdef: 13, mdef: 0, price: 1000, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 15, mdef: 1, price: 1500, rep: "풀 플레이트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 16, mdef: 1, price: 2000, rep: "풀 플레이트", part: "전신" },
  ],
  보조: [
    { hit: 0, atk: 0, dodge: 0, pdef: 1, mdef: 0, price: 100, rep: "포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 200, rep: "트래블러즈 망토", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 400, rep: "파인 포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 600, rep: "파인 포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 900, rep: "가드 아머", part: "보조" },
  ],
};

// 장비 종류별 기준 중량. 인덱스 = 레벨-1.
// 최종 중량은 이 값에 메이저 광물 평균 중량 보정을 얹는다.
const BASELINE_WEIGHT: Record<string, number[]> = {
  격투: [3, 4, 5, 6, 6],
  단검: [1, 2, 2, 2, 3],
  장검: [6, 7, 8, 8, 8],
  양손검: [10, 11, 12, 13, 14],
  도끼: [11, 11, 12, 13, 14],
  타격: [5, 7, 8, 9, 10],
  창: [8, 10, 11, 12, 12],
  채찍: [3, 4, 5, 6, 7],
  카타나: [5, 6, 7, 8, 9],
  활: [6, 7, 8, 9, 10],
  방패: [3, 4, 5, 6, 7],
  몸통: [5, 7, 8, 10, 9],
  머리: [1, 1, 2, 3, 4],
  전신: [12, 14, 16, 18, 20],
  보조: [1, 2, 3, 4, 5],
};

export function craftEquipmentWeight(categoryKey: string, level: number, avgMajorWeight: number): number {
  const weights = BASELINE_WEIGHT[categoryKey];
  const baseWeight = weights?.[Math.min(Math.max(1, level), MAX_MAJORS) - 1] ?? Math.max(1, level);
  const materialAdjustment = Math.round(avgMajorWeight - 3);
  return Math.max(1, baseWeight + materialAdjustment);
}

// ── 제작효과 파서 — "공격력+2, 물방+1, [화염속성]" ──
const STAT_ALIASES: Record<string, keyof CraftStats> = {
  명중: "hit",
  공격력: "atk",
  공격: "atk",
  회피: "dodge",
  물방: "pdef",
  물리방어력: "pdef",
  물리방어: "pdef",
  마방: "mdef",
  마법방어력: "mdef",
  마법방어: "mdef",
};

export type CraftEffect = { stats: Partial<CraftStats>; tags: string[]; extras: string[] };

export function parseCraftEffect(spec: string | null | undefined): CraftEffect {
  const stats: Partial<CraftStats> = {};
  const tags: string[] = [];
  const extras: string[] = [];
  for (const raw of (spec ?? "").split(/[,，]/)) {
    const part = raw.trim();
    if (!part) continue;
    const tag = part.match(/^\[(.+)\]$/);
    if (tag) {
      tags.push(tag[1].trim());
      continue;
    }
    const m = part.match(/^(.+?)\s*([+\-]\d+)$/);
    const key = m ? STAT_ALIASES[m[1].replace(/\s+/g, "")] : undefined;
    if (m && key) {
      stats[key] = (stats[key] ?? 0) + parseInt(m[2], 10);
    } else {
      extras.push(part); // 미인식 표기(마법위력+1 등)는 효과 텍스트에 그대로 병기
    }
  }
  return { stats, tags, extras };
}

// ── 등급 (요리 등급과 동일 문법: 고품질/명품/장인작) ──
export type CraftGradeKey = "고품질" | "명품" | "장인";
export const CRAFT_GRADES: Record<CraftGradeKey, { bonus: number; priceMult: number }> = {
  고품질: { bonus: 1, priceMult: 1.2 },
  명품: { bonus: 2, priceMult: 1.5 },
  장인: { bonus: 3, priceMult: 2 },
};

export function craftSellPrice(basePrice: number, grade: CraftGradeKey | null): number {
  const baseSellPrice = Math.round(basePrice * CRAFT_SELL_PRICE_RATE);
  if (!grade) return Math.max(1, baseSellPrice);
  const profit = Math.max(0, baseSellPrice - craftBaseFee(basePrice));
  return Math.max(1, baseSellPrice + Math.ceil(profit * (CRAFT_GRADES[grade].priceMult - 1)));
}

export function craftBaseFee(basePrice: number): number {
  return Math.max(20, Math.round(basePrice * CRAFT_BASE_FEE_RATE));
}

export function craftFee(baseFee: number, sellPrice: number, isBlacksmith: boolean): number {
  const classFee = isBlacksmith ? Math.round(baseFee * CRAFT_BLACKSMITH_FEE_RATE) : baseFee;
  const resaleGuardFee = Math.max(0, sellPrice - CRAFT_MAX_NET_GOLD_PER_CRAFT);
  return Math.max(10, classFee, resaleGuardFee);
}

export function craftFeeRange(
  baseFee: number,
  basePrice: number,
  isBlacksmith: boolean,
): { min: number; max: number } {
  const grades: (CraftGradeKey | null)[] = [null, "고품질", "명품", "장인"];
  const fees = grades.map((grade) => craftFee(baseFee, craftSellPrice(basePrice, grade), isBlacksmith));
  return { min: Math.min(...fees), max: Math.max(...fees) };
}

export type CraftGradeRates = { signature: number; master: number; hq: number };

// 요리 등급처럼 숙련 레벨이 올라갈수록 좋은 결과가 열린다.
// 장비 제작은 재료·피로도 부담이 크므로 요리보다 약간 후한 곡선이고,
// 블랙스미스는 같은 숙련도에서 확률과 상한이 조금 더 유리하다.
export function craftGradeRates(smithLevel: number, isBlacksmith: boolean): CraftGradeRates {
  const level = Math.max(1, Math.floor(smithLevel || 1));
  return {
    signature: Math.max(0, Math.min(isBlacksmith ? 12 : 10, (level - 25) * (isBlacksmith ? 0.48 : 0.4))),
    master: Math.max(0, Math.min(isBlacksmith ? 14 : 12, (level - 15) * (isBlacksmith ? 0.7 : 0.6))),
    hq: Math.max(0, Math.min(isBlacksmith ? 50 : 45, (isBlacksmith ? 8 : 6) + level * (isBlacksmith ? 1.1 : 1))),
  };
}

export function rollCraftGrade(
  smithLevel: number,
  isBlacksmith: boolean,
  highGradeMultiplier = 1,
  rand: () => number = Math.random,
): CraftGradeKey | null {
  const r = rand() * 100;
  const { signature, master, hq } = craftGradeRates(smithLevel, isBlacksmith);
  const boostedMaster = master * highGradeMultiplier;
  const boostedHq = hq * highGradeMultiplier;
  if (r < signature) return "장인";
  if (r < signature + boostedMaster) return "명품";
  if (r < signature + boostedMaster + boostedHq) return "고품질";
  return null;
}

export function isBlacksmithClass(charClass: string | null | undefined): boolean {
  return (charClass ?? "").replace(/\s+/g, "").includes("블랙스미스");
}

// 아이템 탭 드롭품(제작효과 채워진 것) → 마이너 재료 어댑터.
// 광물이 아니므로 메이저 불가, 중량 기여 1(깃털·비늘 등 가벼운 마감재).
export function itemAsCraftMinor(item: {
  name: string;
  craftEffect: string | null;
  sellPrice?: number | null;
  desc?: string | null;
  weight?: number | null;
}): LifeSkillItem {
  return {
    no: 0,
    name: item.name,
    rank: 0,
    rarity: "재료",
    weight: item.weight ?? 1,
    price: item.sellPrice ?? 0,
    exp: 0,
    sizeBase: 0,
    sizeVariance: 0,
    text: item.desc ?? "",
    craftRole: "마이너",
    craftEffect: item.craftEffect,
  };
}

// ── 제작 계산 ──
export type CraftInput = {
  category: string;
  majors: { item: LifeSkillItem; qty: number }[];
  minors: LifeSkillItem[];
  maxMinors?: number; // 대장 레벨에 따른 마이너 슬롯 (기본 MAX_MINORS)
  // 태그 슬롯 규칙 — 태그명 → "무기"|"방어구"|"공용". 슬롯이 안 맞으면 그 태그는 안 붙는다.
  tagSlotOf?: (tag: string) => string;
};

export type CraftPreview = {
  category: string;
  group: CraftGroup;
  level: number;
  part: string;
  repName: string; // 기준 무기명 (롱소드 등)
  majorRep: string; // 대표 광물(최다 투입, 동률 시 고등급) — 작명용 "미스릴제"
  stats: CraftStats;
  tags: string[];
  extras: string[];
  basePrice: number; // 기준가 — 수수료·판매가 산정
  fee: number; // 제작 수수료 (블랙스미스 할인 전)
  weight: number; // 장비 중량 — 종류/레벨 기준 중량 + 메이저 광물 평균 중량 보정
  isMagic: boolean; // 마이너 재료가 들어간 매직 아이템 여부
  effectText: string; // 결과 아이템 효과 설명
};

function statLine(stats: CraftStats, group: CraftGroup): string {
  const parts: string[] = [];
  const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  if (group === "무기") {
    parts.push(`명중 ${fmt(stats.hit)}`, `공격력 ${fmt(stats.atk)}`);
    if (stats.dodge !== 0) parts.push(`회피 ${fmt(stats.dodge)}`);
    if (stats.pdef !== 0) parts.push(`물방 ${fmt(stats.pdef)}`);
    if (stats.mdef !== 0) parts.push(`마방 ${fmt(stats.mdef)}`);
  } else {
    if (stats.dodge !== 0) parts.push(`회피 ${fmt(stats.dodge)}`);
    parts.push(`물리 방어력 ${fmt(stats.pdef)}`, `마법 방어력 ${fmt(stats.mdef)}`);
    if (stats.hit !== 0) parts.push(`명중 ${fmt(stats.hit)}`);
    if (stats.atk !== 0) parts.push(`공격력 ${fmt(stats.atk)}`);
  }
  return parts.join(" · ");
}

// 그룹에 맞는 스탯만 남긴다 — 방어구에 공격력이 새는 것 방지 (같은 광물이 무기/방어구에서 다르게 작동)
function maskForGroup(stats: Partial<CraftStats>, group: CraftGroup): Partial<CraftStats> {
  if (group === "무기") return { hit: stats.hit, atk: stats.atk };
  return { dodge: stats.dodge, pdef: stats.pdef, mdef: stats.mdef };
}

// 속성 태그 슬롯 분기 — 시트엔 [화속성] 하나만 적으면
// 무기 제작 시 '화속성 특화'(<화> 마법 피해 +2), 방어구 제작 시 '화속성 내성'(<화> 피해 경감 2)이 된다.
const ATTRIBUTE_TAG = /^(화|수|지|풍|광|암)\s*속성$/;
export function resolveSlotTag(tag: string, group: CraftGroup): string {
  const m = tag.trim().match(ATTRIBUTE_TAG);
  if (m) return group === "무기" ? `${m[1]}속성 특화` : `${m[1]}속성 내성`;
  return tag.trim();
}

export function computeCraft(input: CraftInput): CraftPreview | { error: string } {
  const category = CRAFT_CATEGORIES.find((c) => c.key === input.category);
  if (!category) return { error: "만들 장비 종류를 선택해주세요." };

  const majors = input.majors.filter((m) => m.qty > 0);
  const level = majors.reduce((sum, m) => sum + m.qty, 0);
  const maxMinors = input.maxMinors ?? MAX_MINORS;
  if (level < 1) return { error: "메이저 광물을 1개 이상 넣어주세요." };
  if (level > MAX_MAJORS) return { error: `메이저 광물은 최대 ${MAX_MAJORS}개까지예요. (개수 = 장비 레벨)` };
  if (input.minors.length > maxMinors) return { error: `마이너 재료는 최대 ${maxMinors}종이에요. (대장 레벨로 확장)` };
  for (const m of majors) {
    if ((m.item.craftRole ?? "") !== "메이저") return { error: `${m.item.name}은(는) 메이저 광물이 아니에요.` };
  }
  const majorKinds = new Set(majors.map((m) => m.item.name.trim()));
  if (majorKinds.size > 1) {
    return { error: "메이저 광물은 한 종류만 넣을 수 있어요. 같은 광물 수량으로 장비 레벨을 올려주세요." };
  }
  for (const m of input.minors) {
    if ((m.craftRole ?? "") !== "마이너") return { error: `${m.name}은(는) 마이너 재료가 아니에요.` };
  }
  for (const [index, m] of input.minors.entries()) {
    if (index >= MAX_MINORS && !isCraftMinorMaterial(m)) {
      return { error: "3번째와 4번째 마이너 슬롯에는 지정된 특수 재료만 넣을 수 있어요." };
    }
  }

  const rows = BASELINE[category.key];
  const base = rows[Math.min(level, rows.length) - 1];

  // 메이저 — 개수 가중평균(질 좋은 광물을 섞을수록 기준보다 소폭 상향)
  const acc: CraftStats = { hit: 0, atk: 0, dodge: 0, pdef: 0, mdef: 0 };
  const tags = new Set<string>();
  const extras: string[] = [];
  for (const m of majors) {
    const eff = parseCraftEffect(m.item.craftEffect);
    const masked = maskForGroup(eff.stats, category.group);
    for (const [k, v] of Object.entries(masked)) {
      if (v) acc[k as keyof CraftStats] += v * m.qty;
    }
    for (const t of eff.tags) tags.add(resolveSlotTag(t, category.group));
    extras.push(...eff.extras);
  }
  const stats: CraftStats = {
    hit: base.hit + Math.round(acc.hit / level),
    atk: base.atk + Math.round(acc.atk / level),
    dodge: base.dodge + Math.round(acc.dodge / level),
    pdef: base.pdef + Math.round(acc.pdef / level),
    mdef: base.mdef + Math.round(acc.mdef / level),
  };

  // 마이너 — 효과 합산(종류당 1개)
  for (const m of input.minors) {
    const eff = parseCraftEffect(m.craftEffect);
    const masked = maskForGroup(eff.stats, category.group);
    for (const [k, v] of Object.entries(masked)) {
      if (v) stats[k as keyof CraftStats] += v;
    }
    for (const t of eff.tags) tags.add(resolveSlotTag(t, category.group));
    extras.push(...eff.extras);
  }

  // 대표 광물 — 최다 투입, 동률 시 고등급
  const repMajor = [...majors].sort((a, b) => b.qty - a.qty || b.item.rank - a.item.rank)[0];
  const majorRep = repMajor.item.name.replace(/\s*(광석|원석|조각)$/, "");

  // 광물 질 반영 기준가 — 메이저 평균 등급이 높을수록 가치 상승
  const avgRank = majors.reduce((s, m) => s + m.item.rank * m.qty, 0) / level;
  const basePrice = Math.round(base.price * (1 + Math.max(0, avgRank - 2) * 0.25));
  const fee = craftBaseFee(basePrice);

  // 중량 — 장비 기준 중량에 메이저 광물 평균 중량을 반영한다.
  const avgMajorWeight = majors.reduce((s, m) => s + (m.item.weight || 1) * m.qty, 0) / level;
  const weight = craftEquipmentWeight(category.key, level, avgMajorWeight);
  const isMagic = input.minors.length > 0;

  // 슬롯 게이팅 — 이 장비 종류(무기/방어구)에 안 맞는 태그는 제거.
  // (예: 화속성 내성=방어구 전용이라 무기엔 안 붙음, 맹독=무기 전용이라 방어구엔 안 붙음)
  const tagSlotOf = input.tagSlotOf;
  const tagList = [...tags].filter((t) => {
    const slot = tagSlotOf?.(t) ?? "공용";
    return slot === "공용" || slot === category.group;
  });
  // 부재료 효과(태그·부가효과)를 스탯 바로 다음 줄에 — 목록 미리보기(2줄)에서도 보이게.
  const effectText = [
    statLine(stats, category.group),
    ...(tagList.length > 0 ? [tagList.map((t) => `[${t}]`).join(" ")] : []),
    ...(extras.length > 0 ? [extras.join(" · ")] : []),
    ...(isMagic ? ["분류: 매직 아이템"] : []),
    `Lv${level} ${category.key} · ${base.part}`,
  ].join("\n");

  return {
    category: category.key,
    group: category.group,
    level,
    part: base.part,
    repName: base.rep,
    majorRep,
    stats,
    tags: tagList,
    extras,
    basePrice,
    fee,
    weight,
    isMagic,
    effectText,
  };
}

// 결과 이름 — 공식 표기 관례("미스릴 너클")를 따른다.
// "구리 롱소드" / "명품 구리 롱소드" / "뭇별의 구리 롱소드"(장인작)
// 기준 무기명에 이미 광물이 들어 있으면("미스릴 너클") 중복 접두를 붙이지 않는다.
export function craftResultName(
  preview: Pick<CraftPreview, "majorRep" | "repName">,
  grade: CraftGradeKey | null,
  crafterName: string,
  customBase?: string,
): string {
  const base =
    customBase?.trim() ||
    (preview.repName.includes(preview.majorRep)
      ? preview.repName
      : `${preview.majorRep} ${preview.repName}`);
  if (grade === "장인") return `${crafterName}의 ${base}`;
  if (grade) return `${grade} ${base}`;
  return base;
}

// 등급 보너스 — 무기는 공격력, 방어구는 물리 방어력에 부여 (요리 effectBonus와 동일 사상)
export function applyGradeBonus(stats: CraftStats, group: CraftGroup, grade: CraftGradeKey | null): CraftStats {
  if (!grade) return stats;
  const bonus = CRAFT_GRADES[grade].bonus;
  return group === "무기" ? { ...stats, atk: stats.atk + bonus } : { ...stats, pdef: stats.pdef + bonus };
}
