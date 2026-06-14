"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { challengeDungeon, type DungeonResult } from "@/app/actions/dungeon";

export type DungeonView = {
  id: string;
  name: string;
  dc: number;
  exp: number;
  floor: number;
  rewards: string[];
};
export type DungeonAbility = { label: string; mod: number | null };

function DungeonCard({
  d,
  abilities,
  disabled,
  onResult,
}: {
  d: DungeonView;
  abilities: DungeonAbility[];
  disabled: boolean;
  onResult: () => void;
}) {
  const [ability, setAbility] = useState(abilities[0]?.label ?? "근력");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<DungeonResult | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true);
    const r = await challengeDungeon(d.id, ability);
    setRes(r);
    setBusy(false);
    if (r && "ok" in r) onResult();
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-content">
            {d.name} <span className="text-[11px] font-bold text-faint">{d.floor}층</span>
          </p>
          <p className="text-[11px] text-faint">
            달성치 {d.dc} · 경험점 +{d.exp}
            {d.rewards.length > 0 && ` · 성공 보상 ${d.rewards.join(", ")}`}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
        <select
          value={ability}
          onChange={(e) => setAbility(e.target.value)}
          disabled={disabled || busy}
          className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-content outline-none disabled:opacity-50"
        >
          {abilities.map((a) => (
            <option key={a.label} value={a.label}>
              {a.label} {a.mod != null ? `(${a.mod >= 0 ? "+" : ""}${a.mod})` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={go}
          disabled={disabled || busy}
          className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-500 disabled:opacity-50"
        >
          {busy ? "도전 중…" : "⚔️ 도전"}
        </button>
      </div>
      {res && "error" in res && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{res.error}</p>
      )}
      {res && "ok" in res && (
        <p className={`mt-2 text-xs font-bold ${res.success ? "text-emerald-600" : "text-stone-500"}`}>
          🎲 {res.dice.join("+")}
          {res.mod >= 0 ? "+" : ""}
          {res.mod}={res.total} / {res.dc} —{" "}
          {res.success ? `성공! ${res.rewards.join(", ") || ""} 획득` : "실패"} · 경험점 +{res.exp}
        </p>
      )}
    </div>
  );
}

export default function DungeonPanel({
  dungeons,
  runsLeft,
  abilities,
}: {
  dungeons: DungeonView[];
  runsLeft: number;
  abilities: DungeonAbility[];
}) {
  const router = useRouter();
  if (dungeons.length === 0) return null;

  return (
    <div className="space-y-2 rounded-3xl border border-rose-300 bg-rose-50 p-4 shadow-sm">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold text-rose-800">⚔️ 던전</h2>
        <span className="text-[11px] font-bold text-rose-600">
          이번 주 {runsLeft}/3 남음 · AP 60
        </span>
      </div>
      {runsLeft <= 0 && (
        <p className="px-1 text-[11px] text-rose-500">
          이번 주 도전을 다 썼어요. 월요일 05시에 초기화돼요.
        </p>
      )}
      {dungeons.map((d) => (
        <DungeonCard
          key={d.id}
          d={d}
          abilities={abilities}
          disabled={runsLeft <= 0}
          onResult={() => router.refresh()}
        />
      ))}
    </div>
  );
}
