"use client";

import { useState, useTransition } from "react";
import { performAction, tryKeyword, type GameResult } from "@/app/actions/game";

export type ActionInfo = {
  id: number;
  kind: string;
  label: string | null;
  apCost: number;
  statLabel: string | null;
  dc: number | null;
};

const KIND_EMOJI: Record<string, string> = {
  채집: "🌿",
  낚시: "🎣",
  채굴: "⛏️",
  벌목: "🪓",
  사냥: "🏹",
  휴식: "🛏️",
};

function ResultCard({ r }: { r: Extract<GameResult, { ok: true }> }) {
  const tone =
    r.success === false
      ? "border-rose-300 bg-rose-50"
      : r.gainText
        ? "border-emerald-300 bg-emerald-50"
        : "border-line bg-subtle";
  return (
    <div className={`animate-fadeup rounded-xl border px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-content">{r.title}</span>
        {r.success === true && r.dice && (
          <span className="text-xs font-extrabold text-emerald-600">성공!</span>
        )}
        {r.success === false && <span className="text-xs font-extrabold text-rose-500">실패</span>}
      </div>
      {r.dice && (
        <p className="mt-1 text-lg font-extrabold text-content">
          🎲 {r.dice.join(" + ")}
          {r.modifier ? (
            <span className="text-brand-600">
              {" "}
              {r.modifier >= 0 ? "+" : ""}
              {r.modifier}
            </span>
          ) : null}{" "}
          = <span className="text-brand-600">{r.total}</span>
          {r.dc != null && <span className="text-sm text-faint"> / DC {r.dc}</span>}
        </p>
      )}
      {r.gainText && (
        <p className="mt-1 text-sm font-bold text-emerald-600">✨ 획득: {r.gainText}</p>
      )}
      {r.flavor && <p className="mt-1 text-sm text-muted">{r.flavor}</p>}
    </div>
  );
}

export default function WorldPlay({ actions }: { actions: ActionInfo[] }) {
  const [result, setResult] = useState<GameResult | null>(null);
  const [keyword, setKeyword] = useState("");
  const [pending, start] = useTransition();

  function runAction(id: number) {
    if (pending) return;
    start(async () => {
      setResult(await performAction(id));
    });
  }

  function runKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !keyword.trim()) return;
    start(async () => {
      setResult(await tryKeyword(keyword));
      setKeyword("");
    });
  }

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
        ⚡ 행동 <span className="ml-1 text-xs font-normal text-faint">(행동치 소모)</span>
      </h2>

      {actions.length > 0 ? (
        <div className="space-y-2">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => runAction(a.id)}
              disabled={pending}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-amber-400 hover:bg-amber-50 disabled:opacity-50"
            >
              <span className="text-xl">{KIND_EMOJI[a.kind] ?? "✨"}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-content">
                  {a.label ?? a.kind}
                </span>
                <span className="text-[11px] text-faint">
                  ⚡{a.apCost}
                  {a.statLabel && a.dc != null && ` · ${a.statLabel} 판정 (DC ${a.dc})`}
                </span>
              </span>
              <span className="ml-auto text-faint2">{pending ? "…" : "→"}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-1 pb-1 text-xs text-faint">이 장소에서 할 수 있는 행동이 없어요.</p>
      )}

      {/* 키워드 탐색 */}
      <form onSubmit={runKeyword} className="mt-3 border-t border-line pt-3">
        <label className="mb-1.5 block px-1 text-xs font-bold text-faint">
          🔍 탐색 — 단서가 될 만한 말을 속삭여보세요
        </label>
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            maxLength={40}
            placeholder="키워드 입력…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-subtle px-3.5 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={pending || !keyword.trim()}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
          >
            탐색
          </button>
        </div>
      </form>

      {result && (
        <div className="mt-3">
          {result.ok ? (
            <ResultCard r={result} />
          ) : (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              {result.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
