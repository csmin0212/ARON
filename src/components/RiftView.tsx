"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { enterRift, exitRift } from "@/app/actions/rift";
import { usePolling } from "@/lib/usePolling";
import type { RiftContext, RiftPerson } from "@/app/api/world/rift/route";

const POLL_MS = 8000;
const EMOJI: Record<string, string> = { "별의 바다": "🌌", "망자의 정원": "🥀", "핏빛 성채": "🩸" };

function Members({ list, capacity }: { list: RiftPerson[]; capacity?: number }) {
  return (
    <ul className="mt-2 space-y-1">
      {list.map((p) => (
        <li key={p.username} className="flex items-center gap-2">
          <Avatar name={p.nickname} avatar={p.avatar} size={22} />
          <span className="truncate text-xs font-bold text-content">{p.nickname}</span>
        </li>
      ))}
      {capacity != null &&
        Array.from({ length: Math.max(0, capacity - list.length) }).map((_, i) => (
          <li key={`empty-${i}`} className="flex items-center gap-2 opacity-50">
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-line text-[10px] text-faint">
              ?
            </span>
            <span className="text-xs text-faint">빈 자리</span>
          </li>
        ))}
    </ul>
  );
}

export default function RiftView({ initial = { mode: "none" } }: { initial?: RiftContext }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<RiftContext>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePolling(() => {
    void (async () => {
      try {
        const res = await fetch("/api/world/rift", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as RiftContext;
        setCtx(data);
      } catch {
        /* 다음 폴링 */
      }
    })();
  }, POLL_MS);

  if (ctx.mode === "none") return null;

  async function act(fn: () => Promise<{ error?: string; ok?: string } | undefined>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res?.error) setError(res.error);
    else router.refresh();
  }

  if (ctx.mode === "inside") {
    return (
      <div className="rounded-3xl border border-violet-300 bg-violet-50 p-4 shadow-sm">
        <h2 className="px-1 text-sm font-extrabold text-violet-800">
          {EMOJI[ctx.type] ?? "🌀"} 균열 내부 — {ctx.type}
        </h2>
        <p className="mt-1 px-1 text-[11px] text-violet-600">함께 들어온 모험가 {ctx.members.length}명</p>
        <Members list={ctx.members} />
        {error && <p className="mt-2 px-1 text-xs font-semibold text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={() => act(() => exitRift())}
          disabled={busy}
          className="mt-3 w-full rounded-2xl bg-violet-600 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {busy ? "…" : "↩️ 균열에서 나가기"}
        </button>
      </div>
    );
  }

  // entry
  const riftId = ctx.riftId;
  return (
    <div className="rounded-3xl border border-fuchsia-300 bg-fuchsia-50 p-4 shadow-sm">
      <h2 className="px-1 text-sm font-extrabold text-fuchsia-800">
        {EMOJI[ctx.type] ?? "⚡"} 균열 출현 — {ctx.type}
      </h2>
      <p className="mt-1 px-1 text-[11px] text-fuchsia-600">
        선착순 {ctx.members.length}/{ctx.capacity}명
      </p>
      <Members list={ctx.members} capacity={ctx.capacity} />
      {error && <p className="mt-2 px-1 text-xs font-semibold text-rose-600">{error}</p>}
      <button
        type="button"
        onClick={() => act(() => enterRift(riftId))}
        disabled={busy || ctx.joined || ctx.full}
        className="mt-3 w-full rounded-2xl bg-fuchsia-600 py-2.5 text-sm font-bold text-white transition hover:bg-fuchsia-500 disabled:opacity-50"
      >
        {ctx.joined ? "이미 진입함" : ctx.full ? "정원 마감 (4/4)" : busy ? "…" : "🌀 균열 진입"}
      </button>
    </div>
  );
}
