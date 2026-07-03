"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collectMining, type PendingMineView } from "@/app/actions/mining";

export default function MiningStatus({ pending }: { pending: PendingMineView | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!pending) return null;

  const remainMs = Math.max(0, pending.readyAt - now);
  const ready = remainMs <= 0;
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);

  async function collect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await collectMining();
    setBusy(false);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-3xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
      <h2 className="mb-2 px-1 text-sm font-extrabold text-amber-800">⛏️ 채굴 중</h2>
      <p className="px-1 text-xs text-amber-700">
        희귀도 {pending.rarity} 광맥을 캐는 중이에요. 돌아다녀도 계속 진행돼요.
      </p>
      {error && <p className="mt-2 px-1 text-xs font-semibold text-rose-600">{error}</p>}
      {ready ? (
        <button
          type="button"
          onClick={collect}
          disabled={busy}
          className="mt-3 w-full rounded-2xl bg-stone-700 py-3 text-sm font-extrabold text-white transition hover:bg-stone-600 disabled:opacity-50"
        >
          {busy ? "수확 중…" : "⛏️ 캐내기"}
        </button>
      ) : (
        <div className="mt-3 rounded-2xl bg-amber-100 py-3 text-center text-lg font-black tabular-nums text-amber-800">
          {mm}:{ss.toString().padStart(2, "0")}
        </div>
      )}
    </div>
  );
}
