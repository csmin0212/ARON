"use client";

import { useState } from "react";
import { ARACONS } from "@/lib/aracon";

export default function AraconPicker({
  onPick,
  compact = false,
  variant = "text",
  align = "right",
}: {
  onPick: (token: string) => void;
  compact?: boolean;
  variant?: "text" | "icon";
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const isIcon = variant === "icon";

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
          className={`absolute z-30 mt-2 rounded-2xl border border-line bg-surface p-2 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          } ${compact ? "w-72" : "w-80"}`}
        >
          <div
            className={`mb-2 border-b border-line px-1 pb-1.5 text-[11px] font-extrabold text-muted ${
              isIcon ? "sr-only" : ""
            }`}
          >
            아라콘
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ARACONS.map((item) => (
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
