"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

export type HallEntry = {
  username: string;
  nickname: string;
  avatar: string | null;
  badge: string | null;
  value: string;
};

export type HallCategory = {
  key: string;
  label: string;
  icon: string;
  entries: HallEntry[];
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default function HallOfFame({ categories }: { categories: HallCategory[] }) {
  const [active, setActive] = useState(categories[0]?.key ?? "");
  const current = categories.find((c) => c.key === active) ?? categories[0];

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActive(c.key)}
            className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${
              c.key === current?.key
                ? "bg-brand-500 text-white shadow-sm"
                : "bg-subtle text-muted hover:bg-subtle-hover"
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {!current || current.entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-faint">아직 순위에 오른 모험가가 없어요.</p>
      ) : (
        <ol className="space-y-2">
          {current.entries.map((e, i) => (
            <li key={e.username}>
              <Link
                href={`/u/${encodeURIComponent(e.username)}`}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition hover:bg-subtle ${
                  i < 3 ? "border-brand-200 bg-brand-50/40" : "border-line bg-surface"
                }`}
              >
                <span className="grid w-7 shrink-0 place-items-center text-base font-black text-faint">
                  {i < 3 ? MEDALS[i] : i + 1}
                </span>
                <Avatar name={e.nickname} avatar={e.avatar} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-content">
                    {e.badge ? `${e.badge} ` : ""}
                    {e.nickname}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-brand-600">{e.value}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
