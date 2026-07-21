"use client";

import { useEffect, useState } from "react";

import { formatTime } from "@/lib/format";

export type WorldBuff = {
  icon: string;
  label: string;
  until: string;
  source?: "event" | "food";
};

export default function ActiveBuffsBar({ buffs }: { buffs: WorldBuff[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 15_000);
    tick();
    return () => clearInterval(t);
  }, []);

  const alive = now == null ? buffs : buffs.filter((buff) => Date.parse(buff.until) > now);
  if (alive.length === 0) return null;

  const events = alive.filter((buff) => buff.source === "event");
  const foods = alive.filter((buff) => buff.source !== "event");
  const minutesLeft = (iso: string) =>
    now == null ? null : Math.max(1, Math.ceil((Date.parse(iso) - now) / 60_000));

  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-muted">✨ 요일 이벤트</span>
          {events.map((buff, i) => (
            <span
              key={`event-${buff.label}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700"
            >
              {buff.icon} {buff.label}
            </span>
          ))}
        </div>
      )}

      {foods.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-muted">🍲 음식 버프</span>
          {foods.map((buff, i) => {
            const left = minutesLeft(buff.until);

            return (
              <span
                key={`food-${buff.label}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
              >
                {buff.icon} {buff.label}
                <span className="font-semibold text-emerald-500">
                  · {formatTime(buff.until)}까지{left != null ? ` (${left}분)` : ""}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
