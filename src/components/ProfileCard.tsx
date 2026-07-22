import type { CSSProperties } from "react";
import Avatar from "./Avatar";
import { isHexColor } from "@/lib/theme";
import {
  DEFAULT_CARD_STYLE,
  normalizeCardStyle,
  type ProfileCardStyle,
} from "@/lib/profileCard";
import ProfileContent, { type ContentStyle } from "./ProfileContent";
import CardScene, { type SceneKey } from "./CardScene";
import type { ResolvedWidget } from "@/lib/profileWidgets";
import type { ProfileIdentity } from "@/lib/profileValues";

interface SkinConfig {
  rootStyle: CSSProperties;
  ink: string;
  sub: string;
  accent: string; // 강조 텍스트/바 색
  panelStyle: CSSProperties;
  chipStyle: CSSProperties;
  dividerColor: string;
  rankStyle: CSSProperties;
  rankLabel?: string;
  barTrack: string;
  brand: string;
  serif?: boolean;
  decoration?: "holo" | "cyber" | "parchment" | "sakura" | "midnight" | "cbt" | null;
  scene?: SceneKey; // 테마 일러스트(인라인 SVG) — components/CardScene.tsx
  sceneTone?: string; // crest 훈장 색조
  glowStyle?: CSSProperties; // 아바타 링 등 강조 링 색
}

const SERIF = "Georgia, 'Times New Roman', serif";

