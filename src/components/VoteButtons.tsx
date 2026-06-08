"use client";

import { useState, useTransition } from "react";
import { votePost, type VoteResult } from "@/app/actions/votes";

export default function VoteButtons({
  postId,
  initial,
}: {
  postId: number;
  initial: VoteResult;
}) {
  const [result, setResult] = useState<VoteResult>(initial);
  const [pending, startTransition] = useTransition();

  function vote(value: 1 | -1) {
    if (pending) return;
    startTransition(async () => {
      const next = await votePost(postId, value);
      setResult(next);
    });
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        onClick={() => vote(1)}
        disabled={pending}
        className={`flex w-24 flex-col items-center gap-0.5 rounded-2xl border px-4 py-3 transition ${
          result.my === 1
            ? "border-rose-300 bg-rose-50"
            : "border-line bg-white hover:border-rose-200 hover:bg-rose-50/50"
        }`}
      >
        <span className="text-lg">👍</span>
        <span className="text-xs font-semibold text-slate-500">추천</span>
        <span className="text-lg font-extrabold text-rose-500">{result.up}</span>
      </button>

      <button
        onClick={() => vote(-1)}
        disabled={pending}
        className={`flex w-24 flex-col items-center gap-0.5 rounded-2xl border px-4 py-3 transition ${
          result.my === -1
            ? "border-slate-300 bg-slate-100"
            : "border-line bg-white hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <span className="text-lg">👎</span>
        <span className="text-xs font-semibold text-slate-500">비추천</span>
        <span className="text-lg font-extrabold text-slate-500">{result.down}</span>
      </button>
    </div>
  );
}
