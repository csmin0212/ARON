"use client";

import { useEffect, useRef } from "react";

// 인터벌 폴링 — 단, 탭이 백그라운드(document.hidden)면 네트워크 호출을 건너뛴다.
// 다시 보이면 즉시 1회 실행. 탭만 열어두고 자리를 비운 유저의 상시 egress를 없앤다.
export function usePolling(fn: () => void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fnRef.current();
    };
    const onVisible = () => {
      if (!document.hidden) fnRef.current();
    };
    run(); // 초기 1회
    const timer = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
