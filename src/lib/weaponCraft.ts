// 대장간 무기·방어구 제작 (C안: 하이브리드)
//
// - 무엇을 만들지 토글(종별) → 메이저 광물 투입 개수 = 장비 레벨(1~5)
// - 기준 스탯 = 공식 룰북 시트의 (종별, 레벨) 평균 — BASELINE 표
// - 메이저 보정: 투입 광물 제작효과의 개수 가중평균(질 좋은 광물 섞을수록 소폭 상향)
// - 마이너(기본 최대 2): 제작효과 수치 합산 + [태그] 부여
//   Lv15/25 확장 슬롯(3~4번째)은 지정된 특수 재료만 허용.
// - 등급(고품질/명품/장인작): 확률 롤 — 요리 등급 체계와 동일 문법.
//   생산 클래스 원칙 "상한은 평등, 기대값은 이점": 블랙스미스는 확률이 유리, 최대치는 동일.
//
// 경제 규칙 (2026-07 개편)
//   피로도 = 20 × 레벨(메이저 개수)          — '몇 개 넣었나'
//   재료가치 M = Σ(투입 재료를 그냥 팔 때의 값) — '무엇을 넣었나'(성급이 여기 반영)
//   세공비 F   = 기준가 × 25%                  — 장비 자체의 손품값, 판매가에 얹혀 회수
//   순이익 T   = M × 마진 × 등급배율
//   판매가 S   = M + F + T   →  S - F - M = T
// 광물 성급은 공식에 직접 안 들어간다. 재료가치를 타고 들어오므로 4·5성 데이터를
// 조정하면 별도 수정 없이 따라온다.

import { lifeSkillMarketPrice, type LifeSkillItem } from "./lifeSkillData";

export type CraftGroup = "무기" | "방어구";
export type CraftHand = "한손" | "양손";

export type CraftCategory = {
  key: string;
  group: CraftGroup;
  emoji: string;
  label?: string;
  hand?: CraftHand;
};

export const CRAFT_CATEGORIES: CraftCategory[] = [
  { key: "격투", group: "무기", emoji: "🥊" },
  { key: "단검", group: "무기", emoji: "🗡️", hand: "한손" },
  { key: "장검", group: "무기", emoji: "⚔️", hand: "한손" },
  { key: "양손검", group: "무기", emoji: "🗡️", hand: "양손" },
  { key: "도끼:한손", group: "무기", emoji: "🪓", label: "도끼", hand: "한손" },
  { key: "도끼:양손", group: "무기", emoji: "🪓", label: "도끼", hand: "양손" },
  { key: "타격:한손", group: "무기", emoji: "🔨", label: "타격", hand: "한손" },
  { key: "타격:양손", group: "무기", emoji: "🪄", label: "타격", hand: "양손" },
  { key: "창:한손", group: "무기", emoji: "🔱", label: "창", hand: "한손" },
  { key: "창:양손", group: "무기", emoji: "🔱", label: "창", hand: "양손" },
  { key: "채찍", group: "무기", emoji: "〰️", hand: "한손" },
  { key: "카타나", group: "무기", emoji: "🈁", hand: "한손" },
  { key: "활", group: "무기", emoji: "🏹", hand: "양손" },
  { key: "방패", group: "방어구", emoji: "🛡️" },
  { key: "몸통", group: "방어구", emoji: "🎽" },
  { key: "머리", group: "방어구", emoji: "🪖" },
  { key: "전신", group: "방어구", emoji: "🛡️" },
  { key: "보조", group: "방어구", emoji: "🧤" },
];

export function craftCategoryLabel(category: CraftCategory): string {
  return category.label ?? category.key;
}

const LEGACY_CRAFT_CATEGORY_KEYS: Record<string, string> = {
  도끼: "도끼:양손",
  타격: "타격:한손",
  창: "창:한손",
};

function normalizeCraftCategoryKey(key: string): string {
  return LEGACY_CRAFT_CATEGORY_KEYS[key] ?? key;
}

export const MAX_MAJORS = 5; // 일반 메이저 투입 상한 = Lv5
export const MAX_MINORS = 2; // 기본 마이너 슬롯 (대장 레벨로 확장)

