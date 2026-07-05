"use client";

import { useEffect, useRef, useState } from "react";
import { resolveMining, type MineResolve } from "@/app/actions/mining";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const STRIKES = 3; // 광맥을 깨뜨리는 데 필요한 곡괭이질 횟수
// 타격 1회당 점수: 정타 2 · 약타 1 · 빗나감 0 (최대 6)
// 합산 점수 → 즉시(center) / 2분(side) / 5분(miss)
const INSTANT_SCORE = 5; // 정타 2 + 정타 2 + 약타 1 이상
const PARTIAL_SCORE = 2;

type Hit = "정타" | "약타" | "빗나감";

export default function MiningGame({
  rarity,
  difficulty,
  drainSlow = 0,
  onDone,
}: {
  rarity: string;
  difficulty: number;
  drainSlow?: number; // '솜씨 발휘' — 마커 이동 속도를 N% 늦춤 (0~50)
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"playing" | "resolving" | "result">("playing");
  const [result, setResult] = useState<MineResolve | null>(null);
  const [strike, setStrike] = useState(0);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const markerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const busyRef = useRef(false);
  const rafRef = useRef(0);

  const d = Math.max(0, Math.min(1, difficulty));
  const centerHalf = lerp(0.08, 0.025, d);
  const sideHalf = lerp(0.26, 0.11, d);

  useEffect(() => {
    const slow = Math.max(0, Math.min(50, drainSlow));
    const speed = lerp(0.6, 1.9, d) * (1 - slow / 100); // 초당 왕복 비율
    let pos = 0;
    let dir = 1;
    let last = performance.now();
    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      pos += dir * speed * dt;
      if (pos >= 1) { pos = 1; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      posRef.current = pos;
      if (markerRef.current) markerRef.current.style.left = `${pos * 100}%`;
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [d, drainSlow]);

  async function finish(total: number) {
    busyRef.current = true;
    cancelAnimationFrame(rafRef.current);
    const zone = total >= INSTANT_SCORE ? "center" : total >= PARTIAL_SCORE ? "side" : "miss";
    setPhase("resolving");
    const res = await resolveMining(zone);
    setResult(res);
    setPhase("result");
  }

  function strikeNow() {
    if (busyRef.current || phase !== "playing") return;
    const dist = Math.abs(posRef.current - 0.5);
    const hit: Hit = dist <= centerHalf ? "정타" : dist <= sideHalf ? "약타" : "빗나감";
    const gain = hit === "정타" ? 2 : hit === "약타" ? 1 : 0;
    const nextScore = score + gain;
    const nextStrike = strike + 1;
    setScore(nextScore);
    setStrike(nextStrike);
    setHits((prev) => [...prev, hit]);
    if (nextStrike >= STRIKES) void finish(nextScore);
  }

  const centerW = centerHalf * 2 * 100;
  const sideW = sideHalf * 2 * 100;
  const crackPct = Math.min(100, Math.round((score / (STRIKES * 2)) * 100));

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
              곡괭이질 <b className="text-amber-300">{Math.min(strike + 1, STRIKES)}/{STRIKES}</b> ·{" "}
              <b className="text-rose-300">정중앙</b>=정타 · <b className="text-amber-300">주황</b>=약타
            </p>

            {/* 균열 게이지 */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-amber-200/70">
                <span>균열</span>
                <span>{crackPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all"
                  style={{ width: `${crackPct}%` }}
                />
              </div>
            </div>

            <div className="relative mx-auto h-12 w-full overflow-hidden rounded-2xl border border-stone-700 bg-stone-900">
              {/* 약타(주황) 존 */}
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-amber-500/25"
                style={{ width: `${sideW}%` }}
              />
              {/* 정타(빨강) 존 */}
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-rose-500/45"
                style={{ width: `${centerW}%` }}
              />
              {/* 마커 */}
              <div
                ref={markerRef}
                className="absolute inset-y-0 w-1 -translate-x-1/2 bg-amber-200 shadow-[0_0_8px_rgba(253,230,138,0.9)]"
                style={{ left: "0%" }}
              />
            </div>

            {/* 타격 기록 */}
            <div className="mt-3 flex justify-center gap-1.5">
              {Array.from({ length: STRIKES }).map((_, i) => {
                const h = hits[i];
                const tone =
                  h === "정타"
                    ? "bg-rose-500/80 text-white"
                    : h === "약타"
                      ? "bg-amber-500/80 text-stone-900"
                      : h === "빗나감"
                        ? "bg-stone-700 text-stone-400"
                        : "bg-stone-800 text-stone-600";
                return (
                  <span key={i} className={`rounded-md px-2 py-0.5 text-[11px] font-black ${tone}`}>
                    {h ?? "·"}
                  </span>
                );
              })}
            </div>

            <button
              type="button"
              onClick={strikeNow}
              disabled={phase === "resolving"}
              className="mt-5 w-full rounded-2xl border border-stone-600 bg-stone-700 py-4 text-base font-black text-white transition active:bg-stone-600 disabled:opacity-50"
            >
              {phase === "resolving" ? "처리 중…" : "⛏️ 곡괭이질!"}
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
                <p className="mt-1 text-xs text-amber-200/80">판매가 {result.sell}G · +숙련도 {result.exp}</p>
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
