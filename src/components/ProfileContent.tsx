import type { CSSProperties } from "react";
import type { ResolvedWidget } from "@/lib/profileWidgets";

// 형태(카드/히어로)와 무관하게 같은 위젯 세트를 렌더. 색·패널은 인라인 스타일로 주입받아
// 카드 스킨이든 히어로 테마(CSS 변수)든 동일 컴포넌트로 처리한다.
export interface ContentStyle {
  ink: string; // 값 텍스트
  sub: string; // 라벨 텍스트
  accent: string; // 강조(골드·바)
  panel: CSSProperties; // 타일/블록 배경
  barTrack: string; // 진행바 트랙
}

// 메인 프로필(히어로) 형태용 — 테마 CSS 변수 기반이라 라이트/다크·강조색을 자동 반영.
export const HERO_CONTENT_STYLE: ContentStyle = {
  ink: "var(--content)",
  sub: "var(--faint)",
  accent: "var(--brand-600)",
  panel: { background: "var(--subtle)" },
  barTrack: "var(--subtle-hover)",
};

function Tile({
  emoji,
  label,
  value,
  accent,
  s,
}: {
  emoji: string;
  label: string;
  value: string;
  accent: boolean;
  s: ContentStyle;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl px-2 py-2 text-center" style={s.panel}>
      <div className="truncate text-[10px] font-bold" style={{ color: s.sub }}>
        <span className="mr-0.5">{emoji}</span>
        {label}
      </div>
      <div
        className="mt-0.5 truncate text-sm font-extrabold"
        style={{ color: accent ? s.accent : s.ink }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ProfileContent({
  widgets,
  style: s,
}: {
  widgets: ResolvedWidget[];
  style: ContentStyle;
}) {
  if (widgets.length === 0) return null;

  // 연속된 타일은 한 줄(row)로 묶고, 넓은 블록(능력치·도감)은 전체 폭으로.
  const blocks: React.ReactNode[] = [];
  let tileRun: typeof widgets = [];
  const flushTiles = (keySuffix: string) => {
    if (tileRun.length === 0) return;
    blocks.push(
      <div key={`tiles-${keySuffix}`} className="flex flex-wrap gap-2">
        {tileRun.map((w) =>
          w.kind === "tile" ? (
            <Tile
              key={w.key}
              emoji={w.emoji}
              label={w.label}
              value={w.value}
              accent={w.accent}
              s={s}
            />
          ) : null,
        )}
      </div>,
    );
    tileRun = [];
  };

  widgets.forEach((w, i) => {
    if (w.kind === "tile") {
      tileRun.push(w);
      return;
    }
    flushTiles(String(i));
    if (w.kind === "stats") {
      blocks.push(
        <div key={`stats-${i}`} className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {w.stats.map((st, j) => (
            <div key={j} className="rounded-xl px-1 py-1.5 text-center" style={s.panel}>
              <div className="truncate text-[9px] font-bold leading-none" style={{ color: s.sub }}>
                {st.label}
              </div>
              <div className="mt-1 text-base font-black leading-none" style={{ color: s.ink }}>
                {st.value ?? "-"}
              </div>
            </div>
          ))}
        </div>,
      );
    } else {
      blocks.push(
        <div key={`col-${i}`} className="rounded-2xl px-3 py-2.5" style={s.panel}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {w.rows.map((r) => (
              <div key={r.label}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-bold" style={{ color: s.sub }}>
                    {r.emoji} {r.label}
                  </span>
                  <span className="text-[11px] font-black" style={{ color: s.accent }}>
                    {r.pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: s.barTrack }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.pct}%`,
                      background: `linear-gradient(90deg, ${s.accent}, color-mix(in srgb, ${s.accent} 55%, #fff))`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>,
      );
    }
  });
  flushTiles("end");

  return <div className="space-y-2">{blocks}</div>;
}
