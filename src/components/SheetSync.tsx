"use client";

import { useEffect, useState } from "react";

const SYNC_URL = "/api/sync-sheet";
const INTERVAL_MS = 3 * 60 * 1000; // 3분

// 월드에 머무는 동안 주기적으로 DB→시트 반영을 호출하고, 탭을 떠날 때 마지막으로 한 번 더 보냄.
export default function SheetSync() {
  const [state, setState] = useState<"idle" | "syncing" | "done" | "error">("idle");

  useEffect(() => {
    const ping = () => {
      fetch(SYNC_URL, { method: "POST", keepalive: true }).catch(() => {});
    };
    const id = setInterval(ping, INTERVAL_MS);

    const flushOnLeave = () => {
      if (document.visibilityState === "hidden") {
        navigator.sendBeacon?.(SYNC_URL);
      }
    };
    document.addEventListener("visibilitychange", flushOnLeave);
    window.addEventListener("pagehide", () => navigator.sendBeacon?.(SYNC_URL));

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", flushOnLeave);
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
        가방·골드는 즉시 저장되고, 구글 시트에는 3분마다 자동 반영돼요. 바로 맞추려면 위 버튼을 누르세요.
      </p>
    </div>
  );
}
