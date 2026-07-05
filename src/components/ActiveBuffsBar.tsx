"use client";

import { useEffect, useState } from "react";

export type WorldBuff = {
  icon: string;
  label: string; // 예: "낚시 행운 +5", "감지 판정 +1"
  until: string; // ISO — 만료 시각
};

// 월드 화면 상단 — 적용 중인 요리 버프를 남은 시간과 함께 보여준다.
// 마운트 전에는 만료 시각(결정적)만, 마운트 후에는 남은 분을 붙이고 만료분을 걸러낸다.
export default function ActiveBuffsBar({ buffs }: { buffs: WorldBuff[] }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 15_000);
    tick();
    return () => clearInterval(t);
  }, []);

  const alive = now == null ? buffs : buffs.filter((b) => Date.parse(b.until) > now);
  if (alive.length === 0) return null;

  const untilText = (iso: string) =>
    new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const minutesLeft = (iso: string) =>
    now == null ? null : Math.max(1, Math.ceil((Date.parse(iso) - now) / 60_000));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      <span className="text-xs font-extrabold text-muted">🍲 요리 효과</span>
      {alive.map((buff, i) => {
        const left = minutesLeft(buff.until);
        return (
          <span
            key={`${buff.label}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"
          >
            {buff.icon} {buff.label}
            <span className="font-semibold text-emerald-500">
              · {untilText(buff.until)}까지{left != null ? ` (${left}분)` : ""}
            </span>
          </span>
        );
      })}
    </div>
  );
}
