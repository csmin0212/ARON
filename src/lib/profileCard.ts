// 프로필 카드 스킨 카탈로그 — 스튜디오(클라)와 저장 액션(서버)이 공유.
// 실제 렌더링 스타일은 components/ProfileCard.tsx 의 buildSkin 에 있고,
// 여기서는 키/라벨/스와치 + 획득 방식(무료·구매·보상)만 정의한다 (React 비의존).

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
  "cbt",
] as const;

export type ProfileCardStyle = (typeof PROFILE_CARD_STYLES)[number];

export const DEFAULT_CARD_STYLE: ProfileCardStyle = "basic";

// 스킨 구매가 (기본·보상 제외 전부 동일)
export const CARD_SKIN_PRICE = 8000;

export type CardAcquire = "free" | "purchase" | "reward";

export interface CardStyleMeta {
  key: ProfileCardStyle;
  label: string;
  tagline: string;
  acquire: CardAcquire; // free=기본제공 / purchase=골드구매 / reward=보상전용
  price: number; // 구매가 (purchase 만 >0)
  /** 강조색(profileColor)을 카드 색으로 사용하는지 */
  usesAccent: boolean;
  /** 피커 썸네일용 CSS background (accent 를 --c 로 참조 가능) */
  swatch: string;
  /** 썸네일 위 글자색 */
  swatchInk: string;
}

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
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
    usesAccent: false,
    swatch:
      "linear-gradient(115deg, #f9a8d4, #a5b4fc 30%, #67e8f9 55%, #86efac 75%, #fde68a)",
    swatchInk: "#20233a",
  },
  {
    key: "sakura",
    label: "사쿠라",
    tagline: "포근한 벚꽃 · 파스텔",
    acquire: "purchase",
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
    usesAccent: false,
    swatch: "linear-gradient(150deg, #ffd9a8, #ff9a8b 45%, #d16ba5)",
    swatchInk: "#5a2340",
  },
  {
    key: "emerald",
    label: "에메랄드",
    tagline: "맑은 비취빛 · 프레시",
    acquire: "purchase",
    price: CARD_SKIN_PRICE,
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
    price: CARD_SKIN_PRICE,
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 100% 0%, #f0c96e33, transparent 55%), linear-gradient(150deg, #3b2170, #241146)",
    swatchInk: "#f0e6c9",
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

export const CARD_STYLE_MAP: Record<ProfileCardStyle, CardStyleMeta> =
  Object.fromEntries(CARD_STYLES.map((s) => [s.key, s])) as Record<
    ProfileCardStyle,
    CardStyleMeta
  >;

export function normalizeCardStyle(
  value: string | null | undefined,
): ProfileCardStyle {
  return PROFILE_CARD_STYLES.includes(value as ProfileCardStyle)
    ? (value as ProfileCardStyle)
    : DEFAULT_CARD_STYLE;
}

// ── 소유(해금) 판정 ──

// 저장된 보유 스킨 JSON → 유효 키 배열
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

// 무료(기본) 스킨은 항상 보유로 취급.
export function ownsSkin(key: string, owned: readonly string[]): boolean {
  const meta = CARD_STYLE_MAP[key as ProfileCardStyle];
  if (!meta) return false;
  if (meta.acquire === "free") return true;
  return owned.includes(key);
}
