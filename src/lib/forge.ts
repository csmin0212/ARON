// 대장간 수식어(인첸트) 시스템 — 무기/방어구 앞에 랜덤 수식어를 붙여 스탯을 보정한다.
// 강철 파편 1개 = 리롤 1회. 추첨 비율 좋음30 / 보통30 / 나쁨40. 효과는 효과칸의 텍스트(테이블탑 적용).

export type ForgeSlot = "weapon" | "armor";
export type ForgeTier = "good" | "normal" | "bad";
export type ForgePrefix = { name: string; tier: ForgeTier; effect: string };

export const WEAPON_PREFIXES: ForgePrefix[] = [
  // 🟦 좋음
  { name: "뾰족한", tier: "good", effect: "공격력 +2" },
  { name: "날카로운", tier: "good", effect: "공격력 +3" },
  { name: "정확한", tier: "good", effect: "명중 +2" },
  { name: "충실한", tier: "good", effect: "공격력 +2, 명중 +1" },
  { name: "무자비한", tier: "good", effect: "공격력 +3, 중량 -1" },
  { name: "강한", tier: "good", effect: "공격력 +3, 행동 -1" },
  { name: "신속한", tier: "good", effect: "행동 +1, 이동력 +1" },
  { name: "기민한", tier: "good", effect: "행동 +2" },
  { name: "가벼운", tier: "good", effect: "이동력 +1, 중량 -1" },
  { name: "살인적인", tier: "good", effect: "공격력 +2, 행동 +1" },
  { name: "노련한", tier: "good", effect: "공격력 +1, 명중 +1, 행동 +1" },
  { name: "명장의", tier: "good", effect: "공격력 +2, 명중 +1, 중량 -1" },
  { name: "전설적인", tier: "good", effect: "공격력 +3, 명중 +1, 행동 +1" },
  { name: "신화적인", tier: "good", effect: "공격력 +3, 행동 +1, 이동력 +1, 중량 -1" },
  // ⬜ 보통
  { name: "큰", tier: "normal", effect: "공격력 +1, 중량 +1" },
  { name: "무거운", tier: "normal", effect: "공격력 +2, 행동 -1, 중량 +2" },
  { name: "험악한", tier: "normal", effect: "공격력 +1, 행동 +1, 명중 -1" },
  // 🟥 나쁨
  { name: "무딘", tier: "bad", effect: "공격력 -2" },
  { name: "작은", tier: "bad", effect: "공격력 -1, 중량 -1" },
  { name: "끔찍한", tier: "bad", effect: "공격력 -2, 명중 -1" },
  { name: "나약한", tier: "bad", effect: "명중 -1, 행동 -1" },
  { name: "게으른", tier: "bad", effect: "행동 -1" },
  { name: "부진한", tier: "bad", effect: "행동 -2, 이동력 -1" },
  { name: "짜증나는", tier: "bad", effect: "공격력 -2, 행동 -1" },
  { name: "둔한", tier: "bad", effect: "행동 -1, 중량 +2" },
];

export const ARMOR_PREFIXES: ForgePrefix[] = [
  // 🟦 좋음
  { name: "단단한", tier: "good", effect: "물리 방어력 +2" },
  { name: "견고한", tier: "good", effect: "물리 방어력 +3" },
  { name: "마법저항의", tier: "good", effect: "마법 방어력 +3" },
  { name: "수호의", tier: "good", effect: "물리 방어력 +2, 마법 방어력 +2" },
  { name: "균형잡힌", tier: "good", effect: "물리 방어력 +1, 마법 방어력 +1" },
  { name: "요새의", tier: "good", effect: "물리 방어력 +3, 마법 방어력 +1" },
  { name: "현자의", tier: "good", effect: "마법 방어력 +3, 이동 수정 +1" },
  { name: "날렵한", tier: "good", effect: "물리 방어력 +1, 이동 수정 +2" },
  { name: "가벼운", tier: "good", effect: "중량 -1, 이동 수정 +1" },
  { name: "불굴의", tier: "good", effect: "물리 방어력 +2, 마법 방어력 +2, 중량 -1" },
  { name: "철벽의", tier: "good", effect: "물리 방어력 +4, 중량 +1" },
  { name: "신성한", tier: "good", effect: "마법 방어력 +4, 중량 +1" },
  { name: "전설적인", tier: "good", effect: "물리 방어력 +3, 마법 방어력 +3, 이동 수정 +1" },
  { name: "신화적인", tier: "good", effect: "물리 방어력 +4, 마법 방어력 +4, 중량 -1" },
  // ⬜ 보통
  { name: "묵직한", tier: "normal", effect: "물리 방어력 +3, 중량 +1, 이동 수정 -1" },
  { name: "거대한", tier: "normal", effect: "마법 방어력 +3, 중량 +1, 이동 수정 -1" },
  { name: "투박한", tier: "normal", effect: "물리 방어력 +2, 이동 수정 -1" },
  // 🟥 나쁨
  { name: "낡은", tier: "bad", effect: "물리 방어력 -1" },
  { name: "녹슨", tier: "bad", effect: "물리 방어력 -2" },
  { name: "해진", tier: "bad", effect: "마법 방어력 -1" },
  { name: "허술한", tier: "bad", effect: "물리 방어력 -1, 마법 방어력 -1" },
  { name: "부서진", tier: "bad", effect: "물리 방어력 -2, 마법 방어력 -1" },
  { name: "무른", tier: "bad", effect: "물리 방어력 -2, 마법 방어력 -2" },
  { name: "답답한", tier: "bad", effect: "이동 수정 -1, 중량 +1" },
  { name: "굼뜬", tier: "bad", effect: "이동 수정 -1, 중량 +2" },
];

