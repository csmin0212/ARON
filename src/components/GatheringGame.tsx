"use client";

import { useEffect, useRef, useState } from "react";
import { resolveGathering, type GatherResolve } from "@/app/actions/gathering";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function expText(result: { exp: number; expBase?: number }): string {
  return result.expBase != null && result.expBase !== result.exp
    ? `${result.expBase}→${result.exp}`
    : String(result.exp);
}

export default function GatheringGame({
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
  const [result, setResult] = useState<GatherResolve | null>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const doneRef = useRef(false);
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

  async function stop() {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    const dist = Math.abs(posRef.current - 0.5);
    const zone = dist <= centerHalf ? "center" : dist <= sideHalf ? "side" : "miss";
    setPhase("resolving");
    const res = await resolveGathering(zone);
    setResult(res);
    setPhase("result");
  }

  // 존을 % 폭으로 (0.5 중심)
  const centerW = centerHalf * 2 * 100;
  const sideW = sideHalf * 2 * 100;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="채집"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-emerald-900/60 bg-stone-950 text-emerald-50 shadow-2xl"
      >
        <div className="border-b border-emerald-900/50 bg-stone-900/80 px-5 py-3 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-300/70">Gathering</p>
          <h3 className="mt-0.5 text-xl font-black">🌿 풀숲을 뒤진다</h3>
          <p className="mt-0.5 text-xs text-emerald-200/70">희귀도 {rarity} · 난이도 {Math.round(d * 100)}</p>
        </div>

        {phase !== "result" ? (
          <div className="px-5 py-6">
            <p className="mb-3 text-center text-xs text-emerald-200/80">
              <b className="text-rose-300">빨강(정중앙)</b>=즉시 · <b className="text-amber-300">주황</b>=2분 · 바깥=5분 탐색
            </p>
            <div className="relative mx-auto h-12 w-full overflow-hidden rounded-2xl border border-emerald-800/70 bg-stone-900">
              {/* 주황 존 */}
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-amber-500/25"
                style={{ width: `${sideW}%` }}
              />
              {/* 빨강 존 */}
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2 bg-rose-500/45"
                style={{ width: `${centerW}%` }}
              />
              {/* 마커 */}
              <div
                ref={markerRef}
                className="absolute inset-y-0 w-1 -translate-x-1/2 bg-emerald-200 shadow-[0_0_8px_rgba(167,243,208,0.9)]"
                style={{ left: "0%" }}
              />
            </div>
            <button
              type="button"
              onClick={stop}
              disabled={phase === "resolving"}
              className="mt-5 w-full rounded-2xl border border-emerald-700 bg-emerald-700/70 py-4 text-base font-black text-white transition active:bg-emerald-600 disabled:opacity-50"
            >
              {phase === "resolving" ? "처리 중…" : "✋ 멈추기!"}
            </button>
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            {result && "error" in result ? (
              <p className="text-sm font-bold text-rose-300">{result.error}</p>
            ) : result && "mode" in result && result.mode === "instant" ? (
              <>
                <div className="mb-2 text-5xl">🌿</div>
                <p className="text-lg font-black text-rose-300">정확히 채집!</p>
                <p className="mt-1 text-sm font-bold">[{result.rarity}] {result.name}</p>
                <p className="mt-1 text-xs text-emerald-200/80">판매가 {result.sell}G · +숙련도 {expText(result)}</p>
              </>
            ) : result && "mode" in result ? (
              <>
                <div className="mb-2 text-5xl">🔍</div>
                <p className="text-lg font-black text-amber-300">탐색 시작</p>
                <p className="mt-1 text-sm text-emerald-100">
                  {Math.round(result.waitSec / 60)}분 뒤 수확할 수 있어요. 자유롭게 돌아다녀도 돼요.
                </p>
              </>
            ) : null}
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
