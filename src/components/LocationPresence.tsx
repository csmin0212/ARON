"use client";

import Link from "next/link";
import Avatar from "./Avatar";
import { useWorldSync } from "./WorldSyncProvider";
import type { PresencePerson } from "@/app/api/world/presence/route";

// 현재 위치의 모험가 목록 — 통합 폴링(WorldSyncProvider)에서 받아 갱신.
// (장소 변경 시 page에서 key로 리마운트되어 initial이 갱신됨)
export default function LocationPresence({ initial }: { initial: PresencePerson[] }) {
  const sync = useWorldSync();
  const people = sync?.people ?? initial;

  const me = people.find((p) => p.isMe);
  const others = people.filter((p) => !p.isMe);

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
        👥 이곳의 모험가 <span className="text-brand-500">{people.length}</span>
      </h2>
      <ul className="space-y-1.5">
        {me && (
          <li className="flex items-center gap-2.5 rounded-xl bg-brand-50/60 px-3 py-2">
            <Avatar name={me.nickname} avatar={me.avatar} size={26} />
            <span className="truncate text-sm font-bold text-content">{me.nickname}</span>
            <span className="ml-auto rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
              나
            </span>
          </li>
        )}
        {others.map((o) => (
          <li
            key={o.username}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-subtle"
          >
            <Avatar name={o.nickname} avatar={o.avatar} size={26} />
            <Link
              href={`/u/${encodeURIComponent(o.username)}`}
              className="truncate text-sm font-bold text-content transition hover:text-brand-600 hover:underline"
            >
              {o.nickname}
            </Link>
          </li>
        ))}
      </ul>
      {others.length === 0 && (
        <p className="mt-1 px-3 text-xs text-faint">지금은 혼자 있어요.</p>
      )}
    </div>
  );
}
