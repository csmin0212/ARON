import type { RankTier } from "@/lib/mahjong";

// 등급 배지 — 재질(금속)로 단계를 보여준다. 작사(구리) → 작걸(은) → 작호(금) → 작성(홀로그램).
// 애니메이션은 globals.css 의 mj-rank-* 키프레임.

type Size = "sm" | "md" | "lg";

const METAL: Record<
  RankTier["metal"],
  { plate: string; ring: string; ink: string; sheen: boolean; glow: string | null }
> = {
  copper: {
    plate: "linear-gradient(145deg,#8c5a3c 0%,#c98f63 38%,#f0c9a5 52%,#b3764c 70%,#7a4a2f 100%)",
    ring: "#5e3620",
    ink: "#3b2113",
    sheen: false,
    glow: null,
  },
  silver: {
    plate: "linear-gradient(145deg,#6f7885 0%,#b9c2cd 36%,#f2f5f9 52%,#a3adbb 70%,#5d6673 100%)",
    ring: "#4a525e",
    ink: "#2b323c",
    sheen: true,
    glow: null,
  },
  gold: {
    plate: "linear-gradient(145deg,#8a6410 0%,#dfae3a 34%,#fff0b8 52%,#d5a02c 70%,#7d5a0c 100%)",
    ring: "#6b4c07",
    ink: "#4a3406",
    sheen: true,
    glow: "0 0 14px -2px rgba(224,176,60,.75)",
  },
  holo: {
    plate:
      "linear-gradient(115deg,#f9a8d4 0%,#c4b5fd 18%,#67e8f9 36%,#86efac 54%,#fde68a 72%,#fca5a5 88%,#f9a8d4 100%)",
    ring: "rgba(255,255,255,.75)",
    ink: "#2f2440",
    sheen: true,
    glow: "0 0 20px -2px rgba(167,139,250,.85)",
  },
};

const SIZES: Record<Size, { pad: string; hanja: string; label: string; gap: string }> = {
  sm: { pad: "px-1.5 py-0.5", hanja: "text-[11px]", label: "text-[10px]", gap: "gap-1" },
  md: { pad: "px-2.5 py-1", hanja: "text-sm", label: "text-xs", gap: "gap-1.5" },
  lg: { pad: "px-4 py-2", hanja: "text-xl", label: "text-base", gap: "gap-2" },
};

export default function MahjongRankBadge({
  tier,
  size = "md",
  showHanja = true,
}: {
  tier: RankTier;
  size?: Size;
  showHanja?: boolean;
}) {
  const metal = METAL[tier.metal];
  const s = SIZES[size];

  return (
    <span
      className={`relative inline-flex items-center overflow-hidden rounded-md align-middle ${s.pad} ${s.gap} ${
        tier.metal === "holo" ? "mj-rank-holo" : ""
      }`}
      style={{
        backgroundImage: metal.plate,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(0,0,0,.3), 0 0 0 1px ${metal.ring}${
          metal.glow ? `, ${metal.glow}` : ""
        }`,
      }}
      title={`${tier.label} · ${tier.minPoints}점 이상`}
    >
      {metal.sheen && <span aria-hidden className="mj-rank-sheen" />}
      {showHanja && (
        <span
          className={`relative font-black leading-none ${s.hanja}`}
          style={{ color: metal.ink, textShadow: "0 1px 0 rgba(255,255,255,.45)" }}
        >
          {tier.hanja}
        </span>
      )}
      <span
        className={`relative font-black leading-none tracking-tight ${s.label}`}
        style={{ color: metal.ink, textShadow: "0 1px 0 rgba(255,255,255,.45)" }}
      >
        {tier.label}
      </span>
    </span>
  );
}
