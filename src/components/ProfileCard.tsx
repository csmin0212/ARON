import type { CSSProperties } from "react";
import Avatar from "./Avatar";
import { isHexColor } from "@/lib/theme";
import {
  DEFAULT_CARD_STYLE,
  normalizeCardStyle,
  type ProfileCardStyle,
} from "@/lib/profileCard";

export interface ProfileCardStat {
  key: string;
  label: string;
  value: number | null;
  mod?: number | null;
}

export interface ProfileCardData {
  nickname: string;
  username: string;
  avatar: string | null;
  status?: string | null;
  level?: number | null;
  rank?: string | null; // 모험가 등급 (A~F)
  rankPct?: number; // 다음 등급까지 진행률 0~100
  charClass?: string | null;
  race?: string | null;
  attribute?: string | null;
  gold?: string | null; // 표시용 문자열 "12,300G"
  hp?: string | number | null; // "cur/max" 또는 max
  mp?: string | number | null;
  fate?: number | null;
  stats?: ProfileCardStat[];
  title?: string | null; // 대표 칭호
  badge?: string | null; // 대표 배지 이모지
  accent?: string | null; // profileColor
}

interface SkinConfig {
  rootStyle: CSSProperties;
  ink: string;
  sub: string;
  accent: string; // 강조 텍스트/바 색
  panelStyle: CSSProperties;
  chipStyle: CSSProperties;
  dividerColor: string;
  rankStyle: CSSProperties;
  barTrack: string;
  brand: string;
  serif?: boolean;
  decoration?: "holo" | "cyber" | "parchment" | "sakura" | null;
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
    default:
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

function Vital({
  icon,
  label,
  value,
  sub,
  panel,
  ink,
}: {
  icon: string;
  label: string;
  value: string | number | null | undefined;
  sub: string;
  panel: CSSProperties;
  ink: string;
}) {
  return (
    <div className="flex-1 rounded-2xl px-2 py-2 text-center" style={panel}>
      <div className="text-[10px] font-bold" style={{ color: sub }}>
        <span className="mr-0.5">{icon}</span>
        {label}
      </div>
      <div className="mt-0.5 text-sm font-extrabold" style={{ color: ink }}>
        {value ?? "-"}
      </div>
    </div>
  );
}

export default function ProfileCard({
  data,
  style,
  className = "",
}: {
  data: ProfileCardData;
  style?: ProfileCardStyle | string | null;
  className?: string;
}) {
  const skinKey = normalizeCardStyle(style ?? DEFAULT_CARD_STYLE);
  const s = buildSkin(skinKey, data.accent);
  const stats = (data.stats ?? []).slice(0, 7);
  const nameFont = s.serif ? { fontFamily: SERIF } : undefined;
  const rankPct = Math.max(0, Math.min(100, Math.round(data.rankPct ?? 0)));

  const tags = [
    data.charClass,
    data.race,
    data.attribute && `속성 ${data.attribute}`,
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

      {/* ── 헤더: 아바타 · 정체성 · 등급 ── */}
      <div className="flex items-start gap-4">
        <span
          className="inline-flex shrink-0 rounded-full"
          style={s.glowStyle}
        >
          <Avatar name={data.nickname} avatar={data.avatar} size={76} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              className="truncate text-2xl font-black leading-none"
              style={{ color: s.ink, ...nameFont }}
            >
              {data.nickname}
            </h2>
            {data.level != null && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[11px] font-black leading-none"
                style={{ background: s.accent, color: "#fff" }}
              >
                Lv.{data.level}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold" style={{ color: s.sub }}>
              @{data.username}
            </span>
            {data.status && (
              <span className="text-[11px] font-bold" style={{ color: s.accent }}>
                ● {data.status}
              </span>
            )}
          </div>

          {(data.title || data.badge) && (
            <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1" style={s.chipStyle}>
              {data.badge && <span className="text-xs leading-none">{data.badge}</span>}
              {data.title && (
                <span className="truncate text-[11px] font-bold leading-none">{data.title}</span>
              )}
            </div>
          )}
        </div>

        {data.rank && (
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span
              className="grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black"
              style={s.rankStyle}
              title="모험가 등급"
            >
              {data.rank}
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wide"
              style={{ color: s.sub }}
            >
              RANK
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
      {data.rank && (
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

      {/* 구분선 */}
      <div className="my-4 h-px w-full" style={{ background: s.dividerColor }} />

      {/* 바이탈 */}
      <div className="flex gap-2">
        <Vital icon="❤️" label="HP" value={data.hp} sub={s.sub} panel={s.panelStyle} ink={s.ink} />
        <Vital icon="💧" label="MP" value={data.mp} sub={s.sub} panel={s.panelStyle} ink={s.ink} />
        <Vital icon="🍀" label="페이트" value={data.fate} sub={s.sub} panel={s.panelStyle} ink={s.ink} />
        <Vital
          icon="🪙"
          label="소지금"
          value={data.gold}
          sub={s.sub}
          panel={s.panelStyle}
          ink={s.ink}
        />
      </div>

      {/* 능력치 */}
      {stats.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {stats.map((st) => (
            <div
              key={st.key}
              className="rounded-xl px-1 py-1.5 text-center"
              style={s.panelStyle}
            >
              <div className="text-[9px] font-bold leading-none" style={{ color: s.sub }}>
                {st.label}
              </div>
              <div className="mt-1 text-base font-black leading-none" style={{ color: s.ink }}>
                {st.value ?? "-"}
              </div>
            </div>
          ))}
        </div>
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
          Character Card
        </span>
      </div>
    </div>
  );
}
