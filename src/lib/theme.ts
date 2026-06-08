// 테마(라이트/다크) + 강조색(커스텀) 설정

export const THEME_COOKIE = "theme";
export const ACCENT_COOKIE = "accent";

export type ThemeMode = "light" | "dark";

export const DEFAULT_THEME: ThemeMode = "light";
export const DEFAULT_ACCENT = "#6b6ff0";

export const ACCENT_PRESETS: { key: string; color: string; label: string }[] = [
  { key: "indigo", color: "#6b6ff0", label: "인디고" },
  { key: "violet", color: "#8b5cf6", label: "바이올렛" },
  { key: "rose", color: "#f43f5e", label: "로즈" },
  { key: "amber", color: "#f59e0b", label: "앰버" },
  { key: "emerald", color: "#10b981", label: "에메랄드" },
  { key: "sky", color: "#0ea5e9", label: "스카이" },
  { key: "teal", color: "#14b8a6", label: "틸" },
  { key: "fuchsia", color: "#d946ef", label: "푸시아" },
];

export function isThemeMode(v: string | undefined): v is ThemeMode {
  return v === "light" || v === "dark";
}

// "#rrggbb" 형식 검증 (XSS/주입 방지)
export function isHexColor(v: string | undefined): v is string {
  return !!v && /^#[0-9a-fA-F]{6}$/.test(v);
}
