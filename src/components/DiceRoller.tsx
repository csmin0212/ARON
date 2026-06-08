"use client";

import { useState, useTransition } from "react";
import { rollStat, type RollResult } from "@/app/actions/roll";
import type { StatEntry } from "@/lib/charsheet";

export default function DiceRoller({ stats }: { stats: StatEntry[] }) {
  const [dc, setDc] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function roll(key: string) {
    setErr(null);
    start(async () => {
      const dcNum = dc.trim() ? parseInt(dc, 10) : null;
      const r = await rollStat(key, dcNum);
      if ("error" in r) {
        setErr(r.error);
        setResult(null);
      } else {
        setResult(r);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label className="text-xs font-bold text-faint">목표치(DC)</label>
        <input
          value={dc}
          onChange={(e) => setDc(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="선택"
          inputMode="numeric"
          className="w-20 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
        <span className="text-xs text-faint">비우면 성공/실패 없이 굴림만</span>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {stats.map((s) => (
          <button
            key={s.key}
            onClick={() => roll(s.key)}
            disabled={pending}
            className="rounded-xl border border-line bg-surface px-2 py-2 text-center transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
          >
            <div className="text-xs font-bold text-content">{s.label}</div>
            <div className="text-[11px] font-semibold text-brand-600">
              2D{(s.mod ?? 0) >= 0 ? `+${s.mod ?? 0}` : s.mod}
            </div>
          </button>
        ))}
      </div>

      {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{err}</p>}

      {result && (
        <div
          className={`animate-fadeup rounded-xl border px-4 py-3 ${
            result.success === true
              ? "border-emerald-300 bg-emerald-50"
              : result.success === false
                ? "border-rose-300 bg-rose-50"
                : "border-line bg-subtle"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-content">{result.label}</span>
            {result.success === true && <span className="text-sm font-extrabold text-emerald-600">성공! 🎉</span>}
            {result.success === false && <span className="text-sm font-extrabold text-rose-500">실패…</span>}
          </div>
          <div className="mt-1 text-2xl font-extrabold text-content">
            🎲 {result.dice.join(" + ")}
            {result.modifier !== 0 && (
              <span className="text-brand-600">
                {" "}
                {result.modifier >= 0 ? "+" : ""}
                {result.modifier}
              </span>
            )}{" "}
            = <span className="text-brand-600">{result.total}</span>
            {result.dc != null && <span className="text-base text-faint"> / DC {result.dc}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
