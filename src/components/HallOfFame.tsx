"use client";

import { useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

export type HallEntry = {
  rank: number;
  username: string;
  nickname: string;
  avatar: string | null;
  badge: string | null;
  value: string;
  isMe?: boolean;
};

export type HallCategory = {
  key: string;
  label: string;
  icon: string;
  entries: HallEntry[];
  myEntry?: HallEntry;
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
                  e.isMe
                    ? "border-emerald-300 bg-emerald-50/70"
                    : i < 3
                      ? "border-brand-200 bg-brand-50/40"
                      : "border-line bg-surface"
                }`}
              >
                <span className="grid w-7 shrink-0 place-items-center text-base font-black text-faint">
                  {e.rank <= 3 ? MEDALS[e.rank - 1] : e.rank}
                </span>
                <Avatar name={e.nickname} avatar={e.avatar} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-content">
                    {e.isMe && (
                      <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">
                        나
                      </span>
                    )}
                    <span className="truncate">
                    {e.badge ? `${e.badge} ` : ""}
                    {e.nickname}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-brand-600">{e.value}</span>
              </Link>
            </li>
          ))}
          {current.myEntry && (
            <li className="pt-2">
              <Link
                href={`/u/${encodeURIComponent(current.myEntry.username)}`}
                className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 px-3 py-2.5 transition hover:bg-emerald-50"
              >
                <span className="grid w-10 shrink-0 place-items-center text-sm font-black text-emerald-600">
                  {current.myEntry.rank}위
                </span>
                <Avatar
                  name={current.myEntry.nickname}
                  avatar={current.myEntry.avatar}
                  size={34}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-content">
                    <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white">
                      나
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-emerald-600">
                      내 순위
                    </span>
                    <span className="truncate">
                      {current.myEntry.badge ? `${current.myEntry.badge} ` : ""}
                      {current.myEntry.nickname}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-brand-600">
                  {current.myEntry.value}
                </span>
              </Link>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
