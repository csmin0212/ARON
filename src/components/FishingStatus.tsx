"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collectFishing, type PendingFishView } from "@/app/actions/fishing";

export default function FishingStatus({ pending }: { pending: PendingFishView | null }) {
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
    const res = await collectFishing();
    setBusy(false);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-3xl border border-sky-300 bg-sky-50 p-4 shadow-sm">
      <h2 className="mb-2 px-1 text-sm font-extrabold text-sky-800">🎣 다시 입질을 기다리는 중</h2>
      <p className="px-1 text-xs text-sky-700">
        놓친 희귀도 {pending.rarity} 물고기가 다시 물기를 기다려요. 돌아다녀도 계속 진행돼요.
      </p>
      {error && <p className="mt-2 px-1 text-xs font-semibold text-rose-600">{error}</p>}
      {ready ? (
        <button
          type="button"
          onClick={collect}
          disabled={busy}
          className="mt-3 w-full rounded-2xl bg-sky-600 py-3 text-sm font-extrabold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {busy ? "낚는 중…" : "🎣 낚아올리기"}
        </button>
      ) : (
        <div className="mt-3 rounded-2xl bg-sky-100 py-3 text-center text-lg font-black tabular-nums text-sky-800">
          {mm}:{ss.toString().padStart(2, "0")}
        </div>
      )}
    </div>
  );
}