function buildSkin(style: ProfileCardStyle, accentRaw: string | null | undefined): SkinConfig {
  const c = isHexColor(accentRaw ?? undefined) ? (accentRaw as string) : "#6b6ff0";
  const withVar = (extra: CSSProperties = {}): CSSProperties =>
    ({ "--c": c, ...extra } as CSSProperties);

  switch (style) {
    case "obsidian":
      return {
        rootStyle: withVar({
          background:
            "radial-gradient(130% 120% at 100% -10%, color-mix(in srgb, var(--c) 34%, transparent), transparent 55%), linear-gradient(155deg, #171922, #0b0c11 72%)",
          border: "1px solid rgba(233,200,120,0.22)",
          boxShadow:
            "0 24px 60px -24px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
        }),
        ink: "#f4f6fb",
        sub: "#9aa1b5",
        accent: "#ecc978",
        panelStyle: {
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.09)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.07)",
          color: "#cdd3e0",
          border: "1px solid rgba(255,255,255,0.08)",
        },
        dividerColor: "rgba(233,200,120,0.2)",
        rankStyle: {
          background: "linear-gradient(135deg, #f2d68b, #b8912f)",
          color: "#2a2410",
          boxShadow: "0 6px 18px -6px rgba(233,200,120,0.5)",
        },
        barTrack: "rgba(255,255,255,0.08)",
        brand: "#727a90",
        glowStyle: { boxShadow: "0 0 0 3px rgba(233,200,120,0.25)" },
      };

    case "holo":
      return {
        rootStyle: {
          background:
            "linear-gradient(115deg, #fbcfe8, #c7d2fe 28%, #a5f3fc 52%, #bbf7d0 72%, #fef3c7)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 22px 55px -24px rgba(124,58,237,0.45)",
        },
        ink: "#23263c",
        sub: "#585d7e",
        accent: "#7c3aed",
        panelStyle: {
          background: "rgba(255,255,255,0.5)",
          border: "1px solid rgba(255,255,255,0.7)",
          backdropFilter: "blur(6px)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.58)",
          color: "#3a3e5c",
          border: "1px solid rgba(255,255,255,0.6)",
        },
        dividerColor: "rgba(60,50,110,0.14)",
        rankStyle: {
          background: "linear-gradient(135deg, #f472b6, #8b5cf6 55%, #22d3ee)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(139,92,246,0.6)",
        },
        barTrack: "rgba(60,50,110,0.12)",
        brand: "#5a5f80",
        decoration: "holo",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.75)" },
      };

    case "sakura":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 0% 0%, #ffdfea, transparent 60%), radial-gradient(120% 120% at 100% 100%, #ffe9c9, transparent 55%), linear-gradient(150deg, #fff2f7, #fde3ee 60%, #f8d6e6)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 20px 50px -26px rgba(229,88,142,0.45)",
        },
        ink: "#6d2645",
        sub: "#a05b77",
        accent: "#e5588e",
        panelStyle: {
          background: "rgba(255,255,255,0.6)",
          border: "1px solid rgba(255,255,255,0.75)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.66)",
          color: "#8a3d5f",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(160,91,119,0.2)",
        rankStyle: {
          background: "linear-gradient(135deg, #fb7ba8, #e5588e)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(229,88,142,0.5)",
        },
        barTrack: "rgba(160,91,119,0.16)",
        brand: "#b3799a",
        decoration: "sakura",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.8)" },
      };

    case "cyber":
      return {
        rootStyle: withVar({
          background:
            "repeating-linear-gradient(90deg, color-mix(in srgb, var(--c) 12%, transparent) 0 1px, transparent 1px 40px), repeating-linear-gradient(0deg, color-mix(in srgb, var(--c) 12%, transparent) 0 1px, transparent 1px 40px), radial-gradient(90% 70% at 50% 120%, color-mix(in srgb, var(--c) 55%, transparent), transparent 62%), linear-gradient(180deg, #0a1230, #080c1f)",
          border: "1px solid color-mix(in srgb, var(--c) 45%, transparent)",
          boxShadow:
            "0 24px 60px -24px rgba(0,0,0,0.75), inset 0 0 40px -20px var(--c)",
        }),
        ink: "#e8f7ff",
        sub: "#828ec4",
        accent: c,
        panelStyle: {
          background: "rgba(120,160,255,0.06)",
          border: "1px solid color-mix(in srgb, var(--c) 35%, transparent)",
        },
        chipStyle: {
          background: "rgba(120,160,255,0.1)",
          color: "#bcc8ff",
          border: "1px solid color-mix(in srgb, var(--c) 30%, transparent)",
        },
        dividerColor: "color-mix(in srgb, var(--c) 30%, transparent)",
        rankStyle: withVar({
          background: "color-mix(in srgb, var(--c) 16%, transparent)",
          color: c,
          border: "1px solid color-mix(in srgb, var(--c) 60%, transparent)",
          boxShadow: "0 0 18px -4px var(--c), inset 0 0 12px -6px var(--c)",
        }),
        barTrack: "rgba(120,160,255,0.12)",
        brand: "color-mix(in srgb, var(--c) 60%, #8892c8)",
        decoration: "cyber",
        glowStyle: withVar({ boxShadow: "0 0 0 2px var(--c), 0 0 18px -2px var(--c)" }),
      };

    case "parchment":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 18% 8%, #fbf1d9, transparent 60%), linear-gradient(150deg, #f4e6c6, #e7d3a4)",
          border: "2px solid rgba(150,110,50,0.4)",
          boxShadow:
            "0 20px 50px -26px rgba(90,67,33,0.5), inset 0 0 0 1px rgba(150,110,50,0.25)",
        },
        ink: "#4a3312",
        sub: "#7a5f33",
        accent: "#9a6b1e",
        panelStyle: {
          background: "rgba(255,250,235,0.55)",
          border: "1px solid rgba(120,90,40,0.22)",
        },
        chipStyle: {
          background: "rgba(120,90,40,0.12)",
          color: "#6a4e22",
          border: "1px solid rgba(120,90,40,0.2)",
        },
        dividerColor: "rgba(120,90,40,0.28)",
        rankStyle: {
          background: "linear-gradient(135deg, #cba24e, #8a6320)",
          color: "#fff8e6",
          boxShadow: "0 6px 16px -6px rgba(120,90,40,0.5)",
        },
        barTrack: "rgba(120,90,40,0.2)",
        brand: "#8a6e3e",
        serif: true,
        decoration: "parchment",
        glowStyle: { boxShadow: "0 0 0 3px rgba(203,162,78,0.45)" },
      };

    case "aurora":
      return {
        rootStyle: withVar({
          background:
            "radial-gradient(120% 140% at 12% -10%, color-mix(in srgb, var(--c) 40%, #fff), transparent 55%), radial-gradient(120% 120% at 108% 116%, rgba(34,211,238,0.28), transparent 55%), linear-gradient(140deg, #f4f6ff, #ffffff)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 20px 50px -26px color-mix(in srgb, var(--c) 45%, #64748b)",
        }),
        ink: "#1c2033",
        sub: "#5b6486",
        accent: "color-mix(in srgb, var(--c) 82%, #000)",
        panelStyle: {
          background: "rgba(255,255,255,0.62)",
          border: "1px solid rgba(255,255,255,0.75)",
          backdropFilter: "blur(6px)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.7)",
          color: "#46506f",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(30,40,80,0.1)",
        rankStyle: withVar({
          background:
            "linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 55%, #000))",
          color: "#fff",
          boxShadow: "0 6px 18px -6px color-mix(in srgb, var(--c) 60%, transparent)",
        }),
        barTrack: "rgba(30,40,80,0.1)",
        brand: "#8891ad",
        glowStyle: withVar({ boxShadow: "0 0 0 3px rgba(255,255,255,0.85)" }),
      };

    case "midnight":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 100% at 80% -10%, rgba(76,91,212,0.32), transparent 55%), linear-gradient(160deg, #131a33, #0a0e1f)",
          border: "1px solid rgba(120,140,255,0.22)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.7)",
        },
        ink: "#e8ecff",
        sub: "#8891bf",
        accent: "#8aa0ff",
        panelStyle: {
          background: "rgba(120,140,255,0.07)",
          border: "1px solid rgba(120,140,255,0.14)",
        },
        chipStyle: {
          background: "rgba(120,140,255,0.1)",
          color: "#c6cffb",
          border: "1px solid rgba(120,140,255,0.16)",
        },
        dividerColor: "rgba(120,140,255,0.18)",
        rankStyle: {
          background: "linear-gradient(135deg, #6d7cff, #3a45b0)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(109,124,255,0.6)",
        },
        barTrack: "rgba(120,140,255,0.14)",
        brand: "#6b74a8",
        decoration: "midnight",
        glowStyle: { boxShadow: "0 0 0 3px rgba(138,160,255,0.28)" },
      };

    case "sunset":
      return {
        rootStyle: {
          background: "linear-gradient(150deg, #ffd9a8, #ff9a8b 45%, #d16ba5)",
          border: "1px solid rgba(255,255,255,0.55)",
          boxShadow: "0 20px 50px -26px rgba(209,71,126,0.5)",
        },
        ink: "#5a2340",
        sub: "#8a4a5f",
        accent: "#c0356a",
        panelStyle: {
          background: "rgba(255,255,255,0.5)",
          border: "1px solid rgba(255,255,255,0.6)",
          backdropFilter: "blur(6px)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.55)",
          color: "#7a3350",
          border: "1px solid rgba(255,255,255,0.6)",
        },
        dividerColor: "rgba(90,35,64,0.18)",
        rankStyle: {
          background: "linear-gradient(135deg, #ff8f6b, #d1477e)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(209,71,126,0.55)",
        },
        barTrack: "rgba(90,35,64,0.16)",
        brand: "#9a5a6e",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.7)" },
      };

    case "emerald":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 10% 0%, #d1fae5, transparent 60%), linear-gradient(150deg, #ecfdf5, #d1fae5 60%, #a7f3d0)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "0 20px 50px -26px rgba(15,157,104,0.4)",
        },
        ink: "#0f3d2e",
        sub: "#4a7a63",
        accent: "#0e8f5f",
        panelStyle: {
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.62)",
          color: "#2f6a52",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(15,61,46,0.16)",
        rankStyle: {
          background: "linear-gradient(135deg, #34d399, #059669)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(5,150,105,0.5)",
        },
        barTrack: "rgba(15,61,46,0.14)",
        brand: "#6a9a86",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.8)" },
      };

    case "royal":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 100% 0%, rgba(240,201,110,0.16), transparent 55%), linear-gradient(150deg, #3b2170, #241146)",
          border: "1px solid rgba(233,200,120,0.28)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.6)",
        },
        ink: "#f3ecff",
        sub: "#b6a8d8",
        accent: "#e9c877",
        panelStyle: {
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(233,200,120,0.14)",
        },
        chipStyle: {
          background: "rgba(255,255,255,0.08)",
          color: "#ddd0f2",
          border: "1px solid rgba(233,200,120,0.16)",
        },
        dividerColor: "rgba(233,200,120,0.2)",
        rankStyle: {
          background: "linear-gradient(135deg, #f2d68b, #b8912f)",
          color: "#2a2410",
          boxShadow: "0 6px 18px -6px rgba(233,200,120,0.5)",
        },
        barTrack: "rgba(255,255,255,0.1)",
        brand: "#9a86c0",
        glowStyle: { boxShadow: "0 0 0 3px rgba(233,200,120,0.28)" },
      };

    case "cbt":
      return {
        rootStyle: {
          background:
            "radial-gradient(130% 120% at 100% -10%, rgba(240,201,110,0.28), transparent 55%), linear-gradient(150deg, #241a44, #0e0b1e 72%)",
          border: "1px solid rgba(244,213,138,0.32)",
          boxShadow:
            "0 26px 66px -24px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.06)",
        },
        ink: "#f6f0ff",
        sub: "#b3a8cf",
        accent: "#f4d58a",
        panelStyle: {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(244,213,138,0.18)",
        },
        chipStyle: {
          background: "rgba(244,213,138,0.12)",
          color: "#f0e0b6",
          border: "1px solid rgba(244,213,138,0.24)",
        },
        dividerColor: "rgba(244,213,138,0.22)",
        rankStyle: {
          background: "linear-gradient(135deg, #f7e2a0, #c99a3a)",
          color: "#2a2208",
          boxShadow: "0 6px 20px -6px rgba(244,213,138,0.55)",
        },
        barTrack: "rgba(244,213,138,0.14)",
        brand: "#8a7fb0",
        decoration: "cbt",
        glowStyle: { boxShadow: "0 0 0 3px rgba(244,213,138,0.3)" },
      };

    case "bronze":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 85% -10%, rgba(217,160,106,0.35), transparent 55%), linear-gradient(150deg, #5a3a22, #2c1a10)",
          border: "1px solid rgba(217,160,106,0.3)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.65)",
        },
        ink: "#f4e4d2",
        sub: "#c9a888",
        accent: "#e09a5c",
        panelStyle: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(217,160,106,0.18)" },
        chipStyle: {
          background: "rgba(217,160,106,0.12)",
          color: "#ecceac",
          border: "1px solid rgba(217,160,106,0.22)",
        },
        dividerColor: "rgba(217,160,106,0.24)",
        rankStyle: {
          background: "linear-gradient(135deg, #e2a86e, #8a5a2e)",
          color: "#2e1a0c",
          boxShadow: "0 6px 18px -6px rgba(217,160,106,0.55)",
        },
        rankLabel: "BRONZE",
        barTrack: "rgba(217,160,106,0.16)",
        brand: "#a37c58",
        scene: "crest",
        sceneTone: "#e2a86e",
        glowStyle: { boxShadow: "0 0 0 3px rgba(217,160,106,0.3)" },
      };

    case "silver":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 85% -10%, rgba(203,213,225,0.42), transparent 55%), linear-gradient(150deg, #3a4150, #21252d)",
          border: "1px solid rgba(203,213,225,0.3)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.6)",
        },
        ink: "#f4f7fb",
        sub: "#b3bccb",
        accent: "#dbe3ee",
        panelStyle: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(203,213,225,0.16)" },
        chipStyle: {
          background: "rgba(203,213,225,0.12)",
          color: "#dde4ee",
          border: "1px solid rgba(203,213,225,0.2)",
        },
        dividerColor: "rgba(203,213,225,0.22)",
        rankStyle: {
          background: "linear-gradient(135deg, #eef2f8, #94a3b8)",
          color: "#2a2f38",
          boxShadow: "0 6px 18px -6px rgba(203,213,225,0.5)",
        },
        rankLabel: "SILVER",
        barTrack: "rgba(203,213,225,0.16)",
        brand: "#9aa4b4",
        scene: "crest",
        sceneTone: "#dbe3ee",
        glowStyle: { boxShadow: "0 0 0 3px rgba(203,213,225,0.35)" },
      };

    case "gold":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 85% -10%, rgba(240,201,110,0.42), transparent 55%), linear-gradient(150deg, #4a3a12, #251c06)",
          border: "1px solid rgba(240,201,110,0.34)",
          boxShadow: "0 26px 64px -24px rgba(0,0,0,0.62)",
        },
        ink: "#fdf3d6",
        sub: "#d8c390",
        accent: "#f0c96e",
        panelStyle: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(240,201,110,0.18)" },
        chipStyle: {
          background: "rgba(240,201,110,0.12)",
          color: "#f3e2b0",
          border: "1px solid rgba(240,201,110,0.22)",
        },
        dividerColor: "rgba(240,201,110,0.24)",
        rankStyle: {
          background: "linear-gradient(135deg, #f7e2a0, #c99a3a)",
          color: "#2a2208",
          boxShadow: "0 6px 20px -6px rgba(240,201,110,0.6)",
        },
        rankLabel: "GOLD",
        barTrack: "rgba(240,201,110,0.16)",
        brand: "#b8a066",
        scene: "crest",
        sceneTone: "#f0c96e",
        glowStyle: { boxShadow: "0 0 0 3px rgba(240,201,110,0.34)" },
      };

    case "sovereign":
      // 전설의 모험가 (S) — 붉은 크림슨 + 골드 프레스티지
      return {
        rootStyle: {
          background:
            "radial-gradient(130% 120% at 100% -10%, rgba(244,63,94,0.4), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(120,20,40,0.5), transparent 55%), linear-gradient(150deg, #2a0f18, #14060b 72%)",
          border: "1px solid rgba(251,113,133,0.35)",
          boxShadow: "0 28px 70px -24px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.06)",
        },
        ink: "#fdeef0",
        sub: "#d69aa6",
        accent: "#fb7185",
        panelStyle: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(251,113,133,0.18)" },
        chipStyle: {
          background: "rgba(251,113,133,0.12)",
          color: "#f6c9d1",
          border: "1px solid rgba(251,113,133,0.24)",
        },
        dividerColor: "rgba(251,113,133,0.24)",
        rankStyle: {
          background: "linear-gradient(135deg, #f43f5e, #b91c3c 60%, #7f1d1d)",
          color: "#ffe9ec",
          boxShadow: "0 6px 22px -6px rgba(244,63,94,0.65)",
        },
        barTrack: "rgba(251,113,133,0.16)",
        brand: "#b3717e",
        scene: "legend",
        glowStyle: { boxShadow: "0 0 0 3px rgba(251,113,133,0.34)" },
      };

    case "angler":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 10% 0%, #bae6fd, transparent 60%), linear-gradient(160deg, #e0f2fe, #bae6fd 55%, #7dd3fc)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 20px 50px -26px rgba(2,132,199,0.45)",
        },
        ink: "#0c4a6e",
        sub: "#3f7398",
        accent: "#0284c7",
        panelStyle: { background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.65)" },
        chipStyle: {
          background: "rgba(255,255,255,0.6)",
          color: "#1e5f86",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(12,74,110,0.16)",
        rankStyle: {
          background: "linear-gradient(135deg, #38bdf8, #0369a1)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(3,105,161,0.5)",
        },
        barTrack: "rgba(12,74,110,0.14)",
        brand: "#5a8aa8",
        scene: "angler",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.75)" },
      };

    case "botanist":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 10% 0%, #d9f99d, transparent 60%), linear-gradient(155deg, #f0fdf4, #dcfce7 55%, #bbf7d0)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 20px 50px -26px rgba(22,163,74,0.4)",
        },
        ink: "#14532d",
        sub: "#4d7c54",
        accent: "#16a34a",
        panelStyle: { background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.65)" },
        chipStyle: {
          background: "rgba(255,255,255,0.6)",
          color: "#2f6a3f",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(20,83,45,0.16)",
        rankStyle: {
          background: "linear-gradient(135deg, #4ade80, #15803d)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(21,128,61,0.5)",
        },
        barTrack: "rgba(20,83,45,0.14)",
        brand: "#6a9a76",
        scene: "botanist",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.8)" },
      };

    case "miner":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 80% 100%, rgba(245,158,11,0.3), transparent 55%), linear-gradient(155deg, #2b2f3a, #171a22)",
          border: "1px solid rgba(245,158,11,0.24)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.65)",
        },
        ink: "#e7ebf2",
        sub: "#9aa4b4",
        accent: "#f59e0b",
        panelStyle: { background: "rgba(255,255,255,0.045)", border: "1px solid rgba(245,158,11,0.16)" },
        chipStyle: {
          background: "rgba(245,158,11,0.1)",
          color: "#f3d9a8",
          border: "1px solid rgba(245,158,11,0.18)",
        },
        dividerColor: "rgba(245,158,11,0.2)",
        rankStyle: {
          background: "linear-gradient(135deg, #fbbf24, #b45309)",
          color: "#2a1e08",
          boxShadow: "0 6px 18px -6px rgba(245,158,11,0.5)",
        },
        barTrack: "rgba(245,158,11,0.14)",
        brand: "#8892a0",
        scene: "miner",
        glowStyle: { boxShadow: "0 0 0 3px rgba(245,158,11,0.28)" },
      };

    case "chef":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 0% 0%, #fed7aa, transparent 60%), linear-gradient(150deg, #fff7ed, #ffedd5 55%, #fed7aa)",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 20px 50px -26px rgba(234,88,12,0.4)",
        },
        ink: "#7c2d12",
        sub: "#a86a4a",
        accent: "#ea580c",
        panelStyle: { background: "rgba(255,255,255,0.55)", border: "1px solid rgba(255,255,255,0.65)" },
        chipStyle: {
          background: "rgba(255,255,255,0.6)",
          color: "#9a4a24",
          border: "1px solid rgba(255,255,255,0.7)",
        },
        dividerColor: "rgba(124,45,18,0.16)",
        rankStyle: {
          background: "linear-gradient(135deg, #fb923c, #c2410c)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(194,65,12,0.5)",
        },
        barTrack: "rgba(124,45,18,0.14)",
        brand: "#a8785a",
        scene: "chef",
        glowStyle: { boxShadow: "0 0 0 3px rgba(255,255,255,0.78)" },
      };

    case "smith":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 50% 120%, rgba(249,115,22,0.32), transparent 55%), linear-gradient(160deg, #2a2d34, #16181d)",
          border: "1px solid rgba(249,115,22,0.24)",
          boxShadow: "0 24px 60px -24px rgba(0,0,0,0.65)",
        },
        ink: "#eceff4",
        sub: "#9aa1ad",
        accent: "#f97316",
        panelStyle: { background: "rgba(255,255,255,0.045)", border: "1px solid rgba(249,115,22,0.16)" },
        chipStyle: {
          background: "rgba(249,115,22,0.1)",
          color: "#f6cba8",
          border: "1px solid rgba(249,115,22,0.18)",
        },
        dividerColor: "rgba(249,115,22,0.2)",
        rankStyle: {
          background: "linear-gradient(135deg, #fb923c, #9a3412)",
          color: "#fff",
          boxShadow: "0 6px 18px -6px rgba(154,52,18,0.55)",
        },
        barTrack: "rgba(249,115,22,0.14)",
        brand: "#8a909c",
        scene: "smith",
        glowStyle: { boxShadow: "0 0 0 3px rgba(249,115,22,0.26)" },
      };

    case "alchemist":
      return {
        rootStyle: {
          background:
            "radial-gradient(120% 120% at 100% 0%, rgba(45,212,191,0.28), transparent 55%), radial-gradient(120% 120% at 0% 100%, rgba(168,85,247,0.3), transparent 55%), linear-gradient(150deg, #241a3a, #120e22)",
          border: "1px solid rgba(192,132,252,0.26)",
          boxShadow: "0 26px 64px -24px rgba(0,0,0,0.68)",
        },
        ink: "#f3ecff",
        sub: "#b0a8d0",
        accent: "#c084fc",
        panelStyle: { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(192,132,252,0.16)" },
        chipStyle: {
          background: "rgba(192,132,252,0.12)",
          color: "#e0d0f8",
          border: "1px solid rgba(192,132,252,0.2)",
        },
        dividerColor: "rgba(192,132,252,0.22)",
        rankStyle: {
          background: "linear-gradient(135deg, #5eead4, #7c3aed)",
          color: "#fff",
          boxShadow: "0 6px 20px -6px rgba(124,58,237,0.55)",
        },
        barTrack: "rgba(192,132,252,0.16)",
        brand: "#8a80b0",
        scene: "alchemist",
        glowStyle: { boxShadow: "0 0 0 3px rgba(192,132,252,0.3)" },
      };

    case "basic":
    default:
      return {
        rootStyle: withVar({
          background:
            "radial-gradient(120% 120% at 15% -10%, color-mix(in srgb, var(--c) 10%, #fff), transparent 60%), linear-gradient(180deg, #ffffff, #f6f7fb)",
          border: "1px solid #e9ebf2",
          boxShadow: "0 14px 36px -24px rgba(40,50,80,0.4)",
        }),
        ink: "#1f2430",
        sub: "#8a92a6",
        accent: "color-mix(in srgb, var(--c) 78%, #000)",
        panelStyle: {
          background: "#f5f7fb",
          border: "1px solid #eceef4",
        },
        chipStyle: {
          background: "#f0f2f7",
          color: "#5b6478",
          border: "1px solid #e9ebf2",
        },
        dividerColor: "#eceef4",
        rankStyle: withVar({
          background:
            "linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 60%, #000))",
          color: "#fff",
          boxShadow: "0 6px 16px -8px color-mix(in srgb, var(--c) 55%, transparent)",
        }),
        barTrack: "#eceef4",
        brand: "#aab2c2",
        glowStyle: { boxShadow: "0 0 0 3px #ffffff" },
      };
  }
}

