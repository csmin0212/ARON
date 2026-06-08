"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createComment, type CommentState } from "@/app/actions/comments";

const smallInput =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function CommentForm({
  postId,
  parentId,
  isLoggedIn,
  compact = false,
  onSuccess,
  autoFocus = false,
}: {
  postId: number;
  parentId?: number;
  isLoggedIn: boolean;
  compact?: boolean;
  onSuccess?: () => void;
  autoFocus?: boolean;
}) {
  const [state, formAction, pending] = useActionState<CommentState, FormData>(
    createComment,
    undefined,
  );
  const [content, setContent] = useState("");
  const [asAnon, setAsAnon] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.ok) {
      setContent("");
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  const showAnon = !isLoggedIn || asAnon;

  return (
    <form
      action={formAction}
      className={`rounded-2xl border border-line bg-surface ${compact ? "p-3" : "p-4"}`}
    >
      <input type="hidden" name="postId" value={postId} />
      {parentId != null && <input type="hidden" name="parentId" value={parentId} />}
      {isLoggedIn && asAnon && <input type="hidden" name="asAnon" value="on" />}

      <textarea
        ref={taRef}
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={compact ? 2 : 3}
        maxLength={2000}
        placeholder={parentId != null ? "답글을 입력하세요" : "댓글을 입력하세요"}
        className="w-full resize-y rounded-lg bg-subtle p-3 text-sm outline-none transition focus:bg-surface focus:ring-2 focus:ring-brand-100"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {showAnon && (
            <>
              <input name="anonNick" maxLength={12} placeholder="ㅇㅇ" className={`${smallInput} w-24`} />
              <input
                name="anonPass"
                type="password"
                maxLength={20}
                placeholder="비밀번호"
                className={`${smallInput} w-28`}
              />
            </>
          )}
          {isLoggedIn && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-faint">
              <input
                type="checkbox"
                checked={asAnon}
                onChange={(e) => setAsAnon(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-brand-500"
              />
              익명
            </label>
          )}
        </div>

        <button
          type="submit"
          disabled={pending || content.trim().length === 0}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
        >
          {pending ? "등록 중…" : "등록"}
        </button>
      </div>

      {state?.error && (
        <p className="mt-2 text-sm font-medium text-rose-500">{state.error}</p>
      )}
    </form>
  );
}
