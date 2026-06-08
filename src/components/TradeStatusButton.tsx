"use client";

import { useTransition } from "react";
import { toggleTradeStatus } from "@/app/actions/posts";

export default function TradeStatusButton({
  postId,
  status,
  isMine,
  anonHasPass,
}: {
  postId: number;
  status: string | null;
  isMine: boolean;
  anonHasPass: boolean;
}) {
  const [pending, start] = useTransition();
  if (!isMine && !anonHasPass) return null;

  const closed = status === "CLOSED";

  function go() {
    let password = "";
    if (!isMine && anonHasPass) {
      password = window.prompt("거래글 비밀번호를 입력하세요") ?? "";
      if (!password) return;
    }
    const fd = new FormData();
    fd.set("id", String(postId));
    fd.set("password", password);
    start(() => {
      void toggleTradeStatus(fd);
    });
  }

  return (
    <button
      onClick={go}
      disabled={pending}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold shadow-sm transition disabled:opacity-50 ${
        closed
          ? "bg-emerald-500 text-white hover:bg-emerald-600"
          : "bg-subtle-hover text-content hover:bg-subtle"
      }`}
    >
      {closed ? "🔄 판매중으로 변경" : "✅ 거래완료 처리"}
    </button>
  );
}
