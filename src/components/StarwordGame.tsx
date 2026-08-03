"use client";

import { useEffect, useRef, useState } from "react";
import {
  getStarwordRanking,
  getStarwordState,
  guessStarword,
  replaceStarwordForGm,
  settleStarwordRanks,
  startStarword,
  type StarwordRankRow,
  type StarwordState,
} from "@/app/actions/starword";
import {
  formatElapsed,
  STARWORD_CLEAR_REWARD,
  STARWORD_ENTRY_FEE,
  STARWORD_ICON,
  STARWORD_LEGEND,
  STARWORD_MAX_TRIES,
  STARWORD_RANK_REWARDS,
} from "@/lib/starword";

// 판정별 칸 색 — 아이콘만으로는 한눈에 안 들어와서 배경으로도 구분한다.
const VERDICT_BG: Record<string, string> = {
  별: "bg-amber-400 text-white",
  항성: "bg-amber-200 text-amber-900",
  행성: "bg-indigo-200 text-indigo-900",
  혜성: "bg-sky-100 text-sky-800",
  위성: "bg-stone-200 text-stone-700",
  공허: "bg-canvas text-faint",
};

const MEDAL = ["🥇", "🥈", "🥉"];

function Leaderboard({ rows }: { rows: StarwordRankRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-faint">아직 맞힌 사람이 없어요.</p>
    );
  }
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => {
        const top = i < 3;
        return (
          <li
            key={r.username}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${
              top ? "bg-amber-50" : ""
            }`}
          >
            <span className="grid w-6 shrink-0 place-items-center text-sm">
              {top ? (
                MEDAL[i]
              ) : (
                <span className="text-[11px] font-black text-faint">{i + 1}</span>
              )}
            </span>
            <span
              className={`min-w-0 flex-1 truncate text-sm ${
                top ? "font-black text-content" : "font-bold text-muted"
              }`}
            >
              {r.nickname}
            </span>
            <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-faint ring-1 ring-line">
              {r.tries}번
            </span>
            <span
              className={`shrink-0 tabular-nums text-xs font-black ${
                top ? "text-amber-600" : "text-muted"
              }`}
            >
              {formatElapsed(r.elapsedMs)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function yesterdayKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Elapsed({ from }: { from: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{formatElapsed(now - from)}</span>;
}

export default function StarwordGame({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<StarwordState | null>(null);
  const [today, setToday] = useState<StarwordRankRow[]>([]);
  const [prev, setPrev] = useState<StarwordRankRow[]>([]);
  const [tab, setTab] = useState<"legend" | "today" | "prev">("legend");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshRanks = async (day: string) => {
    const [t, p] = await Promise.all([getStarwordRanking(day), getStarwordRanking(yesterdayKey(day))]);
    setToday(t);
    setPrev(p);
  };

  useEffect(() => {
    void (async () => {
      await settleStarwordRanks();
      const s = await getStarwordState();
      setState(s);
      await refreshRanks(s.day);
    })();
  }, []);

  const over = !!state && (state.cleared || state.failed);

  async function begin() {
    if (busy) return;
    setBusy(true);
    const s = await startStarword();
    setState(s);
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !input.trim()) return;
    setBusy(true);
    const s = await guessStarword(input);
    setState(s);
    if (!s.error) setInput("");
    if (s.cleared || s.failed) await refreshRanks(s.day);
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function replaceWord() {
    if (busy) return;
    setBusy(true);
    const s = await replaceStarwordForGm();
    setState(s);
    setInput("");
    await refreshRanks(s.day);
    setBusy(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-faint">STARWORD</p>
          <h3 className="mt-1 text-xl font-black text-content">🌠 쌍별</h3>
        </div>

        <div className="space-y-4 p-5">
          {state?.isGm && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
                    GM 테스트
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-amber-900">
                    현재 단어 {state.gmAnswer ?? "없음"} · 리더보드 제외
                  </p>
                </div>
                <button
                  type="button"
                  onClick={replaceWord}
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  단어 교체
                </button>
              </div>
            </div>
          )}

          {!state ? (
            <p className="py-8 text-center text-sm text-faint">불러오는 중…</p>
          ) : !state.started ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-line">
                <div className="flex items-center justify-between bg-subtle px-4 py-3">
                  <span className="text-xs font-bold text-muted">입장료</span>
                  <span className="text-lg font-black text-content">
                    {STARWORD_ENTRY_FEE}
                    <span className="ml-0.5 text-xs">G</span>
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {[
                    { icon: "⭐", label: "맞히면", gold: STARWORD_CLEAR_REWARD, now: true },
                    { icon: "🥇", label: "1등", gold: STARWORD_RANK_REWARDS[0] },
                    { icon: "🥈", label: "2등", gold: STARWORD_RANK_REWARDS[1] },
                    { icon: "🥉", label: "3등", gold: STARWORD_RANK_REWARDS[2] },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2.5 px-4 py-2.5">
                      <span className="text-base">{r.icon}</span>
                      <span className="text-sm font-bold text-content">{r.label}</span>
                      {r.now && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-black text-brand-600">
                          즉시
                        </span>
                      )}
                      <span className="ml-auto text-sm font-black tabular-nums text-amber-600">
                        +{r.gold}G
                      </span>
                    </div>
                  ))}
                </div>
                <p className="bg-subtle px-4 py-2 text-[11px] text-faint">
                  순위 보상은 다음 날 우편함으로
                </p>
              </div>

              {state.error && <p className="text-sm font-bold text-rose-500">{state.error}</p>}
              <button
                onClick={begin}
                disabled={busy}
                className="w-full rounded-xl bg-brand-500 px-4 py-3.5 text-sm font-black text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? "여는 중…" : `시작하기 · ${STARWORD_ENTRY_FEE}G`}
              </button>
              <p className="text-center text-[11px] text-faint">
                기회 {STARWORD_MAX_TRIES}번 · 하루 한 판 · 재도전 없음
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-muted">
                <span>남은 기회 {state.triesLeft}</span>
                {state.cleared && state.elapsedMs != null ? (
                  <span className="text-brand-600">{formatElapsed(state.elapsedMs)}</span>
                ) : (
                  !over && state.startedAtMs && <Elapsed from={state.startedAtMs} />
                )}
              </div>

              {/* 시도 칸 — 남은 기회만큼 빈 줄을 미리 그려 몇 번 남았는지 눈으로 보이게 */}
              <div className="space-y-1.5">
                {Array.from({ length: STARWORD_MAX_TRIES }).map((_, i) => {
                  const row = state.rows[i];
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                        row ? "bg-subtle" : "border border-dashed border-line"
                      }`}
                    >
                      <span className="w-4 text-[11px] font-black text-faint">{i + 1}</span>
                      <div className="flex gap-2">
                        {[0, 1].map((c) => (
                          <div key={c} className="flex flex-col items-center gap-0.5">
                            <span
                              className={`grid h-9 w-9 place-items-center rounded-lg text-lg font-black ${
                                row ? VERDICT_BG[row.verdicts[c]] : "bg-canvas text-faint"
                              }`}
                            >
                              {row ? [...row.word][c] : ""}
                            </span>
                            <span className="text-[13px] leading-none">
                              {row ? STARWORD_ICON[row.verdicts[c]] : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                      {row && (
                        <span className="ml-auto text-[11px] font-bold text-faint">
                          {row.verdicts.join(" · ")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {over ? (
                <div
                  className={`rounded-2xl p-4 text-center ${
                    state.cleared ? "bg-brand-50 text-brand-700" : "bg-subtle text-muted"
                  }`}
                >
                  <p className="text-lg font-black">
                    {state.cleared ? `정답! +${STARWORD_CLEAR_REWARD}G` : "실패"}
                  </p>
                  <p className="mt-1 text-sm">정답은 {state.answer}</p>
                </div>
              ) : (
                <form onSubmit={submit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={2}
                    placeholder="두 글자"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2.5 text-center text-lg font-black tracking-widest text-content outline-none focus:border-brand-400"
                  />
                  <button
                    type="submit"
                    disabled={busy || input.trim().length !== 2}
                    className="rounded-xl bg-brand-500 px-5 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
                  >
                    입력
                  </button>
                </form>
              )}
              {state.error && <p className="text-sm font-bold text-rose-500">{state.error}</p>}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="flex border-b border-line bg-subtle p-1">
              {(
                [
                  ["legend", "판정"],
                  ["today", "오늘 순위"],
                  ["prev", "어제 순위"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                    tab === key ? "bg-surface text-content shadow-sm" : "text-muted hover:text-content"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-3">
              {tab === "legend" ? (
                <ul className="space-y-1.5">
                  {STARWORD_LEGEND.map((l) => (
                    <li key={l.verdict} className="flex items-center gap-2.5">
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm ${VERDICT_BG[l.verdict]}`}
                      >
                        {STARWORD_ICON[l.verdict]}
                      </span>
                      <span className="w-9 shrink-0 text-xs font-black text-content">{l.verdict}</span>
                      <span className="text-[11px] leading-tight text-muted">{l.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Leaderboard rows={tab === "today" ? today : prev} />
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-line p-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl border border-line py-2.5 text-sm font-bold text-muted transition hover:bg-subtle"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
