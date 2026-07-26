// 프로필 카드 스킨 카탈로그 — 스튜디오(클라)와 저장 액션(서버)이 공유.
// 실제 렌더링 스타일은 components/ProfileCard.tsx 의 buildSkin 에 있고,
// 여기서는 키/라벨/스와치 + 획득 방식(무료·구매·보상·해금)만 정의한다 (React 비의존).

import { rankAtLeast } from "@/lib/adventurerRank";

export const PROFILE_CARD_STYLES = [
  "basic",
  "aurora",
  "obsidian",
  "holo",
  "sakura",
  "cyber",
  "parchment",
  "midnight",
  "sunset",
  "emerald",
  "royal",
  "bronze",
  "silver",
  "gold",
  "sovereign",
  "angler",
  "botanist",
  "miner",
  "chef",
  "smith",
  "alchemist",
  "cbt",
] as const;

export type ProfileCardStyle = (typeof PROFILE_CARD_STYLES)[number];

export const DEFAULT_CARD_STYLE: ProfileCardStyle = "basic";

// 스킨 구매가 (기본·보상·해금 제외 전부 동일)
export const CARD_SKIN_PRICE = 8000;

export type CardAcquire = "free" | "purchase" | "reward" | "unlock";

// 해금 생활스킬 키 (lifeState 기준)
export type LifeSkillKey = "fishing" | "plant" | "mining" | "cooking" | "smithing" | "alchemy";

export interface SkinUnlock {
  kind: "rank" | "life";
  rankMin?: string; // kind=rank: "C" | "B" | "A" | "S"
  skill?: LifeSkillKey; // kind=life
  level?: number; // kind=life
  label: string; // 잠금 표시용 짧은 조건 (예: "모험가 C", "낚시 Lv.30")
}

export interface CardStyleMeta {
  key: ProfileCardStyle;
  label: string;
  tagline: string;
  acquire: CardAcquire; // free=기본 / purchase=구매 / reward=보상전용 / unlock=조건해금
  price: number; // 구매가 (purchase 만 >0)
  unlock?: SkinUnlock; // acquire=unlock 조건
  /** 강조색(profileColor)을 카드 색으로 사용하는지 */
  usesAccent: boolean;
  /** 피커 썸네일용 CSS background (accent 를 --c 로 참조 가능) */
  swatch: string;
  /** 썸네일 위 글자색 */
  swatchInk: string;
}

const P = CARD_SKIN_PRICE;

