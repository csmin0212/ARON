"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMining, type MineResolve } from "@/app/actions/mining";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function expText(result: { exp: number; expBase?: number }): string {
  return result.expBase != null && result.expBase !== result.exp
    ? `${result.expBase}→${result.exp}`
    : String(result.exp);
}

// 연타(곡괭이질) — 시작을 누르면 제한 시간이 흐르고, 빠르게 두드려 균열 게이지를 채운다.
// 100% 도달 → 즉시 파괴(center). 시간 종료 시 50%+ → 부분(side), 미만 → 실패(miss).
const TIME_LIMIT = 4.5; // 초
const TAP_GAIN = 6; // 1타당 균열 +6%
const PARTIAL_PCT = 50; // 이 이상이면 부분 성공

export default function MiningGame({
  rarity,
  difficulty,
  onDone,
}: {
  rarity: string;
  difficulty: number;
  drainSlow?: number; // (채광은 감속 특성 없음 — 호환용, 미사용)
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"ready" | "playing" | "resolving" | "result">("ready");
  const [result, setResult] = useState<MineResolve | null>(null);
  const [taps, setTaps] = useState(0);

  const crackRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef(0);
  const remainRef = useRef(TIME_LIMIT);
  const busyRef = useRef(false);
  const rafRef = useRef(0);

  const d = Math.max(0, Math.min(1, difficulty));
  // 난이도 ↑ → 균열이 훨씬 빨리 식는다(초당 감소율). 비선형(d^1.5)이라 저성은 여유·고성은 손이 아주 빨라야.
  const decay = lerp(6, 46, Math.pow(d, 1.5));

  const finish = useCallback(async (zone: "center" | "side" | "miss") => {
    if (busyRef.current) return;
    busyRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setPhase("resolving");
    const res = await resolveMining(zone);
    setResult(res);
    setPhase("result");
  }, []);

  // 게임 루프 — 시작(playing)했을 때만 돈다.
  useEffect(() => {
    if (phase !== "playing") return;
    let last = performance.now();
    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      gaugeRef.current = Math.max(0, gaugeRef.current - decay * dt);
      remainRef.current = Math.max(0, remainRef.current - dt);

      if (crackRef.current) crackRef.current.style.width = `${Math.min(100, gaugeRef.current)}%`;
      if (timeRef.current) timeRef.current.style.width = `${(remainRef.current / TIME_LIMIT) * 100}%`;

      if (gaugeRef.current >= 100) return void finish("center");
      if (remainRef.current <= 0) return void finish(gaugeRef.current >= PARTIAL_PCT ? "side" : "miss");
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, decay, finish]);

  const startGame = useCallback(() => {
    setPhase((p) => {
      if (p !== "ready") return p;
      gaugeRef.current = 0;
      remainRef.current = TIME_LIMIT;
      return "playing";
    });
  }, []);

  const strikeNow = useCallback(() => {
    if (busyRef.current) return;
    gaugeRef.current = Math.min(100, gaugeRef.current + TAP_GAIN);
    setTaps((n) => n + 1);
    if (crackRef.current) crackRef.current.style.width = `${gaugeRef.current}%`;
    if (gaugeRef.current >= 100) void finish("center");
  }, [finish]);

  // 스페이스바 — ready에서 누르면 시작, playing에서 누르면 연타.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (phase === "ready") startGame();
      else if (phase === "playing") strikeNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame, strikeNow]);

  const ready = phase === "ready";
  const playing = phase === "playing";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="채광"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-stone-700/70 bg-stone-950 text-amber-50 shadow-2xl"
      >
        <div className="border-b border-stone-800 bg-stone-900/80 px-5 py-3 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-300/70">Mining</p>
          <h3 className="mt-0.5 text-xl font-black">⛏️ 광맥을 깨뜨린다</h3>
          <p className="mt-0.5 text-xs text-amber-200/70">희귀도 {rarity} · 난이도 {Math.round(d * 100)}</p>
        </div>

        {phase !== "result" ? (
          <div className="px-5 py-6">
            <p className="mb-3 text-center text-xs text-amber-200/80">
              {ready ? (
                <>준비됐으면 <b className="text-emerald-300">시작</b>을 눌러요. 누를 때까진 멈춰 있어요!</>
              ) : (
                <>시간이 끝나기 전에 <b className="text-amber-300">빠르게 연타</b>해 균열을 채워라! · 곡괭이질 {taps}회</>
              )}
            </p>

            {/* 남은 시간 */}
            <div className="mb-2">
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-amber-200/70">
                <span>남은 시간</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-800">
                <div
                  ref={timeRef}
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            {/* 균열 게이지 */}
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-amber-200/70">
                <span>균열</span>
                <span className="text-amber-300/60">50%↑ 부분 · 100% 파괴</span>
              </div>
              <div className="relative h-4 overflow-hidden rounded-full bg-stone-800">
                <div className="absolute inset-y-0 left-1/2 w-px bg-amber-200/50" />
                <div
                  ref={crackRef}
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500"
                  style={{ width: "0%" }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={ready ? startGame : strikeNow}
              onPointerDown={(e) => {
                e.preventDefault();
                if (ready) startGame();
                else if (playing) strikeNow();
              }}
              disabled={phase === "resolving"}
              className={`w-full touch-none select-none rounded-2xl border py-6 text-lg font-black text-white transition active:scale-[0.98] disabled:opacity-50 ${
                ready
                  ? "border-emerald-500 bg-emerald-600/80 active:bg-emerald-500"
                  : "border-stone-600 bg-stone-700 active:bg-amber-600"
              }`}
            >
              {phase === "resolving"
                ? "처리 중…"
                : ready
                  ? "▶ 시작! (또는 스페이스)"
                  : "⛏️ 곡괭이질! (연타 / 스페이스)"}
            </button>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            {result && "error" in result ? (
              <p className="text-sm font-bold text-rose-300">{result.error}</p>
            ) : result && "mode" in result && result.mode === "instant" ? (
              <>
                <div className="mb-2 text-5xl">⛏️</div>
                <p className="text-lg font-black text-rose-300">광맥 파괴!</p>
                <p className="mt-1 text-sm font-bold">[{result.rarity}] {result.name}</p>
                <p className="mt-1 text-xs text-amber-200/80">판매가 {result.sell}G · +숙련도 {expText(result)}</p>
              </>
            ) : result && "mode" in result ? (
              <>
                <div className="mb-2 text-5xl">⛏️</div>
                <p className="text-lg font-black text-amber-300">채굴 시작</p>
                <p className="mt-1 text-sm text-amber-100">
                  {Math.round(result.waitSec / 60)}분 뒤 캐낼 수 있어요. 자유롭게 돌아다녀도 돼요.
                </p>
              </>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full rounded-2xl bg-stone-700 py-3 text-sm font-bold text-white transition hover:bg-stone-600"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
