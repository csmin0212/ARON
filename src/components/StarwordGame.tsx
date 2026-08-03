"use client";

import { useEffect, useRef, useState } from "react";
import {
  getStarwordRanking,
  getStarwordState,
  guessStarword,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface shadow-xl">
        <div className="border-b border-line px-5 py-4">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-faint">STARWORD</p>
          <h3 className="mt-1 text-xl font-black text-content">🌠 쌍별</h3>
          <p className="mt-1 text-xs text-faint">
            두 글자 단어 · 기회 {STARWORD_MAX_TRIES}번 · 하루 한 판
          </p>
        </div>

        <div className="space-y-4 p-5">
          {!state ? (
            <p className="py-8 text-center text-sm text-faint">불러오는 중…</p>
          ) : !state.started ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-subtle p-4 text-sm text-muted">
                <p>입장료 {STARWORD_ENTRY_FEE}G · 성공 {STARWORD_CLEAR_REWARD}G</p>
                <p className="mt-1">
                  순위 보상 {STARWORD_RANK_REWARDS.join(" · ")}G — 다음 날 우편으로 도착합니다.
                </p>
              </div>
              {state.error && <p className="text-sm font-bold text-rose-500">{state.error}</p>}
              <button
                onClick={begin}
                disabled={busy}
                className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {busy ? "여는 중…" : `시작하기 (-${STARWORD_ENTRY_FEE}G)`}
              </button>
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

              <div className="space-y-1.5">
                {state.rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-subtle px-3 py-2">
                    <span className="text-base font-black tracking-widest text-content">{row.word}</span>
                    <span className="ml-auto text-lg">
                      {row.verdicts.map((v) => STARWORD_ICON[v]).join(" ")}
                    </span>
                  </div>
                ))}
                {state.rows.length === 0 && (
                  <p className="py-6 text-center text-sm text-faint">첫 단어를 입력해보세요.</p>
                )}
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

          <div className="rounded-2xl border border-line p-3">
            <p className="mb-2 text-[11px] font-extrabold text-faint">판정</p>
            <div className="grid grid-cols-1 gap-1 text-[11px] text-muted sm:grid-cols-2">
              {STARWORD_LEGEND.map((l) => (
                <p key={l.verdict}>
                  {STARWORD_ICON[l.verdict]} <b className="text-content">{l.verdict}</b> {l.text}
                </p>
              ))}
            </div>
          </div>

          {[
            { title: "오늘 순위", rows: today },
            { title: "어제 순위", rows: prev },
          ].map(({ title, rows }) => (
            <div key={title} className="rounded-2xl border border-line p-3">
              <p className="mb-2 text-[11px] font-extrabold text-faint">{title}</p>
              {rows.length === 0 ? (
                <p className="py-2 text-center text-xs text-faint">기록 없음</p>
              ) : (
                <ol className="space-y-1">
                  {rows.map((r, i) => (
                    <li key={r.username} className="flex items-center gap-2 text-xs">
                      <span className="w-5 font-black text-muted">{i + 1}</span>
                      <span className="truncate font-bold text-content">{r.nickname}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-faint">
                        {formatElapsed(r.elapsedMs)} · {r.tries}번
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
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
