"use client";

import { useState } from "react";
import { ARACONS } from "@/lib/aracon";

export default function AraconPicker({
  onPick,
  compact = false,
  variant = "text",
  align = "right",
  placement = "bottom",
}: {
  onPick: (token: string) => void;
  compact?: boolean;
  variant?: "text" | "icon";
  align?: "left" | "right";
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<0 | 1>(0);
  const isIcon = variant === "icon";
  const visibleAracons = ARACONS.slice(tab * 16, tab * 16 + 16);
  const placementClass = placement === "top" ? "bottom-full mb-2" : "mt-2";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          isIcon
            ? "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-line bg-subtle text-lg transition hover:border-brand-300 hover:bg-brand-50"
            : "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle hover:text-content"
        }
        aria-label="아라콘 선택"
        title="아라콘"
      >
        {isIcon ? "🧊" : "🧊 아라콘"}
      </button>
      {open && (
        <div
          className={`absolute z-[100] max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-xl ${placementClass} ${
            align === "right" ? "right-0" : "left-0"
          } ${compact ? "w-72" : "w-80"}`}
        >
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
            {(["아라콘1", "아라콘2"] as const).map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setTab(index as 0 | 1)}
                className={`rounded-lg px-2 py-1.5 text-xs font-extrabold transition ${
                  tab === index
                    ? "bg-surface text-brand-600 shadow-sm"
                    : "text-faint hover:bg-surface/70 hover:text-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {visibleAracons.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onPick(item.token);
                  setOpen(false);
                }}
                className="group rounded-xl border border-transparent bg-subtle p-1 transition hover:border-brand-300 hover:bg-brand-50"
                title={`${item.label} ${item.token}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.src} alt={item.label} className="mx-auto h-14 w-14 object-contain" />
                <span className="block truncate text-[10px] font-bold text-faint group-hover:text-brand-600">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
