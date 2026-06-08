"use client";

import { useTransition } from "react";
import { deletePost } from "@/app/actions/posts";

export default function PostActions({
  postId,
  isMine,
  anonHasPass,
}: {
  postId: number;
  isMine: boolean;
  anonHasPass: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!isMine && !anonHasPass) return null;

  function handleDelete() {
    let password = "";
    if (!isMine && anonHasPass) {
      password = window.prompt("게시글 비밀번호를 입력하세요") ?? "";
      if (!password) return;
    } else if (!window.confirm("게시글을 삭제할까요?")) {
      return;
    }
    const fd = new FormData();
    fd.set("id", String(postId));
    fd.set("password", password);
    startTransition(() => {
      void deletePost(fd);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-faint transition hover:bg-rose-50 hover:text-rose-500 disabled:opacity-50"
    >
      🗑 삭제
    </button>
  );
}
