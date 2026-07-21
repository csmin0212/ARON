// 프로필 카드 스킨 카탈로그 — 스튜디오(클라)와 저장 액션(서버)이 공유.
// 실제 렌더링 스타일은 components/ProfileCard.tsx 의 SKINS 에 있고,
// 여기서는 키/라벨/피커용 스와치만 정의한다 (React 비의존).

export const PROFILE_CARD_STYLES = [
  "aurora",
  "obsidian",
  "holo",
  "sakura",
  "cyber",
  "parchment",
] as const;

export type ProfileCardStyle = (typeof PROFILE_CARD_STYLES)[number];

export const DEFAULT_CARD_STYLE: ProfileCardStyle = "aurora";

export interface CardStyleMeta {
  key: ProfileCardStyle;
  label: string;
  tagline: string;
  /** 강조색(profileColor)을 카드 색으로 사용하는지 — 피커 설명·미리보기에 활용 */
  usesAccent: boolean;
  /** 피커 썸네일용 CSS background (accent 를 --c 로 참조 가능) */
  swatch: string;
  /** 썸네일 위 글자색 */
  swatchInk: string;
}

export const CARD_STYLES: CardStyleMeta[] = [
  {
    key: "aurora",
    label: "오로라",
    tagline: "은은한 유리질 · 강조색 반영",
    usesAccent: true,
    swatch:
      "radial-gradient(120% 120% at 15% 0%, color-mix(in srgb, var(--c) 45%, transparent), transparent 60%), radial-gradient(120% 120% at 100% 100%, #22d3ee55, transparent 55%), linear-gradient(135deg, #eef2ff, #ffffff)",
    swatchInk: "#1e2233",
  },
  {
    key: "obsidian",
    label: "옵시디언",
    tagline: "프리미엄 다크 · 골드 라인",
    usesAccent: true,
    swatch:
      "radial-gradient(130% 130% at 100% 0%, color-mix(in srgb, var(--c) 40%, transparent), transparent 55%), linear-gradient(150deg, #14161f, #0b0c11)",
    swatchInk: "#f2e6c9",
  },
  {
    key: "holo",
    label: "홀로그램",
    tagline: "무지갯빛 포일 · 반짝임",
    usesAccent: false,
    swatch:
      "linear-gradient(115deg, #f9a8d4, #a5b4fc 30%, #67e8f9 55%, #86efac 75%, #fde68a)",
    swatchInk: "#20233a",
  },
  {
    key: "sakura",
    label: "사쿠라",
    tagline: "포근한 벚꽃 · 파스텔",
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 0% 0%, #ffe0ec, transparent 60%), linear-gradient(140deg, #fff1f6, #fde4ec 60%, #f7d6e6)",
    swatchInk: "#7a2e4e",
  },
  {
    key: "cyber",
    label: "사이버",
    tagline: "네온 그리드 · 강조색 발광",
    usesAccent: true,
    swatch:
      "linear-gradient(180deg, #0a1330, #0a0f24), radial-gradient(100% 80% at 50% 120%, color-mix(in srgb, var(--c) 60%, transparent), transparent 60%)",
    swatchInk: "#c8f5ff",
  },
  {
    key: "parchment",
    label: "양피지",
    tagline: "판타지 두루마리 · 고풍",
    usesAccent: false,
    swatch:
      "radial-gradient(120% 120% at 20% 10%, #fbf1d9, transparent 60%), linear-gradient(150deg, #f3e4c3, #e8d3a6)",
    swatchInk: "#5a4321",
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
