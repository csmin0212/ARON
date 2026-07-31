"use client";

import { useEffect, useRef } from "react";

// 인터벌 폴링 — 서버 호출을 최소로 깎기 위해 세 겹으로 거른다.
//
//  1) 탭이 백그라운드(document.hidden)면 건너뛴다.
//  2) 화면에 떠 있어도 idleMs 동안 아무 조작이 없으면 멈춘다.
//  3) 바뀐 게 없으면 간격을 minMs → maxMs 로 점점 늘린다(백오프).
//     새 내용이 오거나 유저가 뭔가 하면 즉시 minMs 로 되돌린다.
//
// (2)가 제일 크다. document.hidden 은 탭을 가리거나 창을 최소화해야 true 가 되므로,
// 보조 모니터에 창을 띄워두고 자리를 비우면 12초마다 하루 7,200회를 계속 쓴다.
// (3)은 "조용한 시간"의 호출을 5분의 1로 줄인다 — RP 는 대화가 몰렸다 끊겼다 하므로
// 고정 간격은 대부분의 시간을 빈 응답에 쓴다.
//
// fn 이 true 를 돌려주면 '바뀐 게 있다'는 뜻으로 보고 백오프를 초기화한다.

const DEFAULT_IDLE_MS = 2 * 60_000;
const BACKOFF_FACTOR = 1.6;

export type PollOptions = {
  /** 활발할 때 간격 */
  minMs: number;
  /** 조용할 때까지 늘어나는 상한 (생략 시 백오프 없음) */
  maxMs?: number;
  /** 이 시간 동안 조작이 없으면 폴링 정지 */
  idleMs?: number;
};

// 읽는 중(스크롤·커서 이동)도 '사용 중'으로 본다 — 채팅을 눈으로만 따라가는 시간이 길어서.
const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "mousemove",
  "scroll",
] as const;

export function usePolling(
  fn: () => void | boolean | Promise<void | boolean>,
  interval: number | PollOptions,
  enabled = true,
) {
  const fnRef = useRef(fn);
  // 렌더 중에 Date.now() 를 부르지 않도록 0 으로 두고 효과 안에서 채운다.
  const lastActiveRef = useRef(0);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const minMs = typeof interval === "number" ? interval : interval.minMs;
  const maxMs = typeof interval === "number" ? interval : (interval.maxMs ?? interval.minMs);
  const idleMs = typeof interval === "number" ? DEFAULT_IDLE_MS : (interval.idleMs ?? DEFAULT_IDLE_MS);

  useEffect(() => {
    if (!enabled) return;
    lastActiveRef.current = Date.now();

    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = minMs;
    let stopped = false;

    const isIdle = () => Date.now() - lastActiveRef.current > idleMs;
    const schedule = (ms: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (stopped) return;
      const skip = (typeof document !== "undefined" && document.hidden) || isIdle();
      if (skip) {
        // 쉬는 동안엔 가장 긴 간격으로만 다시 확인한다 (네트워크는 안 탄다)
        schedule(maxMs);
        return;
      }
      let changed = false;
      try {
        changed = (await fnRef.current()) === true;
      } catch {
        /* 다음 차례에 회복 */
      }
      delay = changed ? minMs : Math.min(maxMs, Math.round(delay * BACKOFF_FACTOR));
      schedule(delay);
    }

    // 유저가 뭔가 했다 = 지금 보고 있다. 백오프를 풀고 즉시 최신화한다.
    const wake = () => {
      const wasResting = isIdle();
      lastActiveRef.current = Date.now();
      if (!wasResting || document.hidden) return;
      delay = minMs;
      void tick();
    };
    const markActive = () => {
      lastActiveRef.current = Date.now();
    };
    const onVisible = () => {
      if (document.hidden) return;
      lastActiveRef.current = Date.now();
      delay = minMs;
      void tick();
    };

    void tick(); // 초기 1회
    document.addEventListener("visibilitychange", onVisible);
    // 자리 비움 복귀만 즉시 반영하고, 그 외의 잦은 이벤트는 타임스탬프만 갱신한다.
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake, { passive: true });
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, markActive, { passive: true });
    }
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, markActive);
    };
  }, [minMs, maxMs, idleMs, enabled]);
}
