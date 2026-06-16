"use client";

import { useMemo, useState } from "react";

export type CookingBookEntry = {
  id: string;
  name: string;
  rank: number;
  rankLabel: string;
  category: string;
  ingredients: string;
  resultName: string;
  resultQty: number;
  effect: string | null;
  sellPrice: number;
  weight: number;
  discovered: boolean;
};

const RANK_TONE = [
  "text-slate-500",
  "text-slate-900",
  "text-emerald-600",
  "text-sky-600",
  "text-violet-600",
  "text-amber-500",
];

function pct(found: number, total: number): number {
  return total > 0 ? Math.round((found / total) * 100) : 0;
}

export default function CookingRecipeBook({ entries }: { entries: CookingBookEntry[] }) {
  const [activeRank, setActiveRank] = useState(1);
  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko")),
    [entries],
  );
  const found = sorted.filter((entry) => entry.discovered).length;
  const rankItems = sorted.filter((entry) => entry.rank === activeRank);
  const rankFound = rankItems.filter((entry) => entry.discovered).length;

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-content">🍳 요리 도감</h2>
          <p className="mt-0.5 text-xs text-faint">
            {found}/{sorted.length} · {pct(found, sorted.length)}%
          </p>
        </div>
        <div className="rounded-full bg-brand-50 px-3 py-1 text-sm font-black text-brand-600">
          {rankFound}/{rankItems.length} <span className="text-xs">R{activeRank}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-6 gap-1.5 rounded-2xl bg-subtle p-1.5">
        {[0, 1, 2, 3, 4, 5].map((rank) => {
          const total = sorted.filter((entry) => entry.rank === rank).length;
          const count = sorted.filter((entry) => entry.rank === rank && entry.discovered).length;
          const active = activeRank === rank;
          return (
            <button
              key={rank}
              type="button"
              onClick={() => setActiveRank(rank)}
              className={`rounded-xl px-2 py-2 text-center text-[11px] font-extrabold transition ${
                active
                  ? "bg-surface text-brand-600 shadow-sm"
                  : "text-muted hover:bg-surface/70 hover:text-content"
              }`}
            >
              <span className="block">R{rank}</span>
              <span className="text-[10px] font-bold text-faint">
                {count}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {rankItems.length === 0 ? (
        <p className="rounded-2xl bg-subtle/50 px-4 py-6 text-center text-sm text-faint">
          이 등급의 레시피는 아직 없어요.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rankItems.map((entry) => (
            <article
              key={entry.id}
              className={`rounded-2xl border px-4 py-3 ${
                entry.discovered
                  ? "border-line bg-subtle/55"
                  : "border-dashed border-line bg-subtle/20 opacity-75"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-content">
                    {entry.discovered ? entry.name : "???"}
                  </p>
                  <p className={`mt-0.5 text-xs font-bold ${RANK_TONE[entry.rank] ?? "text-muted"}`}>
                    {entry.discovered ? `${entry.rankLabel} · ${entry.category}` : `R${entry.rank}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-black text-brand-600">
                  {entry.discovered ? entry.resultName : "미발견"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-muted">
                <span className="rounded bg-surface px-2 py-0.5">
                  판매가 {entry.discovered ? `${entry.sellPrice}G` : "?"}
                </span>
                <span className="rounded bg-surface px-2 py-0.5">
                  중량 {entry.discovered ? entry.weight : "?"}
                </span>
                {entry.discovered && entry.resultQty > 1 && (
                  <span className="rounded bg-surface px-2 py-0.5">결과 x{entry.resultQty}</span>
                )}
              </div>

              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                {entry.discovered ? `재료: ${entry.ingredients}` : "아직 발견하지 못한 레시피입니다."}
              </p>
              <p className="mt-1 line-clamp-3 min-h-[3rem] text-xs leading-relaxed text-faint">
                {entry.discovered ? entry.effect || "특별한 효과는 없습니다." : "조리로 발견하면 내용이 공개됩니다."}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
