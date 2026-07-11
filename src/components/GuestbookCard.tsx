"use client";

import { useActionState } from "react";
import { writeGuestbook, type FriendState } from "@/app/actions/friends";

export type GuestbookEntryView = {
  id: number;
  author: string;
  content: string;
  at: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// 집 방명록 — 방문객은 글을 남기고, 주인은 받은 글을 본다
export default function GuestbookCard({
  entries,
  canWrite,
  ownerNickname,
}: {
  entries: GuestbookEntryView[];
  canWrite: boolean;
  ownerNickname: string;
}) {
  const [state, action, pending] = useActionState<FriendState, FormData>(
    writeGuestbook,
    undefined,
  );

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
        📖 {ownerNickname}님네 방명록
      </h2>
      {(state?.error || state?.ok) && (
        <p
          className={`mb-2 rounded-xl px-3 py-2 text-xs font-bold ${
            state.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {state.error ?? state.ok}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="rounded-2xl bg-subtle px-3 py-3 text-xs text-faint">
          아직 방명록이 비어 있어요. 첫 글의 주인공이 되어보세요!
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-line bg-subtle px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                {entry.content}
              </p>
              <p className="mt-1 text-[11px] font-bold text-faint">
                — {entry.author} · {formatDate(entry.at)}
              </p>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <form action={action} className="mt-3 flex gap-2">
          <input
            type="text"
            name="content"
            maxLength={200}
            placeholder="따뜻한 한마디를 남겨보세요 (하루 1회)"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-faint2 focus:border-brand-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            남기기
          </button>
        </form>
      )}
    </div>
  );
}
