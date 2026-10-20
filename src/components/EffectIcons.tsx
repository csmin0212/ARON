"use client";

import { useState } from "react";

// 효과(이벤트·등불·음식·포션)를 아이콘 한 줄로 — 누르면 아래에 상세가 열린다.
// 문장형 칩을 줄줄이 늘어놓으면 효과가 늘수록 화면을 다 차지해서 접어둔다.

export type EffectTone = "event" | "lantern" | "food" | "potion";

export type EffectIconItem = {
  id: string;
  icon: string;
  tone: EffectTone;
  category: string; // "등불" · "음식" …
  title: string; // 효과 이름
  lines?: string[]; // 상세 줄 (수치·남은 시간·설명)
  badge?: string; // 아이콘 모서리 표시 (남은 분 등)
};

const TONE: Record<EffectTone, { ring: string; badge: string; panel: string; head: string }> = {
  event: {
    ring: "bg-brand-50 ring-brand-200 hover:ring-brand-400",
    badge: "bg-brand-600 text-white",
    panel: "border-brand-200 bg-brand-50/70",
    head: "text-brand-700",
  },
  lantern: {
    ring: "bg-amber-50 ring-amber-200 hover:ring-amber-400",
    badge: "bg-amber-600 text-white",
    panel: "border-amber-200 bg-amber-50/70",
    head: "text-amber-800",
  },
  food: {
    ring: "bg-emerald-50 ring-emerald-200 hover:ring-emerald-400",
    badge: "bg-emerald-600 text-white",
    panel: "border-emerald-200 bg-emerald-50/70",
    head: "text-emerald-800",
  },
  potion: {
    ring: "bg-sky-50 ring-sky-200 hover:ring-sky-400",
    badge: "bg-sky-600 text-white",
    panel: "border-sky-200 bg-sky-50/70",
    head: "text-sky-800",
  },
};

export default function EffectIcons({ items, label }: { items: EffectIconItem[]; label?: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((item) => item.id === openId) ?? null;
  if (items.length === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {label && <span className="mr-0.5 text-xs font-extrabold text-muted">{label}</span>}
        {items.map((item) => {
          const tone = TONE[item.tone];
          const selected = item.id === openId;
          return (
            <button
              key={item.id}
              type="button"
              title={`${item.category} · ${item.title}`}
              aria-label={`${item.category} · ${item.title}`}
              aria-expanded={selected}
              onClick={() => setOpenId(selected ? null : item.id)}
              className={`relative grid h-8 w-8 place-items-center rounded-full text-base ring-1 transition ${tone.ring} ${
                selected ? "scale-110 ring-2" : ""
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.badge && (
                <span
                  className={`absolute -bottom-1 -right-1 rounded-full px-1 text-[9px] font-black leading-[14px] ${tone.badge}`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open && (
        <div className={`mt-2 rounded-xl border px-3 py-2 ${TONE[open.tone].panel}`}>
          <p className={`text-xs font-extrabold ${TONE[open.tone].head}`}>
            {open.icon} {open.category} · {open.title}
          </p>
          {(open.lines ?? []).map((line, i) => (
            <p key={i} className="mt-0.5 text-xs leading-relaxed text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