// ── 달의 파편 — Lv6~10 티어 ──
// 일반 광물로는 Lv5가 천장이다. 그 위로 가려면 광물을 꽉 채운 상태(5개)에서
// 달의 파편을 얹어야 하고, 파편 개수가 곧 상위 단계가 된다 (1개 Lv6 … 5개 Lv10).
// 광물은 이때 '재질'을 정한다 — 레벨은 파편이, 스탯 방향은 광물이.
// Lv11부터는 또 다른 재료를 쓸 예정이라 여기서 끊는다.
export const MOON_FRAGMENT = "달의 파편";
export const MAX_MOON_FRAGMENTS = 5;
export const MOON_TIER_BASE = MAX_MAJORS; // 달의 파편 1개 = Lv6

export function isMoonFragment(name: string): boolean {
  return name.normalize("NFKC").replace(/\s+/g, "") === MOON_FRAGMENT.replace(/\s+/g, "");
}

// 피로도는 '그 티어에서 몇 개 넣었나'로 정해진다. 광물 성급은 재료가치로 들어간다.
// Lv1~5는 일반 메이저 개수, Lv6~10은 달의 파편 개수가 기준이라 둘 다 20~100 범위를 쓴다.
export const CRAFT_AP_PER_LEVEL = 20; // Lv1 20 ~ Lv5 100 / Lv6 20 ~ Lv10 100
// 숙련도는 피로도에 정비례(평탄형). 종별·레벨·성급 무관하게 AP당 같은 속도.
// 1.4 = 하루 240AP(6분당 1 회복)를 제작에 다 쓰면 대장 Lv30까지 약 197일,
// 재료를 직접 채광해가며 하면 약 344일 — 목표치 반년~1년 안.
export const CRAFT_SMITH_EXP_PER_AP = 1.4;
// 가공 마진 — 순이익 = 재료가치 × 마진 × 등급배율.
// 1.0(본전)에서 시작해 등급 확률로 올라간다: 대장 Lv1 기대 1.014 → Lv30 1.137 → Lv50 1.25.
export const CRAFT_MARGIN = 1.0;
export const CRAFT_BASE_FEE_RATE = 0.25; // 세공비 = 기준가 × 25% (판매가에 그대로 얹혀 회수됨)
export const CRAFT_BLACKSMITH_FEE_RATE = 0.8;

// 대장 숙련 레벨 → 마이너 슬롯 수 (Lv15에 3칸, Lv25에 4칸)
export function minorSlotsFor(smithLevel: number): number {
  if (smithLevel >= 25) return 4;
  if (smithLevel >= 15) return 3;
  return MAX_MINORS;
}

// 장비 레벨 → 마이너 슬롯 수 (3칸째는 Lv5, 4칸째는 Lv10부터)
// 대장 숙련과 '함께' 걸린다 — 둘 중 낮은 쪽이 실제 슬롯 수다.
// 숙련만 보면 Lv25 대장이 Lv1 단검에 특수 재료 4종을 몰아넣을 수 있어서,
// 상위 슬롯이 상위 장비에서만 열리도록 레벨 조건을 겹쳤다.
export const MINOR_SLOT_LEVEL_REQ = [0, 0, 5, 10] as const; // 슬롯 n개를 쓰려면 필요한 장비 레벨

export function minorSlotsForEquipLevel(equipLevel: number): number {
  if (equipLevel >= MINOR_SLOT_LEVEL_REQ[3]) return 4;
  if (equipLevel >= MINOR_SLOT_LEVEL_REQ[2]) return 3;
  return MAX_MINORS;
}

