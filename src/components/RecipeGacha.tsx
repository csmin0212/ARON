"use client";

import { useState } from "react";
import { drawRecipeGacha, type GachaState } from "@/app/actions/gacha";

const STAR_TONE = ["", "text-slate-400", "text-emerald-500", "text-sky-500"];

function Stars({ n }: { n: number }) {
  return <span className={STAR_TONE[n] ?? "text-amber-500"}>{"★".repeat(n)}</span>;
}

export default function RecipeGacha({ gold, onClose }: { gold: number; onClose: () => void }) {
  const [curGold, setCurGold] = useState(gold);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GachaState>(undefined);
  const [rateOpen, setRateOpen] = useState(false);

  async function draw(count: 1 | 10) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await drawRecipeGacha(count);
      setResult(res);
      if (res && "ok" in res) setCurGold(res.gold);
    } catch {
      setResult({ error: "가챠를 뽑지 못했어요. 다시 시도해주세요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="레시피 가챠"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-subtle px-5 py-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">Recipe Gacha</p>
            <h3 className="mt-1 text-2xl font-extrabold text-content">🎁 레시피 가챠</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-amber-500">🪙 {curGold.toLocaleString()}G</span>
            <button
              type="button"
              onClick={() => setRateOpen(true)}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle"
            >
              확률표
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-center text-xs text-faint">
            다양한 레시피를 수집해 특별한 요리를 완성하세요! · 중복은 아쉽지만 조각의 여지…
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* 일반 가챠 */}
            <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-content">✨ 일반 가챠</h4>
                <span className="text-[11px] font-bold text-faint">1★50 · 2★35 · 3★15</span>
              </div>
              <p className="mb-3 text-[11px] text-muted">일반 등급 레시피를 획득합니다.</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => draw(1)}
                  className="rounded-xl border border-brand-300 bg-surface px-3 py-2.5 text-sm font-extrabold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
                >
                  1회 <span className="text-amber-500">50골드</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => draw(10)}
                  className="rounded-xl border border-brand-400 bg-brand-500 px-3 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  10연차 <span className="text-amber-100">500골드</span>
                </button>
              </div>
            </section>

            {/* 고급 가챠 — 잠금 */}
            <section className="relative overflow-hidden rounded-2xl border border-line bg-subtle/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-extrabold text-faint">💜 고급 가챠</h4>
              </div>
              <p className="mb-3 text-[11px] text-faint2">희귀한 고급 등급 레시피.</p>
              <div className="grid gap-2 opacity-40">
                <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-extrabold text-faint">
                  1회 500골드
                </div>
                <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-center text-sm font-extrabold text-faint">
                  10연차 5000골드
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="rounded-full bg-content/80 px-3 py-1 text-xs font-black text-surface">
                  🔒 준비 중
                </span>
              </div>
            </section>
          </div>

          {/* 결과 */}
          {result && "error" in result && (
            <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
              {result.error}
            </p>
          )}
          {result && "ok" in result && (
            <div className="rounded-2xl border border-line bg-subtle/50 p-4">
              <p className="mb-3 text-sm font-extrabold text-content">
                결과 — 신규 {result.newCount} · 중복 {result.draws.length - result.newCount}
                <span className="ml-1 font-semibold text-faint">(-{result.spent.toLocaleString()}G)</span>
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.draws.map((d, i) => (
                  <div
                    key={`${d.id}-${i}`}
                    className={`rounded-xl border px-3 py-2.5 ${
                      d.isNew ? "border-brand-200 bg-surface" : "border-dashed border-line bg-subtle/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-extrabold text-content">
                        <Stars n={d.stars} /> {d.name}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black ${
                          d.isNew ? "bg-brand-500 text-white" : "bg-subtle-hover text-faint"
                        }`}
                      >
                        {d.isNew ? "신규!" : "중복 아쉽!"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {d.category} · {d.resultName}
                    </p>
                    {d.isNew && d.ingredients && (
                      <p className="mt-1 truncate text-[11px] font-semibold text-emerald-600">
                        📖 재료: {d.ingredients}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-subtle px-4 py-2.5 text-sm font-bold text-content transition hover:bg-subtle-hover"
          >
            닫기
          </button>
        </div>
      </div>

      {/* 확률표 */}
      {rateOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/55 px-4"
          role="presentation"
          onClick={() => setRateOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-line bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="mb-3 text-lg font-extrabold text-content">📊 확률 정보</h4>
            <div className="space-y-1.5 text-sm">
              <p className="mb-1 text-xs font-bold text-faint">일반 가챠</p>
              <div className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5 font-bold">
                <span className="text-slate-400">★ 1성</span>
                <span className="text-content">50.0%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5 font-bold">
                <span className="text-emerald-500">★★ 2성</span>
                <span className="text-content">35.0%</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-subtle px-3 py-1.5 font-bold">
                <span className="text-sky-500">★★★ 3성</span>
                <span className="text-content">15.0%</span>
              </div>
              <p className="mb-1 mt-3 text-xs font-bold text-faint">고급 가챠</p>
              <div className="flex items-center justify-between rounded-lg bg-subtle/60 px-3 py-1.5 font-bold text-faint">
                <span>🔒 준비 중</span>
                <span>???</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRateOpen(false)}
              className="mt-4 w-full rounded-xl bg-subtle px-4 py-2 text-sm font-bold text-content transition hover:bg-subtle-hover"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
