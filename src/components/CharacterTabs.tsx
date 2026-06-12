"use client";

import { useState, type ReactNode } from "react";

// 캐릭터 페이지 탭 — 서버 컴포넌트가 각 탭 내용을 JSX 로 넘겨준다
export default function CharacterTabs({
  tabs,
  badges = {},
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
  badges?: Record<string, number>;
}) {
  const [active, setActive] = useState(tabs[0]?.key);

  return (
    <div>
      <div className="mb-4 flex gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`relative flex-1 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              active === t.key
                ? "bg-brand-500 text-white shadow-sm"
                : "text-muted hover:bg-subtle hover:text-content"
            }`}
          >
            {t.label}
            {(badges[t.key] ?? 0) > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-extrabold text-white shadow">
                {badges[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? "animate-fadeup space-y-5" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
