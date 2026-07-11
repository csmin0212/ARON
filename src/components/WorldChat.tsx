"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import FishingGame from "./FishingGame";
import GatheringGame from "./GatheringGame";
import MiningGame from "./MiningGame";
import { startFishing } from "@/app/actions/fishing";
import { startGathering } from "@/app/actions/gathering";
import { startMining } from "@/app/actions/mining";
import { discoverByKeyword } from "@/app/actions/world";
import { getPreset, isImageUrl } from "@/lib/avatars";
import { formatFullDate, formatTime } from "@/lib/format";

type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  system: boolean;
  user: { username: string; nickname: string; avatar: string | null } | null;
};

export type ChatActionChip = { kind: string; label: string | null; apCost: number; statLabel?: string | null };

const POLL_MS = 4000;

const KIND_EMOJI: Record<string, string> = {
  채집: "🌿",
  낚시: "🎣",
  채광: "⛏️",
  채굴: "⛏️",
  벌목: "🪓",
  사냥: "🏹",
  휴식: "🛏️",
};

function timeOf(iso: string): string {
  return formatTime(iso);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

function avatarForLog(user: ChatMessage["user"]): string {
  if (!user) return `<span class="av fallback">?</span>`;

  const preset = getPreset(user.avatar);
  if (preset) return `<span class="av emoji">${escapeHtml(preset.emoji)}</span>`;

  if (isImageUrl(user.avatar)) {
    return `<img class="av" src="${escapeHtml(user.avatar as string)}" alt="" referrerpolicy="no-referrer" />`;
  }

  const initial = user.nickname.trim().charAt(0).toUpperCase() || "?";
  return `<span class="av fallback">${escapeHtml(initial)}</span>`;
}

export default function WorldChat({
  locationName,
  myUsername,
  actions = [],
}: {
  locationName: string;
  myUsername: string;
  actions?: ChatActionChip[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const [fishing, setFishing] = useState<{
    rarity: string;
    difficulty: number;
    barBonus: number;
    drainSlow: number;
  } | null>(null);
  const [gathering, setGathering] = useState<{ rarity: string; difficulty: number; drainSlow: number } | null>(null);
  const [mining, setMining] = useState<{ rarity: string; difficulty: number; drainSlow: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState("");
  const [probing, setProbing] = useState(false);

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
        const next = [...prev, ...fresh].slice(-300);
        lastIdRef.current = next[next.length - 1].id;
        return next;
      });
      requestAnimationFrame(scrollToBottom);
    },
    [scrollToBottom],
  );

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/world/chat?after=${lastIdRef.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ChatMessage[] };
      if (data.messages) append(data.messages);
    } catch {
      /* 다음 폴링에서 회복 */
    }
  }, [append]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  async function beginFishing() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await startFishing();
      if ("error" in res) setError(res.error);
      else setFishing({ rarity: res.rarity, difficulty: res.difficulty, barBonus: res.barBonus, drainSlow: res.drainSlow });
    } catch {
      setError("낚시를 시작하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function beginGathering() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await startGathering();
      if ("error" in res) setError(res.error);
      else setGathering({ rarity: res.rarity, difficulty: res.difficulty, drainSlow: res.drainSlow });
    } catch {
      setError("채집을 시작하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function beginMining() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await startMining();
      if ("error" in res) setError(res.error);
      else setMining({ rarity: res.rarity, difficulty: res.difficulty, drainSlow: res.drainSlow });
    } catch {
      setError("채광을 시작하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function matchLifeCmd(kind: string, content: string): boolean {
    return actions.some(
      (a) =>
        a.kind === kind &&
        (norm(content) === norm(`/${a.label ?? a.kind}`) || norm(content) === norm(`/${a.kind}`)),
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    // 낚시·채집은 미니게임으로 가로채기
    if (matchLifeCmd("낚시", content)) {
      setInput("");
      void beginFishing();
      return;
    }
    if (matchLifeCmd("채집", content)) {
      setInput("");
      void beginGathering();
      return;
    }
    if (matchLifeCmd("채광", content)) {
      setInput("");
      void beginMining();
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/world/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as {
        message?: ChatMessage;
        notice?: string | null;
        ok?: boolean;
        error?: string;
        refresh?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "전송에 실패했어요.");
      } else {
        setInput("");
        stickToBottomRef.current = true;
        if (data.message) append([data.message]);
        if (data.notice) setNotice(data.notice);
        await poll(); // 행동 결과·발견 등 시스템 메시지 즉시 수신
        if (data.refresh) router.refresh();
      }
    } catch {
      setError("전송에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  // 비밀 키워드 조사 — 채팅에 남기지 않고 본인에게만 결과를 알려준다.
  async function probe(e: React.FormEvent) {
    e.preventDefault();
    const kw = secret.trim();
    if (!kw || probing) return;
    setProbing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await discoverByKeyword(kw);
      if (res.error) {
        setError(res.error);
      } else {
        setSecret("");
        if (res.notice) setNotice(res.notice);
        if (res.found) router.refresh(); // 새로 열린 장소가 이동 목록에 뜨도록
      }
    } catch {
      setError("조사에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setProbing(false);
    }
  }

  // 보이는 로그를 인쇄용 창으로 → PDF 저장
  function exportLog() {
    const w = window.open("", "_blank");
    if (!w) return;
    void fetch("/api/world/log-save", { method: "POST" }).catch(() => {}); // 업적 카운터

    const esc = escapeHtml;
    const body = messages
      .map((m) => {
        const time = formatFullDate(m.createdAt);
        if (m.system)
          return `<p class="sys">— ${esc(m.content)} <span class="t">(${time})</span></p>`;
        const who = esc(m.user?.nickname ?? "?");
        return `<div class="msg">${avatarForLog(m.user)}<div class="msg-body"><p class="name"><b>${who}</b> <span class="t">${time}</span></p><p class="text">${esc(m.content)}</p></div></div>`;
      })
      .join("\n");
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(locationName)} 로그</title>
<style>
  body{font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}
  h1{font-size:20px;border-bottom:2px solid #888;padding-bottom:8px}
  .meta{color:#888;font-size:12px;margin-bottom:24px}
  p{margin:10px 0}
  .msg{display:flex;gap:10px;align-items:flex-start;margin:12px 0;break-inside:avoid}
  .msg-body{min-width:0;flex:1}
  .name{margin:0 0 2px}
  .text{margin:0;white-space:pre-wrap}
  .av{width:34px;height:34px;border-radius:999px;object-fit:cover;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;background:#eef1f7;border:1px solid #d9deea;font-weight:700}
  .emoji{font-size:19px}
  .fallback{font-size:14px;color:#555}
  .sys{color:#7a7f93;font-size:13px;font-style:italic}
  .t{color:#aaa;font-size:11px;font-weight:normal}
</style></head><body>
<h1>📜 ${esc(locationName)} — 기록</h1>
<div class="meta">아리안로드 온라인 · ${formatFullDate(new Date())} 내보냄 · ${messages.length}개 메시지</div>
${body}
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="flex h-[30rem] flex-col rounded-3xl border border-line bg-surface shadow-sm sm:h-[34rem]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="min-w-0 truncate text-sm font-extrabold text-content">
          💬 {locationName} 채팅
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden text-[11px] text-faint sm:inline">진입 이후의 대화만 보여요</span>
          <button
            onClick={exportLog}
            disabled={messages.length === 0}
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:bg-subtle disabled:opacity-40"
            title="보이는 로그를 PDF로 저장"
          >
            📄 로그 저장
          </button>
        </div>
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
          if (m.system) {
            return (
              <p key={m.id} className="text-center text-xs font-medium text-faint">
                {m.content} <span className="text-faint2">{timeOf(m.createdAt)}</span>
              </p>
            );
          }
          const mine = m.user?.username === myUsername;
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <Link href={`/u/${encodeURIComponent(m.user!.username)}`} className="shrink-0">
                <Avatar name={m.user!.nickname} avatar={m.user!.avatar} size={32} />
              </Link>
              <div className={`min-w-0 max-w-[75%] ${mine ? "text-right" : ""}`}>
                <p className="mb-0.5 text-[11px] text-faint">
                  <span className="font-bold text-muted">{m.user!.nickname}</span>
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
        {/* 행동 명령 칩 */}
        {actions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {actions.map((a, i) => {
              const cmd = `/${a.label ?? a.kind}`;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={busy && (a.kind === "낚시" || a.kind === "채집" || a.kind === "채광")}
                  onClick={() => {
                    if (a.kind === "낚시") {
                      void beginFishing();
                      return;
                    }
                    if (a.kind === "채집") {
                      void beginGathering();
                      return;
                    }
                    if (a.kind === "채광") {
                      void beginMining();
                      return;
                    }
                    setInput(cmd);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-line bg-subtle px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-amber-400 hover:bg-amber-50 hover:text-content"
                  title={`피로도 ${a.apCost} 소모${a.statLabel ? ` · ${a.statLabel} 판정` : ""}`}
                >
                  {KIND_EMOJI[a.kind] ?? "✨"} {cmd}
                  {a.statLabel && <span className="text-amber-600"> 🎲{a.statLabel}</span>}{" "}
                  <span className="text-faint">⚡{a.apCost}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="mb-2 px-1 text-xs font-medium text-rose-500">{error}</p>}
        {notice && <p className="mb-2 px-1 text-xs font-medium text-violet-500">🔮 {notice}</p>}

        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="메시지 입력… (행동은 /낚시 처럼)"
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

      {/* 비밀 키워드 — 채팅과 분리. 입력값은 누구에게도 보이지 않는다. */}
      <form onSubmit={probe} className="border-t border-line px-3 py-2.5">
        <div className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-violet-500">
          🔮 은밀한 조사
          <span className="font-normal text-faint">— 들은 단서를 조용히 읊어본다 (채팅엔 안 보여요)</span>
        </div>
        <div className="flex gap-2">
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            maxLength={60}
            placeholder="단서가 되는 말…"
            className="min-w-0 flex-1 rounded-xl border border-dashed border-violet-300 bg-violet-50/40 px-4 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
          <button
            type="submit"
            disabled={probing || secret.trim().length === 0}
            className="shrink-0 rounded-xl border border-violet-300 bg-surface px-4 py-2 text-sm font-bold text-violet-600 transition hover:bg-violet-50 disabled:opacity-50"
          >
            {probing ? "조사 중…" : "조사"}
          </button>
        </div>
      </form>

      {fishing && (
        <FishingGame
          rarity={fishing.rarity}
          difficulty={fishing.difficulty}
          barBonus={fishing.barBonus}
          drainSlow={fishing.drainSlow}
          onDone={() => {
            setFishing(null);
            void poll();
            router.refresh();
          }}
        />
      )}

      {gathering && (
        <GatheringGame
          rarity={gathering.rarity}
          difficulty={gathering.difficulty}
          drainSlow={gathering.drainSlow}
          onDone={() => {
            setGathering(null);
            void poll();
            router.refresh();
          }}
        />
      )}

      {mining && (
        <MiningGame
          rarity={mining.rarity}
          difficulty={mining.difficulty}
          drainSlow={mining.drainSlow}
          onDone={() => {
            setMining(null);
            void poll();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
