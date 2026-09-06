"use client";

import { useCallback, useEffect, useState } from "react";
import { usePolling, type PollOptions } from "@/lib/usePolling";

const SYNC_URL = "/api/sync-sheet";

// 시트 반영은 '바뀐 게 있을 때'만 의미가 있다.
// 예전엔 setInterval 이라 탭이 백그라운드여도 3분마다 DB 를 깨웠다. 탭 하나를 밤새
// 켜두면 하루 480번이라, Neon 컴퓨트가 한 달 내내 자동 정지에 못 들어갔다
// (247 CU-시간 = 월 $26 의 대부분).
// usePolling 이 백그라운드 탭·무조작을 알아서 걸러주고, 반영할 게 없으면 간격을
// 10분까지 늘린다. 탭을 떠날 때 마지막 한 번은 아래 beacon 이 따로 챙긴다.
const POLL: PollOptions = { minMs: 3 * 60_000, maxMs: 10 * 60_000, idleMs: 2 * 60_000 };

// 월드에 머무는 동안 주기적으로 DB→시트 반영을 호출하고, 탭을 떠날 때 마지막으로 한 번 더 보냄.
export default function SheetSync() {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  // true = 실제로 반영함 → 간격을 minMs 로 되돌린다. skipped 면 false 라 간격이 늘어난다.
  const ping = useCallback(async () => {
    try {
      const res = await fetch(SYNC_URL, { method: "POST", keepalive: true });
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean; skipped?: boolean };
      return data.ok === true && data.skipped !== true;
    } catch {
      return false;
    }
  }, []);

  usePolling(ping, POLL);

  useEffect(() => {
    const flush = () => {
      navigator.sendBeacon?.(SYNC_URL);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      // 예전엔 pagehide 리스너를 떼지 않아 언마운트마다 하나씩 쌓였다.
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  async function syncNow() {
    setState("syncing");
    try {
      const res = await fetch(`${SYNC_URL}?force=1`, { method: "POST" });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  const label =
    state === "syncing"
      ? "반영 중..."
      : state === "done"
        ? "반영 완료 ✓"
        : state === "error"
          ? "실패 — 다시 시도"
          : "🔄 지금 시트에 반영";

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={syncNow}
        disabled={state === "syncing"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-subtle px-3.5 py-2.5 text-sm font-bold text-content transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
      >
        {label}
      </button>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-faint">
        가방·골드는 즉시 저장되고, 구글 시트에는 몇 분마다 자동 반영돼요. 바로 맞추려면 위 버튼을 누르세요.
      </p>
    </div>
  );
}