function Chip({ text, style }: { text: string; style: CSSProperties }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-bold leading-none"
      style={style}
    >
      {text}
    </span>
  );
}

function classTags(charClass: string | null | undefined): string[] {
  return (charClass ?? "")
    .split(/\s*\/\s*/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function ProfileCard({
  identity,
  widgets,
  style,
  className = "",
}: {
  identity: ProfileIdentity;
  widgets: ResolvedWidget[];
  style?: ProfileCardStyle | string | null;
  className?: string;
}) {
  const skinKey = normalizeCardStyle(style ?? DEFAULT_CARD_STYLE);
  const s = buildSkin(skinKey, identity.accent);
  const nameFont = s.serif ? { fontFamily: SERIF } : undefined;
  const rankPct = Math.max(0, Math.min(100, Math.round(identity.rankPct ?? 0)));

  const contentStyle: ContentStyle = {
    ink: s.ink,
    sub: s.sub,
    accent: s.accent,
    panel: s.panelStyle,
    barTrack: s.barTrack,
  };

  const tags = [
    ...classTags(identity.charClass),
    identity.race,
    identity.attribute && `속성 ${identity.attribute}`,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[26px] p-5 sm:p-6 ${className}`}
      style={s.rootStyle}
    >
      {/* ── 스킨별 장식 레이어 ── */}
      {s.decoration === "holo" && (
        <>
          <div className="pointer-events-none absolute -inset-16 -z-10 opacity-40 card-holo-sheen" />
          <div className="pointer-events-none absolute inset-0 -z-10 card-sheen-sweep mix-blend-overlay" />
        </>
      )}
      {s.decoration === "cyber" && (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 40% at 50% 0%, color-mix(in srgb, var(--c) 30%, transparent), transparent 60%)",
          }}
        />
      )}
      {s.decoration === "sakura" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none text-2xl opacity-40">
          <span className="absolute left-[8%] top-[14%]">🌸</span>
          <span className="absolute right-[10%] top-[30%] text-lg">🌸</span>
          <span className="absolute bottom-[16%] left-[16%] text-base">🌸</span>
          <span className="absolute right-[18%] bottom-[22%]">🌸</span>
        </div>
      )}
      {s.decoration === "parchment" && (
        <div
          className="pointer-events-none absolute inset-2 -z-10 rounded-[20px]"
          style={{ border: "1px solid rgba(120,90,40,0.3)" }}
        />
      )}
      {s.decoration === "midnight" && (
        <div className="pointer-events-none absolute inset-0 -z-10 select-none text-[10px] opacity-70">
          <span className="absolute left-[12%] top-[16%] text-white/70">✦</span>
          <span className="absolute right-[14%] top-[24%] text-[8px] text-white/50">✦</span>
          <span className="absolute left-[42%] top-[10%] text-[7px] text-white/40">✦</span>
          <span className="absolute right-[26%] top-[54%] text-white/60">✦</span>
          <span className="absolute left-[22%] bottom-[30%] text-[8px] text-white/40">✦</span>
        </div>
      )}
      {s.decoration === "cbt" && (
        <div className="pointer-events-none absolute inset-0 -z-10 card-sheen-sweep opacity-30 mix-blend-overlay" />
      )}
      {/* 테마 일러스트(생활스킬·훈장·전설) */}
      <CardScene scene={s.scene} tone={s.sceneTone} />

      {/* ── 헤더: 아바타 · 정체성 · 등급 ── */}
      <div className="flex items-start gap-4">
        <span
          className="inline-flex shrink-0 rounded-full"
          style={s.glowStyle}
        >
          <Avatar name={identity.nickname} avatar={identity.avatar} size={76} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              className="truncate text-2xl font-black leading-none"
              style={{ color: s.ink, ...nameFont }}
            >
              {identity.nickname}
            </h2>
            {identity.level != null && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-black leading-none"
                style={{ background: s.accent, color: "#fff" }}
              >
                Lv.{identity.level}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold" style={{ color: s.sub }}>
              @{identity.username}
            </span>
            {identity.status && (
              <span className="text-[11px] font-bold" style={{ color: s.accent }}>
                ● {identity.status}
              </span>
            )}
          </div>

          {(identity.title || identity.badge) && (
            <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1" style={s.chipStyle}>
              {identity.badge && <span className="text-xs leading-none">{identity.badge}</span>}
              {identity.title && (
                <span className="truncate text-[11px] font-bold leading-none">{identity.title}</span>
              )}
            </div>
          )}
        </div>

        {identity.rank && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span
              className="grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black"
              style={s.rankStyle}
              title="모험가 등급"
            >
              {identity.rank}
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wide"
              style={{ color: s.sub }}
            >
              {s.rankLabel ?? "RANK"}
            </span>
          </div>
        )}
      </div>

      {/* 태그 */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Chip key={i} text={t} style={s.chipStyle} />
          ))}
        </div>
      )}

      {/* 등급 진행 바 */}
      {identity.rank && (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: s.barTrack }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${rankPct}%`,
                background: `linear-gradient(90deg, ${s.accent}, color-mix(in srgb, ${s.accent} 55%, #fff))`,
              }}
            />
          </div>
        </div>
      )}

      {/* 내용물(위젯) */}
      {widgets.length > 0 && (
        <>
          <div className="my-4 h-px w-full" style={{ background: s.dividerColor }} />
          <ProfileContent widgets={widgets} style={contentStyle} />
        </>
      )}

      {/* 푸터 */}
      <div className="mt-4 flex items-center justify-between">
        <span
          className="text-[10px] font-black uppercase tracking-[0.2em]"
          style={{ color: s.brand }}
        >
          ARIANROD ONLINE
        </span>
        <span
          className="text-[10px] font-bold uppercase tracking-[0.15em]"
          style={{ color: s.brand }}
        >
          {skinKey === "cbt" ? "✦ CBT Exclusive" : "Character Card"}
        </span>
      </div>
    </div>
  );
}