export const CARD_STYLES: CardStyleMeta[] = [
  {
    key: "basic",
    label: "기본",
    tagline: "깔끔한 화이트 · 기본 제공",
    acquire: "free",
    price: 0,
    usesAccent: true,
    swatch:
      "linear-gradient(180deg, #ffffff, #f4f6fb), radial-gradient(120% 120% at 15% 0%, color-mix(in srgb, var(--c) 14%, transparent), transparent 60%)",
    swatchInk: "#2a2f3d",
  },
  {
    key: "aurora",
    label: "오로라",
    tagline: "은은한 유리질 · 강조색 반영",
    acquire: "purchase",
    price: P,
    usesAccent: true,
    swatch:
      "radial-gradient(120% 120% at 15% 0%, color-mix(in srgb, var(--c) 45%, transparent), transparent 60%), radial-gradient(120% 120% at 100% 100%, #22d3ee55, transparent 55%), linear-gradient(135deg, #eef2ff, #ffffff)",
    swatchInk: "#1e2233",
  },
  {
    key: "obsidian",
    label: "옵시디언",
    tagline: "프리미엄 다크 · 골드 라인",
    acquire: "purchase",
    price: P,
    usesAccent: true,
    swatch:
      "radial-gradient(130% 130% at 100% 0%, color-mix(in srgb, var(--c) 40%, transparent), transparent 55%), linear-gradient(150deg, #14161f, #0b0c11)",
    swatchInk: "#f2e6c9",
  },
  {
    key: "holo",
    label: "홀로그램",
    tagline: "무지갯빛 포일 · 반짝임",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch: "linear-gradient(115deg, #f9a8d4, #a5b4fc 30%, #67e8f9 55%, #86efac 75%, #fde68a)",
    swatchInk: "#20233a",
  },
  {
    key: "sakura",
    label: "사쿠라",
    tagline: "포근한 벚꽃 · 파스텔",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 0% 0%, #ffe0ec, transparent 60%), linear-gradient(140deg, #fff1f6, #fde4ec 60%, #f7d6e6)",
    swatchInk: "#7a2e4e",
  },
  {
    key: "cyber",
    label: "사이버",
    tagline: "네온 그리드 · 강조색 발광",
    acquire: "purchase",
    price: P,
    usesAccent: true,
    swatch:
      "linear-gradient(180deg, #0a1330, #0a0f24), radial-gradient(100% 80% at 50% 120%, color-mix(in srgb, var(--c) 60%, transparent), transparent 60%)",
    swatchInk: "#c8f5ff",
  },
  {
    key: "parchment",
    label: "양피지",
    tagline: "판타지 두루마리 · 고풍",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 20% 10%, #fbf1d9, transparent 60%), linear-gradient(150deg, #f3e4c3, #e8d3a6)",
    swatchInk: "#5a4321",
  },
  {
    key: "midnight",
    label: "미드나잇",
    tagline: "심연의 별하늘 · 딥블루",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 100% at 80% 0%, #4c5bd455, transparent 55%), linear-gradient(160deg, #131a33, #0a0e1f)",
    swatchInk: "#c6cffb",
  },
  {
    key: "sunset",
    label: "선셋",
    tagline: "노을빛 그라데이션 · 웜톤",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch: "linear-gradient(150deg, #ffd9a8, #ff9a8b 45%, #d16ba5)",
    swatchInk: "#5a2340",
  },
  {
    key: "emerald",
    label: "에메랄드",
    tagline: "맑은 비취빛 · 프레시",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 10% 0%, #d1fae5, transparent 60%), linear-gradient(150deg, #ecfdf5, #d1fae5 60%, #a7f3d0)",
    swatchInk: "#0f3d2e",
  },
  {
    key: "royal",
    label: "로열",
    tagline: "고귀한 보랏빛 · 골드",
    acquire: "purchase",
    price: P,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 100% 0%, #f0c96e33, transparent 55%), linear-gradient(150deg, #3b2170, #241146)",
    swatchInk: "#f0e6c9",
  },
  // ── 모험가 등급 해금 (동/은/금/제왕) ──
  {
    key: "bronze",
    label: "동패",
    tagline: "모험가 C 훈장 · 브론즈",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "rank", rankMin: "C", label: "모험가 C" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 85% 0%, rgba(217,160,106,0.4), transparent 55%), linear-gradient(150deg, #5a3a22, #331e12)",
    swatchInk: "#f0d8bf",
  },
  {
    key: "silver",
    label: "은패",
    tagline: "모험가 B 훈장 · 실버",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "rank", rankMin: "B", label: "모험가 B" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 85% 0%, rgba(200,210,225,0.45), transparent 55%), linear-gradient(150deg, #3a4150, #23272f)",
    swatchInk: "#eef2f8",
  },
  {
    key: "gold",
    label: "금패",
    tagline: "모험가 A 훈장 · 골드",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "rank", rankMin: "A", label: "모험가 A" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 85% 0%, rgba(240,201,110,0.45), transparent 55%), linear-gradient(150deg, #4a3a12, #2a2008)",
    swatchInk: "#fdf0cf",
  },
  {
    key: "sovereign",
    label: "전설의 모험가",
    tagline: "모험가 S 한정 · 크림슨 프레스티지",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "rank", rankMin: "S", label: "모험가 S" },
    usesAccent: false,
    swatch:
      "radial-gradient(130% 120% at 100% 0%, rgba(244,63,94,0.42), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(120,20,40,0.5), transparent 55%), linear-gradient(150deg, #2a0f18, #14060b)",
    swatchInk: "#fdd9de",
  },
  // ── 생활스킬 레벨 해금 ──
  {
    key: "angler",
    label: "낚시꾼",
    tagline: "낚시 Lv.30 · 바다와 물고기",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "fishing", level: 30, label: "낚시 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 10% 0%, #bae6fd, transparent 60%), linear-gradient(160deg, #e0f2fe, #bae6fd 55%, #7dd3fc)",
    swatchInk: "#0c4a6e",
  },
  {
    key: "botanist",
    label: "채집가",
    tagline: "채집 Lv.30 · 숲과 새싹",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "plant", level: 30, label: "채집 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 10% 0%, #d9f99d, transparent 60%), linear-gradient(155deg, #f0fdf4, #dcfce7 55%, #bbf7d0)",
    swatchInk: "#14532d",
  },
  {
    key: "miner",
    label: "광부",
    tagline: "채광 Lv.30 · 광맥과 보석",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "mining", level: 30, label: "채광 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 80% 100%, rgba(245,158,11,0.32), transparent 55%), linear-gradient(155deg, #2b2f3a, #171a22)",
    swatchInk: "#e7ebf2",
  },
  {
    key: "chef",
    label: "요리사",
    tagline: "요리 Lv.30 · 따뜻한 주방",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "cooking", level: 30, label: "요리 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 0% 0%, #fed7aa, transparent 60%), linear-gradient(150deg, #fff7ed, #ffedd5 55%, #fed7aa)",
    swatchInk: "#7c2d12",
  },
  {
    key: "smith",
    label: "대장장이",
    tagline: "제작 Lv.30 · 화로와 강철",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "smithing", level: 30, label: "제작 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 50% 120%, rgba(249,115,22,0.35), transparent 55%), linear-gradient(160deg, #2a2d34, #16181d)",
    swatchInk: "#eceff4",
  },
  {
    key: "alchemist",
    label: "연금술사",
    tagline: "연금술 Lv.30 · 신비한 물약",
    acquire: "unlock",
    price: 0,
    unlock: { kind: "life", skill: "alchemy", level: 30, label: "연금술 Lv.30" },
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 100% 0%, rgba(45,212,191,0.3), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(168,85,247,0.32), transparent 55%), linear-gradient(150deg, #241a3a, #120e22)",
    swatchInk: "#f0e6ff",
  },
  {
    key: "cbt",
    label: "CBT",
    tagline: "비공개 테스터 한정 · 프레스티지",
    acquire: "reward",
    price: 0,
    usesAccent: false,
    swatch:
      "radial-gradient(130% 120% at 100% 0%, #f0c96e40, transparent 55%), linear-gradient(150deg, #241a44, #0e0b1e 72%)",
    swatchInk: "#f6e6b8",
  },
];