// 추첨 비율 (좋음 30 / 보통 30 / 나쁨 40)
const TIER_ROLL: { tier: ForgeTier; weight: number }[] = [
  { tier: "good", weight: 30 },
  { tier: "normal", weight: 30 },
  { tier: "bad", weight: 40 },
];

export const TIER_LABEL: Record<ForgeTier, string> = { good: "좋음", normal: "보통", bad: "나쁨" };

const ALL_PREFIX_NAMES = new Set([...WEAPON_PREFIXES, ...ARMOR_PREFIXES].map((p) => p.name));

export const WEAPON_HINTS = [
  "검", "도", "창", "활", "단검", "도끼", "메이스", "해머", "완드",
  "스태프", "지팡이", "소드", "블레이드", "보우", "랜스", "액스",
  "너클", "클로", "대거", "카타르", "슈리켄", "윕", "채찍", "스피어",
  "파이크", "핼버드", "카타나", "플레일", "픽", "훅",
];
export const ARMOR_HINTS = [
  "갑옷", "방패", "투구", "사슬", "로브", "망토", "장갑", "부츠", "신발",
  "흉갑", "판금", "가죽", "메일", "실드", "견갑", "각반", "방어구", "갑주",
  "아머", "헬름", "플레이트", "재킷", "슈트", "모자", "햇", "버클러", "서클릿",
];

// 이름+효과로 무기/방어구 판별. 방어구를 먼저 검사(겹침 방지).
// 힌트에 없는 이름이라도 제작 장비("Lv3 장검 · 한손" 효과문)는 스탯으로 판별한다.
export function detectForgeSlot(nameAndEffect: string): ForgeSlot | null {
  if (ARMOR_HINTS.some((h) => nameAndEffect.includes(h))) return "armor";
  if (WEAPON_HINTS.some((h) => nameAndEffect.includes(h))) return "weapon";
  if (/Lv\d+/.test(nameAndEffect)) {
    if (nameAndEffect.includes("물리 방어력") || nameAndEffect.includes("마법 방어력")) return "armor";
    if (nameAndEffect.includes("공격력")) return "weapon";
  }
  return null;
}

export function rollPrefix(slot: ForgeSlot): ForgePrefix {
  const pool = slot === "armor" ? ARMOR_PREFIXES : WEAPON_PREFIXES;
  const total = TIER_ROLL.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  let tier: ForgeTier = "bad";
  for (const t of TIER_ROLL) {
    roll -= t.weight;
    if (roll <= 0) {
      tier = t.tier;
      break;
    }
  }
  const tierPool = pool.filter((p) => p.tier === tier);
  return tierPool[Math.floor(Math.random() * tierPool.length)];
}

// 이름 앞 수식어를 떼어 기본 이름 복원 (앞 단어가 알려진 수식어일 때만).
export function stripPrefix(name: string): string {
  const t = name.trim();
  const first = t.split(/\s+/)[0];
  if (ALL_PREFIX_NAMES.has(first) && t.length > first.length) return t.slice(first.length).trim();
  return t;
}

// 효과 텍스트에서 기존 "수식어(...)" 줄 제거.
export function stripPrefixEffect(effect: string | null | undefined): string {
  if (!effect) return "";
  return effect
    .split("\n")
    .filter((l) => !/^\s*수식어\(/.test(l))
    .join("\n")
    .trim();
}

// ── 강화 재료 티어 ────────────────────────────────────────────────────────────
// 장비 레벨 4칸마다 한 단계 위 재료를 쓰고, 소모 개수는 티어 안에서 1~4로 다시 센다.
//   Lv1~4  강철 파편 1·2·3·4    Lv5~8  강철 조각 1·2·3·4    Lv9~  강철 덩어리 1·2·…
// 합성소에서 아래 티어 3개 → 위 티어 1개라, 한 티어 위는 파편 환산 3배다.
export const STEEL_FRAGMENT = "강철 파편";
export const STEEL_PIECE = "강철 조각";
export const STEEL_INGOT = "강철 덩어리";
export const STEEL_TIERS = [STEEL_FRAGMENT, STEEL_PIECE, STEEL_INGOT] as const;
export const STEEL_SYNTH_COST = 3;
const STEEL_TIER_SPAN = 4;

export function enhanceMaterialFor(level: number): { name: string; qty: number } {
  const tier = Math.min(STEEL_TIERS.length - 1, Math.floor((level - 1) / STEEL_TIER_SPAN));
  return { name: STEEL_TIERS[tier], qty: level - tier * STEEL_TIER_SPAN };
}

// 합성 단계: 아래 재료 3개 → 위 재료 1개. 최상위(덩어리)는 더 올라갈 곳이 없다.
export const STEEL_SYNTHESIS = STEEL_TIERS.slice(0, -1).map((from, i) => ({
  from,
  to: STEEL_TIERS[i + 1],
  cost: STEEL_SYNTH_COST,
}));
