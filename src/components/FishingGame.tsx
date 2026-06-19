"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveFishing, type FishingResolve } from "@/app/actions/fishing";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// 시작 위치 — 낚싯대(캐치존)와 물고기 모두 중간에서. 시작 직후 억까 방지.
const START_BAR = 0.5;
const START_FISH = 0.5;
const START_PROG = 0.4;

export default function FishingGame({
  rarity,
  difficulty,
  barBonus = 0,
  onDone,
}: {
  rarity: string;
  difficulty: number;
  barBonus?: number;
  onDone: () => void;
}) {
  // ready: 시작 대기(일시정지) · playing: 진행 · resolving/result: 결과
  const [phase, setPhase] = useState<"ready" | "playing" | "resolving" | "result">("ready");
  const [result, setResult] = useState<FishingResolve | null>(null);
  const fishRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const holdRef = useRef(false);
  const rafRef = useRef(0);
  const doneRef = useRef(false);

  // 캐치존 반높이 — 미리보기(ready)와 게임 루프가 같은 값을 쓰도록 본문에서 계산.
  const barH = useMemo(() => {
    const d = Math.max(0, Math.min(1, difficulty));
    return Math.min(0.34, Math.max(0.05, lerp(0.2, 0.075, d) + barBonus));
  }, [difficulty, barBonus]);

  // 누르면 ready→playing 으로 시작하고, 누르는 동안 낚싯대를 끌어올린다.
  const beginHold = useCallback(() => {
    setPhase((p) => (p === "ready" ? "playing" : p));
    holdRef.current = true;
  }, []);
  const endHold = useCallback(() => {
    holdRef.current = false;
  }, []);

  // 스페이스바 — ready에서 누르면 시작, 진행 중엔 끌어올리기. (항상 활성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); beginHold(); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") endHold(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginHold, endHold]);

  // 게임 루프 — 시작(playing) 했을 때만 돈다.
  useEffect(() => {
    if (phase !== "playing") return;
    const d = Math.max(0, Math.min(1, difficulty));
    const fishSpeed = lerp(0.5, 1.7, d);
    const retarget = lerp(1.5, 0.5, d);
    const rate = lerp(0.55, 0.3, d);
    const drain = lerp(0.22, 0.42, d);
    const gravity = 2.6;
    const accel = 3.2;
    const drag = 4.5; // 초당 선형 감쇠 (프레임레이트 무관)
    const maxV = 1.3;

    let fishY = START_FISH;
    let fishTarget = START_FISH;
    let retimer = 0;
    let bar = START_BAR;
    let vel = 0;
    let prog = START_PROG;
    let last = performance.now();

    const finish = async (landed: boolean) => {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(rafRef.current);
      setPhase("resolving");
      const res = await resolveFishing(landed);
      setResult(res);
      setPhase("result");
    };

    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      retimer -= dt;
      if (retimer <= 0) {
        fishTarget = Math.random() * 0.9 + 0.05;
        retimer = retarget * (0.5 + Math.random());
      }
      const dir = Math.sign(fishTarget - fishY);
      fishY += dir * Math.min(Math.abs(fishTarget - fishY), fishSpeed * dt);

      vel += (holdRef.current ? accel : -gravity) * dt;
      vel -= vel * drag * dt;
      vel = Math.max(-maxV, Math.min(maxV, vel));
      bar += vel * dt;
      if (bar < barH) { bar = barH; vel = 0; }
      if (bar > 1 - barH) { bar = 1 - barH; vel = 0; }

      const overlap = Math.abs(fishY - bar) <= barH;
      prog += (overlap ? rate : -drain) * dt;
      prog = Math.max(0, Math.min(1, prog));

      if (fishRef.current) fishRef.current.style.bottom = `calc(${fishY * 100}% - 14px)`;
      if (barRef.current) {
        barRef.current.style.bottom = `${(bar - barH) * 100}%`;
        barRef.current.style.height = `${barH * 2 * 100}%`;
        barRef.current.style.background = overlap ? "rgba(34,197,94,0.6)" : "rgba(148,163,184,0.4)";
        barRef.current.style.borderColor = overlap ? "rgba(34,197,94,0.9)" : "rgba(148,163,184,0.6)";
      }
      if (fillRef.current) fillRef.current.style.height = `${prog * 100}%`;

      if (prog >= 1) return void finish(true);
      if (prog <= 0) return void finish(false);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, difficulty, barBonus, barH]);

  const landed = result && "landed" in result && result.landed;
  const ready = phase === "ready";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="낚시"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-sky-900/60 bg-slate-950 text-sky-50 shadow-2xl"
      >
        <div className="border-b border-sky-900/50 bg-slate-900/80 px-5 py-3 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-300/70">Fishing</p>
          <h3 className="mt-0.5 text-xl font-black">🎣 입질이 왔다!</h3>
          <p className="mt-0.5 text-xs text-sky-200/70">희귀도 {rarity} · 난이도 {Math.round(difficulty * 100)}</p>
        </div>

        {phase !== "result" ? (
          <div className="px-5 py-5">
            <p className="mb-3 text-center text-xs text-sky-200/80">
              {ready ? (
                <>준비됐으면 <b className="text-emerald-300">시작</b>을 눌러요. 누를 때까진 멈춰 있어요!</>
              ) : (
                <>꾹 눌러 올리고 떼서 내려요 — <b className="text-emerald-300">초록 칸</b>을 물고기에 맞춰 게이지를 채우세요!</>
              )}
            </p>
            <div
              className="mx-auto flex w-full max-w-[16rem] touch-none select-none gap-3"
              onPointerDown={(e) => { e.preventDefault(); beginHold(); }}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
            >
              {/* 낚시 트랙 */}
              <div className="relative h-72 flex-1 overflow-hidden rounded-2xl border border-sky-800/70 bg-gradient-to-b from-sky-950 to-slate-900">
                <div
                  ref={barRef}
                  className="absolute inset-x-1 rounded-lg border"
                  style={{
                    bottom: `${(0.5 - barH) * 100}%`,
                    height: `${barH * 2 * 100}%`,
                    background: "rgba(148,163,184,0.4)",
                    borderColor: "rgba(148,163,184,0.6)",
                  }}
                />
                <div ref={fishRef} className="absolute left-1/2 -translate-x-1/2 text-2xl" style={{ bottom: "calc(50% - 14px)" }}>
                  🐟
                </div>
                {ready && (
                  <div className="absolute inset-0 grid place-items-center bg-slate-950/40">
                    <span className="animate-pulse rounded-full bg-sky-500/80 px-3 py-1 text-xs font-black text-white">
                      ▶ 시작 대기
                    </span>
                  </div>
                )}
              </div>
              {/* 진행 게이지 */}
              <div className="relative h-72 w-5 overflow-hidden rounded-full border border-sky-800/70 bg-slate-800">
                <div
                  ref={fillRef}
                  className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-emerald-500 to-emerald-300"
                  style={{ height: `${START_PROG * 100}%` }}
                />
              </div>
            </div>
            <button
              type="button"
              className={`mt-4 w-full touch-none rounded-2xl border py-4 text-sm font-black text-sky-50 transition ${
                ready
                  ? "border-emerald-500 bg-emerald-600/80 active:bg-emerald-500"
                  : "border-sky-700 bg-sky-800/60 active:bg-sky-700"
              }`}
              onPointerDown={(e) => { e.preventDefault(); beginHold(); }}
              onPointerUp={endHold}
              onPointerLeave={endHold}
              onPointerCancel={endHold}
            >
              {ready ? "🎣 시작! (또는 스페이스)" : "⬆️ 꾹 눌러 당기기 (또는 스페이스)"}
            </button>
            {phase === "resolving" && (
              <p className="mt-3 text-center text-xs text-sky-200/70">처리 중…</p>
            )}
          </div>
        ) : (
          <div className="px-5 py-6 text-center">
            {result && "error" in result ? (
              <p className="text-sm font-bold text-rose-300">{result.error}</p>
            ) : landed && result && "name" in result ? (
              <>
                <div className="mb-2 text-5xl">🎉</div>
                <p className="text-lg font-black text-emerald-300">잡았다!</p>
                <p className="mt-1 text-sm font-bold">[{result.rarity}] {result.name}</p>
                <p className="mt-1 text-xs text-sky-200/80">
                  크기 {result.size} · 판매가 {result.sell}G · +숙련도 {result.exp}
                </p>
              </>
            ) : (
              <>
                <div className="mb-2 text-5xl">💨</div>
                <p className="text-lg font-black text-sky-200">놓쳤다…</p>
                <p className="mt-1 text-xs text-sky-200/70">미끼만 물고 달아났다. (피로도 절반은 돌려받았어요)</p>
              </>
            )}
            <button
              type="button"
              onClick={onDone}
              className="mt-5 w-full rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
