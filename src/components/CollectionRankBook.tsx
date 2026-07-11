"use client";

import { useMemo, useState } from "react";
import type { LifeSkillKind } from "@/lib/lifeSkillData";

export type CollectionKind = LifeSkillKind | "요리";

export type CollectionBookEntry = {
  id?: string;
  kind: CollectionKind;
  name: string;
  category?: string;
  rank: number;
  rarity: string;
  price: number;
  weight: number;
  text: string;
  discovered: boolean;
  count: number;
  locations?: {
    id: string;
    name: string;
    emoji?: string | null;
    hidden: boolean;
  }[];
  resultName?: string;
  ingredients?: string;
};

const KIND_ORDER: CollectionKind[] = ["낚시", "채집", "채광", "요리"];

const KIND_META: Record<CollectionKind, { title: string; emoji: string }> = {
  낚시: { title: "낚시 도감", emoji: "🎣" },
  채집: { title: "채집 도감", emoji: "🌿" },
  채광: { title: "채광 도감", emoji: "⛏️" },
  요리: { title: "요리 도감", emoji: "🍳" },
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

export default function CollectionRankBook({ entries }: { entries: CollectionBookEntry[] }) {
  const [activeKind, setActiveKind] = useState<CollectionKind>("낚시");
  const [selectedEntry, setSelectedEntry] = useState<CollectionBookEntry | null>(null);
  const [activeRanks, setActiveRanks] = useState<Record<CollectionKind, number>>({
    낚시: 1,
    채집: 1,
    채광: 1,
    요리: 1,
  });

  const byKind = useMemo(
    () =>
      Object.fromEntries(
        KIND_ORDER.map((kind) => [kind, entries.filter((entry) => entry.kind === kind)]),
      ) as Record<CollectionKind, CollectionBookEntry[]>,
    [entries],
  );

  return (
    <div className="space-y-4">
      {/* 낚시 / 채집 / 채광 / 요리 토글 */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-subtle p-1.5 sm:grid-cols-4">
        {KIND_ORDER.map((kind) => {
          const group = byKind[kind];
          const found = group.filter((e) => e.discovered).length;
          const active = activeKind === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setActiveKind(kind);
                setSelectedEntry(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-extrabold transition ${
                active
                  ? "bg-surface text-brand-600 shadow-sm"
                  : "text-muted hover:bg-surface/70 hover:text-content"
              }`}
            >
              <span>
                {KIND_META[kind].emoji} {kind}
              </span>
              <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-black text-brand-600">
                {found}/{group.length}
              </span>
            </button>
          );
        })}
      </div>

      {([activeKind] as CollectionKind[]).map((kind) => {
        const group = [...byKind[kind]].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
        const found = group.filter((entry) => entry.discovered).length;
        const activeRank = activeRanks[kind];
        const rankItems = group.filter((entry) => entry.rank === activeRank);
        const rankFound = rankItems.filter((entry) => entry.discovered).length;
        const meta = KIND_META[kind];
        const countLabel =
          kind === "낚시"
            ? "낚은 횟수"
            : kind === "채집"
              ? "채집 횟수"
              : kind === "채광"
                ? "채광 횟수"
                : "레시피";

        return (
          <section key={kind} className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-content">
                  {meta.emoji} {meta.title}
                </h2>
                <p className="mt-0.5 text-xs text-faint">
                  {found}/{group.length} · {pct(found, group.length)}%
                </p>
              </div>
              <div className="rounded-full bg-brand-50 px-3 py-1 text-sm font-black text-brand-600">
                {rankFound}/{rankItems.length} <span className="text-xs">R{activeRank}</span>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-6 gap-1.5 rounded-2xl bg-subtle p-1.5">
              {[0, 1, 2, 3, 4, 5].map((rank) => {
                const total = group.filter((entry) => entry.rank === rank).length;
                const rankCount = group.filter((entry) => entry.rank === rank && entry.discovered).length;
                const active = activeRank === rank;
                return (
                  <button
                    key={rank}
                    type="button"
                    onClick={() => {
                      setActiveRanks((prev) => ({ ...prev, [kind]: rank }));
                      setSelectedEntry(null);
                    }}
                    className={`rounded-xl px-2 py-2 text-center text-[11px] font-extrabold transition ${
                      active
                        ? "bg-surface text-brand-600 shadow-sm"
                        : "text-muted hover:bg-surface/70 hover:text-content"
                    }`}
                  >
                    <span className="block">R{rank}</span>
                    <span className="text-[10px] font-bold text-faint">
                      {rankCount}/{total}
                    </span>
                  </button>
                );
              })}
            </div>

            {rankItems.length === 0 ? (
              <p className="rounded-2xl bg-subtle/50 px-4 py-6 text-center text-sm text-faint">
                이 등급의 항목은 아직 없어요.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rankItems.map((entry) => {
                  const selected =
                    selectedEntry?.kind === entry.kind &&
                    (selectedEntry.id ?? selectedEntry.name) === (entry.id ?? entry.name);
                  return (
                    <button
                      key={`${kind}-${entry.id ?? entry.name}`}
                      type="button"
                      disabled={!entry.discovered}
                      onClick={() => setSelectedEntry(entry)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        entry.discovered
                          ? selected
                            ? "border-brand-300 bg-brand-50/70 shadow-sm"
                            : "border-line bg-subtle/55 hover:border-brand-200 hover:bg-brand-50/40"
                          : "cursor-default border-dashed border-line bg-subtle/20 opacity-75"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-content">
                            {entry.discovered ? entry.name : "???"}
                          </p>
                          <p className={`mt-0.5 text-xs font-bold ${RANK_TONE[entry.rank] ?? "text-muted"}`}>
                            {entry.rarity}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-black text-brand-600">
                          {entry.discovered
                            ? kind === "요리"
                              ? `${countLabel} 발견`
                              : `${countLabel} ${Math.max(1, entry.count)}회`
                            : "미발견"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-muted">
                        <span className="rounded bg-surface px-2 py-0.5">중량 {entry.weight}</span>
                        <span className="rounded bg-surface px-2 py-0.5">판매가 {entry.price}G</span>
                        {kind === "요리" && entry.discovered && entry.resultName && (
                          <span className="rounded bg-surface px-2 py-0.5">{entry.resultName}</span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-3 min-h-[3.75rem] whitespace-pre-line text-xs leading-relaxed text-muted">
                        {entry.discovered
                          ? entry.text
                          : kind === "요리"
                            ? "아직 발견하지 못한 레시피입니다."
                            : "아직 발견하지 못한 항목입니다."}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedEntry?.kind === kind && selectedEntry.discovered && (
              <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-content">{selectedEntry.name}</p>
                    <p className={`mt-0.5 text-xs font-bold ${RANK_TONE[selectedEntry.rank] ?? "text-muted"}`}>
                      {selectedEntry.rarity}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-bold text-muted">
                    <span className="rounded bg-surface px-2 py-0.5">중량 {selectedEntry.weight}</span>
                    <span className="rounded bg-surface px-2 py-0.5">판매가 {selectedEntry.price}G</span>
                    {selectedEntry.kind !== "요리" && (
                      <span className="rounded bg-surface px-2 py-0.5">
                        {countLabel} {Math.max(1, selectedEntry.count)}회
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{selectedEntry.text}</p>
                {selectedEntry.kind === "요리" && selectedEntry.ingredients && (
                  <p className="mt-3 text-xs font-bold text-muted">재료: {selectedEntry.ingredients}</p>
                )}
                {selectedEntry.kind !== "요리" && (
                  <div className="mt-4">
                    <p className="text-xs font-black text-brand-700">얻은 기록</p>
                    {selectedEntry.locations && selectedEntry.locations.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedEntry.locations.map((location) => (
                          <span
                            key={location.id}
                            className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-content shadow-sm"
                          >
                            {location.emoji ?? "📍"} {location.name}
                            {location.hidden ? " · 히든" : ""}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-faint">아직 장소 기록이 없어요. 다음 획득부터 자동으로 남습니다.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
