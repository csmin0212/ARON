"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";

type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  user: { username: string; nickname: string; avatar: string | null };
  charName: string | null;
};

const POLL_MS = 4000;

function timeOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function WorldChat({
  locationName,
  myUsername,
}: {
  locationName: string;
  myUsername: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const stickToBottomRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  const append = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) return;
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = incoming.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        const next = [...prev, ...fresh].slice(-200);
        lastIdRef.current = next[next.length - 1].id;
        return next;
      });
      requestAnimationFrame(scrollToBottom);
    },
    [scrollToBottom],
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/world/chat?after=${lastIdRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[] };
      if (data.messages) append(data.messages);
    } catch {
      /* 네트워크 일시 오류는 다음 폴링에서 회복 */
    }
  }, [append]);

  useEffect(() => {
    void poll(); // 첫 로드
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/world/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok || !data.message) {
        setError(data.error ?? "전송에 실패했어요.");
      } else {
        setInput("");
        stickToBottomRef.current = true;
        append([data.message]);
      }
    } catch {
      setError("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[28rem] flex-col rounded-3xl border border-line bg-surface shadow-sm sm:h-[32rem]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-extrabold text-content">
          💬 {locationName} 채팅
        </h2>
        <span className="text-[11px] text-faint">같은 장소의 모험가에게만 보여요</span>
      </div>

      {/* 메시지 목록 */}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-faint">
            아직 대화가 없어요. 첫 마디를 건네보세요!
          </p>
        )}
        {messages.map((m) => {
          const mine = m.user.username === myUsername;
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <Link href={`/u/${encodeURIComponent(m.user.username)}`} className="shrink-0">
                <Avatar name={m.user.nickname} avatar={m.user.avatar} size={32} />
              </Link>
              <div className={`min-w-0 max-w-[75%] ${mine ? "text-right" : ""}`}>
                <p className="mb-0.5 text-[11px] text-faint">
                  <span className="font-bold text-muted">{m.user.nickname}</span>
                  {m.charName && <span className="ml-1">({m.charName})</span>}
                  <span className="ml-1.5">{timeOf(m.createdAt)}</span>
                </p>
                <p
                  className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed ${
                    mine
                      ? "rounded-tr-sm bg-brand-500 text-white"
                      : "rounded-tl-sm bg-subtle text-content"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 입력 */}
      <form onSubmit={send} className="border-t border-line p-3">
        {error && <p className="mb-2 px-1 text-xs font-medium text-rose-500">{error}</p>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="메시지를 입력하세요…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-subtle px-4 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </form>
    </div>
  );
}