// 실제 사용 가능한 마이너 슬롯 — 대장 숙련과 장비 레벨 중 낮은 쪽.
export function effectiveMinorSlots(smithLevel: number, equipLevel: number): number {
  return Math.min(minorSlotsFor(smithLevel), minorSlotsForEquipLevel(equipLevel));
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

// ── 제작품 고유 시리얼 ──
// 제작할 때마다 "아무개의 미스릴 롱소드 #7K2F"처럼 이름 끝에 붙는 고유 번호.
//
// 왜 이름 칸이냐 — 휴대품 칸과 장비 칸을 오갈 때 플레이어가 손으로 옮기는데,
// 반드시 따라다니는 칸이 이름 하나뿐이다. 효과 칸에 넣으면 '이름만 옮기는' 바로 그
// 상황에서 같이 사라져서, 이름으로 도감을 뒤지다 동명이인 제작품의 효과·가격이 붙는다.
//
// 시리얼이 붙으면 Item.id가 제작 건마다 고유해지므로
//  - 같은 이름 다른 효과가 서로 덮어쓰지 않고
//  - 비싼 재료로 만든 것의 매입가를 싼 것이 물려받지 않으며
//  - 커스텀 이름이 기존 도감 아이템(아이언 너클 등)의 행을 침범하지 않는다.
// 헷갈리는 글자(0·O·1·I)는 뺐다 — 플레이어가 손으로 옮겨 적는 값이라서.
const SERIAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
// 고유번호 뒤에 꼬리표가 붙어도 번호를 읽는다. 강화 '(+1)', 보석 '(다이아몬드)',
// 인첸트 '[강운]' 처럼 플레이어·GM 이 손으로 덧붙이는 표기가 실제로 흔하다.
// 예전엔 '#XXXX' 가 이름 맨 끝이어야만 해서, 꼬리표 하나에 도감·경매 조회가 통째로
// 실패하고 동명 제작품의 효과·가격이 붙었다.
const CRAFT_SERIAL_TAIL = "(?:\\s*(?:\\([^()]*\\)|\\[[^\\][]*\\]))*";
const CRAFT_SERIAL_PATTERN = new RegExp(`\\s*#([0-9A-Z]{4,6})(${CRAFT_SERIAL_TAIL})$`);

export function craftSerialOf(name: string): string | null {
  const m = CRAFT_SERIAL_PATTERN.exec(name.trim());
  return m ? m[1] : null;
}

// 고유번호만 떼고 꼬리표는 남긴다 — 강화 수치 같은 정보를 조용히 지우지 않도록.
export function stripCraftSerial(name: string): string {
  const trimmed = name.trim();
  const m = CRAFT_SERIAL_PATTERN.exec(trimmed);
  if (!m) return trimmed;
  return `${trimmed.slice(0, m.index)}${m[2]}`.trim();
}

export function withCraftSerial(name: string, serial: string): string {
  return `${stripCraftSerial(name)} #${serial}`;
}

export function randomCraftSerial(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += SERIAL_ALPHABET[Math.floor(rand() * SERIAL_ALPHABET.length)];
  }
  return out;
}

// 제작 피로도 — 투입한 '일반 광물' 개수에 비례한다.
// Lv6~10은 광물 5개가 필수라 전부 100 고정 (달의 파편은 피로도를 더 먹지 않는다).
export function craftApCost(level: number): number {
  const oreCount = Math.min(Math.max(1, level), MAX_MAJORS);
  return CRAFT_AP_PER_LEVEL * oreCount;
}

// 제작 숙련도 — 소모한 피로도에 정비례.
// (기준가 비례였을 땐 전신Lv5만 반복하면 38일, 단검Lv1만 만들면 7년으로 70배 편차가 났다)
export function craftSmithExp(level: number): number {
  return Math.max(1, Math.round(craftApCost(level) * CRAFT_SMITH_EXP_PER_AP));
}

// 재료 1종의 가치 = 그 재료를 그냥 팔았을 때 받는 골드.
// 이게 어긋나면 '가공해서 팔면 그냥 파는 것보다 이득'이라는 전제가 깨지므로,
// 매각 경로와 반드시 같은 함수(lifeSkillMarketPrice)를 통과시킨다.
// 아이템 탭 드롭품(itemAsCraftMinor, no=0)은 광물이 아니라 sellPrice 그대로 쓴다.
export function craftMaterialUnitValue(item: LifeSkillItem): number {
  return item.no > 0 ? lifeSkillMarketPrice("채광", item) : Math.max(0, Math.round(item.price));
}