export const CARD_STYLE_MAP: Record<ProfileCardStyle, CardStyleMeta> = Object.fromEntries(
  CARD_STYLES.map((s) => [s.key, s]),
) as Record<ProfileCardStyle, CardStyleMeta>;

export function normalizeCardStyle(value: string | null | undefined): ProfileCardStyle {
  return PROFILE_CARD_STYLES.includes(value as ProfileCardStyle)
    ? (value as ProfileCardStyle)
    : DEFAULT_CARD_STYLE;
}

// ── 소유(해금) 판정 ──

export function parseOwnedSkins(json: string | null | undefined): ProfileCardStyle[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: ProfileCardStyle[] = [];
    for (const v of raw) {
      if (typeof v !== "string" || !PROFILE_CARD_STYLES.includes(v as ProfileCardStyle) || seen.has(v))
        continue;
      seen.add(v);
      out.push(v as ProfileCardStyle);
    }
    return out;
  } catch {
    return [];
  }
}

// 조건 해금 판정에 필요한 상태
export interface UnlockContext {
  rank: string | null; // 모험가 등급
  life: Record<LifeSkillKey, number>; // 생활스킬 레벨
}

export function isSkinUnlocked(meta: CardStyleMeta, ctx: UnlockContext): boolean {
  if (meta.acquire !== "unlock" || !meta.unlock) return false;
  if (meta.unlock.kind === "rank") return rankAtLeast(ctx.rank, meta.unlock.rankMin ?? "S");
  const lvl = ctx.life[meta.unlock.skill ?? "fishing"] ?? 1;
  return lvl >= (meta.unlock.level ?? Number.MAX_SAFE_INTEGER);
}

// 저장된 보유(구매·보상) + 조건 해금을 합친 최종 보유 키 목록.
export function resolveOwnedSkins(
  ownedJson: string | null | undefined,
  ctx: UnlockContext,
): ProfileCardStyle[] {
  const set = new Set<string>(parseOwnedSkins(ownedJson));
  for (const meta of CARD_STYLES) {
    if (meta.acquire === "unlock" && isSkinUnlocked(meta, ctx)) set.add(meta.key);
  }
  return [...set] as ProfileCardStyle[];
}

// 무료(기본) 스킨은 항상 보유로 취급. owned 는 resolveOwnedSkins 결과(해금 포함) 를 넣는다.
export function ownsSkin(key: string, owned: readonly string[]): boolean {
  const meta = CARD_STYLE_MAP[key as ProfileCardStyle];
  if (!meta) return false;
  if (meta.acquire === "free") return true;
  return owned.includes(key);
}
