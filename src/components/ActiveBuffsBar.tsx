"use client";

import { useEffect, useState } from "react";

import { formatTime } from "@/lib/format";
import EffectIcons, { type EffectIconItem, type EffectTone } from "./EffectIcons";

export type WorldBuff = {
  icon: string;
  label: string;
  until?: string | null;
  source?: "event" | "food" | "potion" | "lantern";
  detail?: string; // 상세에만 보이는 부연 (등불 이름 등)
};

const CATEGORY: Record<EffectTone, string> = {
  event: "요일 이벤트",
  lantern: "등불",
  food: "음식",
  potion: "포션",
};

export default function ActiveBuffsBar({ buffs }: { buffs: WorldBuff[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 15_000);
    tick();
    return () => clearInterval(t);
  }, []);

  const alive = now == null ? buffs : buffs.filter((buff) => !buff.until || Date.parse(buff.until) > now);
  if (alive.length === 0) return null;

  const minutesLeft = (iso: string | null | undefined) =>
    now == null || !iso ? null : Math.max(1, Math.ceil((Date.parse(iso) - now) / 60_000));

  // 표시 순서: 이벤트 → 등불 → 음식 → 포션
  const order: EffectTone[] = ["event", "lantern", "food", "potion"];
  const items: EffectIconItem[] = order.flatMap((tone) =>
    alive
      .filter((buff) => (buff.source ?? "food") === tone)
      .map((buff, i) => {
        const left = minutesLeft(buff.until);
        return {
          id: `${tone}-${i}-${buff.label}`,
          icon: buff.icon,
          tone,
          category: CATEGORY[tone],
          title: buff.label,
          lines: [
            ...(buff.detail ? [buff.detail] : []),
            ...(buff.until ? [`${formatTime(buff.until)}까지${left != null ? ` · ${left}분 남음` : ""}`] : []),
          ],
          badge: left == null ? undefined : left >= 60 ? `${Math.floor(left / 60)}h` : `${left}m`,
        };
      }),
  );

  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-sm">
      <EffectIcons items={items} label="효과" />
    </div>
  );
}