// 투입한 재료 전체의 가치 (메이저 개수분 + 마이너 각 1개)
export function craftMaterialValue(
  majors: { item: LifeSkillItem; qty: number }[],
  minors: LifeSkillItem[],
): number {
  const major = majors.reduce((sum, m) => sum + craftMaterialUnitValue(m.item) * m.qty, 0);
  const minor = minors.reduce((sum, m) => sum + craftMaterialUnitValue(m), 0);
  return Math.round(major + minor);
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
    { hit: 0, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 780, rep: "미스릴 클로", part: "두손" },
    { hit: 0, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 1100, rep: "파타", part: "두손" },
    { hit: 0, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 2100, rep: "가이스트 블레이드", part: "두손" },
    { hit: 0, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 2625, rep: "골렘 펀치", part: "두손" },
    { hit: 0, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 4200, rep: "다이아 너클", part: "두손" },
  ],
  단검: [
    { hit: 0, atk: 4, dodge: 0, pdef: 0, mdef: 0, price: 30, rep: "대거", part: "한손" },
    { hit: 0, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 100, rep: "카타르", part: "한손" },
    { hit: 0, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 250, rep: "파인 대거", part: "한손" },
    { hit: 0, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "슈리켄", part: "한손" },
    { hit: 0, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 800, rep: "소드 브레이커", part: "한손" },
    { hit: 0, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "스틸레토", part: "한손" },
    { hit: 0, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 1400, rep: "미스릴 대거", part: "한손" },
    { hit: 0, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 2200, rep: "쿠크리", part: "한손" },
    { hit: 0, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 3000, rep: "키드니 대거", part: "한손" },
    { hit: 0, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 4800, rep: "웨폰 브레이커", part: "한손" },
  ],
  장검: [
    { hit: -1, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 150, rep: "롱소드", part: "한손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 180, rep: "브로드 소드", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "피란기", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "파인 소드", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 580, rep: "펄션", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 725, rep: "펄션", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 980, rep: "미스릴 소드", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 1225, rep: "글라디우스", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1531, rep: "미스릴 펄션", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 3800, rep: "미스릴 시미터", part: "한손" },
  ],
  양손검: [
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 275, rep: "그레이트 소드", part: "양손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 400, rep: "펄스", part: "양손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 640, rep: "룸파이아", part: "양손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 800, rep: "파인 클레이모어", part: "양손" },
    { hit: -1, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "플랑베르주", part: "양손" },
    { hit: -1, atk: 16, dodge: 0, pdef: 0, mdef: 0, price: 1300, rep: "헤비 클레이모어", part: "양손" },
    { hit: -1, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 1980, rep: "헤비 에스터크", part: "양손" },
    { hit: -2, atk: 19, dodge: 0, pdef: 0, mdef: 0, price: 2800, rep: "아웃레이지", part: "양손" },
    { hit: -2, atk: 19, dodge: 0, pdef: 0, mdef: 0, price: 3600, rep: "미스릴 펄스", part: "양손" },
    { hit: -2, atk: 20, dodge: 0, pdef: 0, mdef: 0, price: 6100, rep: "미스릴 플랑베르주", part: "양손" },
  ],
  "도끼:한손": [
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 80, rep: "핸드 액스", part: "한손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 160, rep: "배틀 액스", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 320, rep: "워 액스", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 520, rep: "파인 액스", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 800, rep: "헤비 액스", part: "한손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "실버 액스", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1600, rep: "미스릴 핸드 액스", part: "한손" },
    { hit: -1, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 2400, rep: "미스릴 워 액스", part: "한손" },
    { hit: -1, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 3600, rep: "네바프 핸드 액스", part: "한손" },
    { hit: -1, atk: 16, dodge: 0, pdef: 0, mdef: 0, price: 4800, rep: "다이아 액스", part: "한손" },
  ],
  "도끼:양손": [
    { hit: -2, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 160, rep: "그레이트 액스", part: "양손" },
    { hit: -2, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 230, rep: "부주", part: "양손" },
    { hit: -2, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 510, rep: "폴 액스", part: "양손" },
    { hit: -2, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 620, rep: "헤비 핼버드", part: "양손" },
    { hit: -2, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "버디슈", part: "양손" },
    { hit: -2, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1250, rep: "텅기", part: "양손" },
    { hit: -2, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 2200, rep: "부치", part: "양손" },
    { hit: -2, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 2750, rep: "미스릴 액스", part: "양손" },
    { hit: -2, atk: 19, dodge: 0, pdef: 0, mdef: 0, price: 4800, rep: "네바프 액스", part: "양손" },
    { hit: -2, atk: 19, dodge: 0, pdef: 0, mdef: 0, price: 6200, rep: "크레센트 액스", part: "양손" },
  ],
  "타격:한손": [
    { hit: -1, atk: 4, dodge: 0, pdef: 0, mdef: 0, price: 80, rep: "라이트 메이스", part: "한손" },
    { hit: -1, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 250, rep: "픽", part: "한손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 360, rep: "모닝스타", part: "한손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 480, rep: "파인 메이스", part: "한손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "헤비 플레일", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 700, rep: "홀리 크로스", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 875, rep: "워 픽", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 1094, rep: "미스릴 해머", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 1368, rep: "미스릴 픽", part: "한손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 2200, rep: "다이아 메이스", part: "한손" },
  ],
  "타격:양손": [
    { hit: -1, atk: 2, dodge: 0, pdef: 1, mdef: 0, price: 80, rep: "스태프", part: "양손" },
    { hit: -1, atk: 4, dodge: 0, pdef: 2, mdef: 0, price: 250, rep: "쿼터스태프", part: "양손" },
    { hit: -1, atk: 5, dodge: 0, pdef: 3, mdef: 0, price: 360, rep: "메이지 스태프", part: "양손" },
    { hit: -1, atk: 6, dodge: 0, pdef: 4, mdef: 0, price: 480, rep: "파인 스태프", part: "양손" },
    { hit: -1, atk: 6, dodge: 0, pdef: 5, mdef: 0, price: 500, rep: "가드 스태프", part: "양손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 6, mdef: 0, price: 700, rep: "룬 스태프", part: "양손" },
    { hit: -1, atk: 8, dodge: 0, pdef: 7, mdef: 0, price: 875, rep: "워 스태프", part: "양손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 8, mdef: 0, price: 1094, rep: "미스릴 스태프", part: "양손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 9, mdef: 0, price: 1368, rep: "미스릴 가드 스태프", part: "양손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 10, mdef: 0, price: 2200, rep: "다이아 스태프", part: "양손" },
  ],
  "창:한손": [
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 140, rep: "숏 스피어", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 280, rep: "스피어", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 420, rep: "파인 스피어", part: "한손" },
    { hit: -1, atk: 11, dodge: 0, pdef: 0, mdef: 0, price: 560, rep: "랜스", part: "한손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 705, rep: "파이크", part: "한손" },
    { hit: -1, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 1500, rep: "미스릴 스피어", part: "한손" },
    { hit: -1, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 1875, rep: "헤비 랜스", part: "한손" },
    { hit: -1, atk: 16, dodge: 0, pdef: 0, mdef: 0, price: 2800, rep: "풋맨즈 파이크", part: "한손" },
    { hit: -1, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 4100, rep: "십자창", part: "한손" },
    { hit: -1, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 5125, rep: "다이아 랜스", part: "한손" },
  ],
  "창:양손": [
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 350, rep: "트라이던트", part: "양손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 450, rep: "헤비 스피어", part: "양손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 590, rep: "랜시아", part: "양손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 900, rep: "롱 스피어", part: "양손" },
    { hit: -1, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 1350, rep: "핼버드", part: "양손" },
    { hit: -1, atk: 15, dodge: 0, pdef: 0, mdef: 0, price: 1800, rep: "미스릴 트라이던트", part: "양손" },
    { hit: -1, atk: 16, dodge: 0, pdef: 0, mdef: 0, price: 2400, rep: "미스릴 핼버드", part: "양손" },
    { hit: -1, atk: 17, dodge: 0, pdef: 0, mdef: 0, price: 3200, rep: "풋맨즈 랜시아", part: "양손" },
    { hit: -1, atk: 18, dodge: 0, pdef: 0, mdef: 0, price: 4600, rep: "크로스 스피어", part: "양손" },
    { hit: -1, atk: 19, dodge: 0, pdef: 0, mdef: 0, price: 5800, rep: "다이아 핼버드", part: "양손" },
  ],
  채찍: [
    { hit: -2, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 30, rep: "윕", part: "한손" },
    { hit: -2, atk: 6, dodge: 0, pdef: 0, mdef: 0, price: 80, rep: "체인 윕", part: "한손" },
    { hit: -2, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 130, rep: "헤비 윕", part: "한손" },
    { hit: -2, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 390, rep: "파인 윕", part: "한손" },
    { hit: -2, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 600, rep: "체인 대거", part: "한손" },
    { hit: -2, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 820, rep: "와이어 윕", part: "한손" },
    { hit: -2, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 1025, rep: "와이어 윕", part: "한손" },
    { hit: -2, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 1800, rep: "미스릴 윕", part: "한손" },
    { hit: -2, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 2250, rep: "미스릴 윕", part: "한손" },
    { hit: -2, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 3000, rep: "체인 스파이크", part: "한손" },
  ],
  카타나: [
    { hit: -1, atk: 8, dodge: 0, pdef: 0, mdef: 0, price: 200, rep: "키쿠이치몬지", part: "한손" },
    { hit: -1, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 350, rep: "키쿠이치몬지", part: "한손" },
    { hit: -1, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 500, rep: "마사무네", part: "한손" },
    { hit: -1, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 750, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1000, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1250, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1563, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 1954, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 2443, rep: "무라마사", part: "한손" },
    { hit: -1, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 3054, rep: "무라마사", part: "한손" },
  ],
  활: [
    { hit: -1, atk: 5, dodge: 0, pdef: 0, mdef: 0, price: 380, rep: "라이트 크로스 보우", part: "양손" },
    { hit: -2, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 300, rep: "롱 보우", part: "양손" },
    { hit: -1, atk: 7, dodge: 0, pdef: 0, mdef: 0, price: 600, rep: "헤비 크로스 보우", part: "양손" },
    { hit: -2, atk: 9, dodge: 0, pdef: 0, mdef: 0, price: 690, rep: "파인 크로스 보우", part: "양손" },
    { hit: -2, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 980, rep: "컴보짓 보우", part: "양손" },
    { hit: -2, atk: 10, dodge: 0, pdef: 0, mdef: 0, price: 1300, rep: "리피터", part: "양손" },
    { hit: -2, atk: 12, dodge: 0, pdef: 0, mdef: 0, price: 1625, rep: "래피드 보우", part: "양손" },
    { hit: -2, atk: 13, dodge: 0, pdef: 0, mdef: 0, price: 2500, rep: "아바레스트", part: "양손" },
    { hit: -2, atk: 14, dodge: 0, pdef: 0, mdef: 0, price: 3800, rep: "헤비 컴포짓 보우", part: "양손" },
    { hit: -2, atk: 16, dodge: 0, pdef: 0, mdef: 0, price: 6000, rep: "발리스타", part: "양손" },
  ],
  방패: [
    { hit: 0, atk: 0, dodge: -1, pdef: 3, mdef: 0, price: 100, rep: "라운드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 4, mdef: 0, price: 150, rep: "카이트 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 5, mdef: 0, price: 400, rep: "하이 퀄리티 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 6, mdef: 0, price: 650, rep: "파인 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 1000, rep: "하드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 1250, rep: "하드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 1563, rep: "하드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 1954, rep: "하드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 2443, rep: "하드 실드", part: "한손" },
    { hit: 0, atk: 0, dodge: -1, pdef: 8, mdef: 0, price: 3054, rep: "하드 실드", part: "한손" },
  ],
  몸통: [
    { hit: 0, atk: 0, dodge: 0, pdef: 3, mdef: 0, price: 100, rep: "레더 재킷", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 250, rep: "스터디드 메일", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 400, rep: "스케일 아머", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 8, mdef: 0, price: 650, rep: "하프 플레이트", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 8, mdef: 0, price: 900, rep: "스니킹 슈트", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 8, mdef: 1, price: 3200, rep: "플레이트 메일", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 9, mdef: 1, price: 4000, rep: "퀴래스", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 9, mdef: 1, price: 5200, rep: "홀리 브레스트", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 10, mdef: 1, price: 6800, rep: "영은제 도마루", part: "몸통" },
    { hit: 0, atk: 0, dodge: 0, pdef: 10, mdef: 2, price: 8500, rep: "리플렉트 아머", part: "몸통" },
  ],
  머리: [
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 50, rep: "해적 모자", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 100, rep: "메이지 햇", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 3, mdef: 0, price: 200, rep: "클로스 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 400, rep: "그레이트 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 5, mdef: 0, price: 700, rep: "그랜드 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 5, mdef: 0, price: 1200, rep: "매지컬 햇", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 5, mdef: 1, price: 2900, rep: "월광의 서클릿", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 1, price: 3625, rep: "크리스탈 헬름", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 1, price: 4700, rep: "홀리 서클릿", part: "머리" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 1, price: 5875, rep: "지르코니아 헬름", part: "머리" },
  ],
  전신: [
    { hit: 0, atk: 0, dodge: -2, pdef: 9, mdef: 0, price: 400, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -2, pdef: 11, mdef: 0, price: 700, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -2, pdef: 13, mdef: 0, price: 1000, rep: "슈트 아머", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 15, mdef: 1, price: 1500, rep: "풀 플레이트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 16, mdef: 1, price: 2000, rep: "풀 플레이트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 16, mdef: 1, price: 2500, rep: "풀 플레이트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 19, mdef: 1, price: 4800, rep: "크리스탈 슈트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 19, mdef: 1, price: 6000, rep: "크리스탈 슈트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 19, mdef: 1, price: 7500, rep: "크리스탈 슈트", part: "전신" },
    { hit: 0, atk: 0, dodge: -3, pdef: 21, mdef: 1, price: 11200, rep: "다이아 슈트", part: "전신" },
  ],
  보조: [
    { hit: 0, atk: 0, dodge: 0, pdef: 1, mdef: 0, price: 100, rep: "포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 2, mdef: 0, price: 200, rep: "트래블러즈 망토", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 400, rep: "파인 포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 4, mdef: 0, price: 600, rep: "파인 포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 0, price: 900, rep: "가드 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 6, mdef: 1, price: 2600, rep: "로그 망토", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 7, mdef: 1, price: 3800, rep: "다이아 포인트 아머", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 7, mdef: 2, price: 4750, rep: "매직 망토", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 7, mdef: 2, price: 5938, rep: "다이아 건틀릿", part: "보조" },
    { hit: 0, atk: 0, dodge: 0, pdef: 7, mdef: 2, price: 7423, rep: "룬 포인트 아머", part: "보조" },
  ],
};

// 장비 종류별 기준 중량. 인덱스 = 레벨-1.
// 최종 중량은 이 값에 메이저 광물 평균 중량 보정을 얹는다.
const BASELINE_WEIGHT: Record<string, number[]> = {
  격투: [3, 4, 5, 6, 6, 6, 7, 7, 7, 8],
  단검: [1, 2, 2, 2, 3, 3, 4, 4, 5, 5],
  장검: [6, 7, 8, 8, 8, 8, 8, 9, 9, 9],
  양손검: [10, 11, 12, 13, 14, 14, 14, 14, 14, 15],
  "도끼:한손": [5, 6, 7, 8, 8, 9, 9, 10, 10, 11],
  "도끼:양손": [11, 11, 12, 13, 14, 14, 14, 14, 14, 14],
  "타격:한손": [5, 7, 8, 9, 10, 10, 10, 10, 10, 10],
  "타격:양손": [5, 6, 7, 8, 9, 9, 10, 10, 10, 11],
  "창:한손": [8, 9, 10, 11, 12, 13, 13, 14, 15, 15],
  "창:양손": [10, 10, 11, 12, 12, 13, 14, 14, 15, 15],
  채찍: [3, 4, 5, 6, 7, 7, 7, 7, 7, 7],
  카타나: [5, 6, 7, 8, 9, 9, 9, 9, 9, 9],
  활: [6, 7, 8, 9, 10, 10, 10, 13, 13, 13],
  방패: [3, 4, 5, 6, 7, 7, 7, 7, 7, 7],
  몸통: [5, 7, 8, 10, 9, 9, 9, 10, 11, 11],
  머리: [1, 1, 2, 3, 4, 4, 4, 5, 5, 6],
  전신: [12, 14, 16, 18, 20, 20, 20, 20, 20, 20],
  보조: [1, 2, 3, 4, 5, 5, 5, 5, 5, 5],
};

export function craftEquipmentWeight(categoryKey: string, level: number, avgMajorWeight: number): number {
  const weights = BASELINE_WEIGHT[categoryKey];
  const maxLevel = weights?.length ?? MAX_MAJORS;
  const baseWeight = weights?.[Math.min(Math.max(1, level), maxLevel) - 1] ?? Math.max(1, level);
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

// 순이익 — 투입한 재료를 그냥 팔았을 때의 값에 가공 마진과 등급 배율을 곱한 것.
// 일반 등급이면 딱 본전(재료가치만큼 더 번다), 등급이 붙는 만큼이 대장장이의 실력값.
export function craftProfit(materialValue: number, grade: CraftGradeKey | null): number {
  const mult = CRAFT_MARGIN * (grade ? CRAFT_GRADES[grade].priceMult : 1);
  return Math.max(1, Math.round(materialValue * mult));
}

// 상점 매입가(=Item.sellPrice) = 재료가치 + 세공비 + 순이익.
// 세공비가 판매가에 얹혀 있으므로 제작자는 낸 수수료를 팔 때 그대로 회수한다.
export function craftSellPrice(
  materialValue: number,
  fee: number,
  grade: CraftGradeKey | null,
): number {
  return Math.max(1, materialValue + fee + craftProfit(materialValue, grade));
}

// 세공비 — 장비 자체의 손품값. 종별·레벨(기준가)에만 반응하고 광물과는 무관.
export function craftBaseFee(basePrice: number): number {
  return Math.max(10, Math.round(basePrice * CRAFT_BASE_FEE_RATE));
}

// 블랙스미스는 선불 부담이 20% 가볍다. 판매가도 실제 낸 수수료로 계산되므로
// 순이익 자체는 동일하고, 클래스 이점은 등급 확률(craftGradeRates) 쪽에 있다.
export function craftFee(baseFee: number, isBlacksmith: boolean): number {
  return Math.max(10, isBlacksmith ? Math.round(baseFee * CRAFT_BLACKSMITH_FEE_RATE) : baseFee);
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
  basePrice: number; // 기준가 — 세공비 산정 (종별·레벨만 반영)
  materialValue: number; // 투입 재료를 그냥 팔았을 때의 값 — 판매가·순이익의 기준
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
  const categoryKey = normalizeCraftCategoryKey(input.category);
  const category = CRAFT_CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return { error: "만들 장비 종류를 선택해주세요." };
  const categoryLabel = craftCategoryLabel(category);

  const all = input.majors.filter((m) => m.qty > 0);
  // 달의 파편은 레벨(티어)만 올리고, 일반 메이저가 재질·스탯을 정한다.
  const moonQty = all
    .filter((m) => isMoonFragment(m.item.name))
    .reduce((sum, m) => sum + m.qty, 0);
  const majors = all.filter((m) => !isMoonFragment(m.item.name));
  const oreQty = majors.reduce((sum, m) => sum + m.qty, 0);
  const level = moonQty > 0 ? MOON_TIER_BASE + moonQty : oreQty;

  const maxMinors = input.maxMinors ?? MAX_MINORS;
  if (oreQty < 1) return { error: "메이저 광물을 1개 이상 넣어주세요." };
  if (moonQty > MAX_MOON_FRAGMENTS) {
    return { error: `${MOON_FRAGMENT}은 최대 ${MAX_MOON_FRAGMENTS}개까지예요. (Lv10)` };
  }
  // 상위 티어는 아래 단계를 다 채운 뒤에 올라간다 — 광물 5개(Lv5)가 전제.
  if (moonQty > 0 && oreQty < MAX_MAJORS) {
    return {
      error: `${MOON_FRAGMENT}을 쓰려면 메이저 광물을 ${MAX_MAJORS}개 채워야 해요. (현재 ${oreQty}개)`,
    };
  }
  if (oreQty > MAX_MAJORS) {
    return { error: `메이저 광물은 최대 ${MAX_MAJORS}개까지예요. (개수 = 장비 레벨)` };
  }
  if (input.minors.length > maxMinors) return { error: `마이너 재료는 최대 ${maxMinors}종이에요. (대장 레벨로 확장)` };
  // 장비 레벨 조건 — 대장 숙련을 통과해도 저레벨 장비면 확장 슬롯이 안 열린다.
  const levelSlots = minorSlotsForEquipLevel(level);
  if (input.minors.length > levelSlots) {
    return {
      error: `마이너 재료 ${input.minors.length}종은 장비 레벨 ${
        MINOR_SLOT_LEVEL_REQ[input.minors.length] ?? MINOR_SLOT_LEVEL_REQ[3]
      } 이상부터예요. (현재 Lv${level})`,
    };
  }
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
  if (!rows) return { error: "이 장비 종류는 아직 제작 기준이 없어요." };
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
  // 나누는 값은 '넣은 광물 개수'다 — 레벨로 나누면 달의 파편으로 레벨만 올렸을 때
  // 광물 효과가 6~10으로 희석돼 사라진다.
  const stats: CraftStats = {
    hit: base.hit + Math.round(acc.hit / oreQty),
    atk: base.atk + Math.round(acc.atk / oreQty),
    dodge: base.dodge + Math.round(acc.dodge / oreQty),
    pdef: base.pdef + Math.round(acc.pdef / oreQty),
    mdef: base.mdef + Math.round(acc.mdef / oreQty),
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

  // 기준가는 장비 자체의 세공값(종별·레벨)만 나타낸다.
  // 광물의 질은 재료가치(materialValue)로 판매가·순이익에 직접 반영되므로 여기서 또 곱하지 않는다.
  const basePrice = base.price;
  const fee = craftBaseFee(basePrice);
  // 재료가치는 달의 파편도 포함한다 — 그대로 팔았을 때의 값이 순이익의 기준이라서.
  const materialValue = craftMaterialValue(all, input.minors);

  // 중량 — 장비 기준 중량에 메이저 광물 평균 중량을 반영한다.
  const avgMajorWeight = majors.reduce((s, m) => s + (m.item.weight || 1) * m.qty, 0) / oreQty;
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
    `Lv${level} ${categoryLabel} · ${base.part}`,
  ].join("\n");

  return {
    category: categoryLabel,
    group: category.group,
    level,
    part: base.part,
    repName: base.rep,
    majorRep,
    stats,
    tags: tagList,
    extras,
    basePrice,
    materialValue,
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
