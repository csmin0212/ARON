"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptGuildQuest,
  deliverGuildQuest,
  drawSkillbook,
  exchangeSkillbook,
  rerollGuildQuests,
  type DrawResult,
} from "@/app/actions/guildQuests";
import type { QuestOffer } from "@/lib/guildQuests";

export type QuestOfferView = QuestOffer & { have: number };

export type GuildQuestBoardView = {
  offers: QuestOfferView[];
  acceptedId: string | null;
  delivered: boolean;
  rerolls: number;
  rerollMax: number;
  weekCount: number;
  weekGoal: number;
  frags: { 일반: number; 고급: number };
  fragCost: number;
  books: { name: string; qty: number; skillName: string; job: string | null; unique: boolean }[];
};

const KIND_EMOJI: Record<string, string> = { 낚시: "🎣", 채집: "🌿", 채광: "⛏️", 요리: "🍳" };
const STARS = ["☆", "★", "★★", "★★★", "★★★★", "★★★★★"];

function DrawResultModal({ result, onClose }: { result: DrawResult; onClose: () => void }) {
  const ok = !("error" in result);
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="뽑기 결과"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xs overflow-hidden rounded-3xl border text-center shadow-2xl transition-all duration-500 ${
          ok && result.unique
            ? "animate-pulse border-amber-400 bg-gradient-to-b from-amber-950 to-stone-950 text-amber-50"
            : "border-line bg-surface text-content"
        }`}
      >
        <div className="px-6 py-8">
          {!ok ? (
            <p className="text-sm font-bold text-rose-500">{result.error}</p>
          ) : (
            <>
              <div className={`mb-3 text-6xl ${result.unique ? "animate-bounce" : ""}`}>
                {result.unique ? "🌟" : "📚"}
              </div>
              {result.unique && (
                <p className="mb-1 text-xs font-black uppercase tracking-[0.3em] text-amber-400">
                  ✦ Unique ✦
                </p>
              )}
              <p className={`text-lg font-black ${result.unique ? "text-amber-200" : "text-content"}`}>
                {result.skillName}
              </p>
              <p className={`mt-1 text-xs font-bold ${result.unique ? "text-amber-300/80" : "text-muted"}`}>
                {result.job ?? "공용"} · {result.bookId}
              </p>
              <p className={`mt-2 text-[11px] ${result.unique ? "text-amber-200/70" : "text-faint"}`}>
                가방에 담겼어요. 사용하면 시트에 스킬이 기입돼요.
              </p>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`mt-5 w-full rounded-xl py-2.5 text-sm font-bold transition ${
              ok && result.unique
                ? "bg-amber-500 text-stone-950 hover:bg-amber-400"
                : "bg-brand-500 text-white hover:bg-brand-600"
            }`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuildQuestBoard({ view }: { view: GuildQuestBoardView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawResult, setDrawResult] = useState<DrawResult | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  function run(action: () => Promise<{ ok?: string; error?: string } | undefined>) {
    if (pending) return;
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res) setMessage(res);
      router.refresh();
    });
  }

  async function onDraw(kind: "일반" | "고급") {
    if (drawing) return;
    setDrawing(true);
    setMessage(null);
    // 개봉 연출 — 잠깐 뜸을 들인 뒤 결과 공개
    const [res] = await Promise.all([
      drawSkillbook(kind),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    setDrawing(false);
    setDrawResult(res);
    router.refresh();
  }

  const weekPct = Math.min(100, Math.round((view.weekCount / view.weekGoal) * 100));

  return (
    <div className="space-y-3">
      {/* 주간 트래커 */}
      <section className="rounded-2xl border border-line bg-subtle p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-content">
            🗓️ 이번 주 일일 의뢰 클리어 <span className="text-brand-600">{Math.min(view.weekCount, view.weekGoal)}/{view.weekGoal}</span>
          </p>
          <span className="text-[11px] font-bold text-faint">
            {view.weekCount >= view.weekGoal ? "주간 보상 수령 완료" : `${view.weekGoal}회 달성 시 명성 +1 · 리롤권 +1`}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
            style={{ width: `${weekPct}%` }}
          />
        </div>
      </section>

      {/* 일일 의뢰 게시판 */}
      <section className="rounded-2xl border border-line bg-subtle p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-sm font-extrabold text-content">📋 오늘의 납품 의뢰</h4>
          <p className="text-[11px] font-bold text-faint">
            {view.acceptedId ? "오늘 1건 수락됨" : `${view.offers.length}개 중 1개만 수락 가능`}
          </p>
        </div>
        <div className="space-y-2">
          {view.offers.map((offer) => {
            const isAccepted = offer.id === view.acceptedId;
            const done = isAccepted && view.delivered;
            const canDeliver = isAccepted && !view.delivered && offer.have >= offer.qty;
            return (
              <article
                key={offer.id}
                className={`rounded-2xl border p-3.5 transition ${
                  done
                    ? "border-emerald-300 bg-emerald-50/60"
                    : isAccepted
                      ? "border-amber-400 bg-amber-50/60 shadow-sm"
                      : "border-line bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-content">
                      {KIND_EMOJI[offer.kind] ?? "✨"} {offer.itemName}{" "}
                      <span className="text-brand-600">x{offer.qty}</span>
                      {offer.urgent && (
                        <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-600">
                          ⚡긴급 보상 2배
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-faint">
                      {offer.kind} · {STARS[offer.rank] ?? `R${offer.rank}`} · 보유 {offer.have}/{offer.qty}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-bold">
                    <p className="text-emerald-600">+{offer.gold.toLocaleString()}G</p>
                    <p className={offer.fragKind === "고급" ? "text-violet-600" : "text-sky-600"}>
                      {offer.fragKind} 파편 +{offer.fragCount}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5">
                  {done ? (
                    <p className="rounded-xl bg-emerald-100 py-2 text-center text-xs font-black text-emerald-700">
                      ✅ 납품 완료
                    </p>
                  ) : isAccepted ? (
                    <button
                      type="button"
                      disabled={pending || !canDeliver}
                      onClick={() => run(deliverGuildQuest)}
                      className="w-full rounded-xl bg-amber-500 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:bg-subtle-hover disabled:text-faint"
                    >
                      {canDeliver ? "📦 납품하기" : `재료 부족 (${offer.have}/${offer.qty})`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || !!view.acceptedId}
                      onClick={() => run(() => acceptGuildQuest(offer.id))}
                      className="w-full rounded-xl bg-brand-500 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:bg-subtle-hover disabled:text-faint"
                    >
                      의뢰 수락
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {view.offers.length === 0 && (
            <p className="rounded-2xl bg-surface px-4 py-6 text-center text-sm text-faint">
              게시된 의뢰가 없어요. 월드 동기화 후 다시 확인해주세요.
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold text-faint">
            🎟️ 리롤권 {view.rerolls}/{view.rerollMax} · 매일 1개 지급
          </p>
          <button
            type="button"
            disabled={pending || view.rerolls <= 0 || !!view.acceptedId}
            onClick={() => run(rerollGuildQuests)}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:border-brand-300 hover:text-content disabled:opacity-50"
          >
            리롤 ↻
          </button>
        </div>
      </section>

      {/* 스킬 파편 & 뽑기 */}
      <section className="rounded-2xl border border-line bg-subtle p-4">
        <h4 className="mb-3 text-sm font-extrabold text-content">🧩 스킬 파편</h4>
        <div className="grid grid-cols-2 gap-2">
          {(["일반", "고급"] as const).map((kind) => {
            const count = view.frags[kind];
            const canDraw = count >= view.fragCost;
            const tone = kind === "고급" ? "text-violet-600" : "text-sky-600";
            return (
              <div key={kind} className="rounded-2xl bg-surface p-3 text-center">
                <p className={`text-xs font-black ${tone}`}>{kind} 파편</p>
                <p className="mt-1 text-xl font-black text-content">
                  {count}
                  <span className="text-xs font-bold text-faint"> / {view.fragCost}</span>
                </p>
                <button
                  type="button"
                  disabled={drawing || !canDraw}
                  onClick={() => void onDraw(kind)}
                  className={`mt-2 w-full rounded-xl py-2 text-xs font-black text-white transition disabled:bg-subtle-hover disabled:text-faint ${
                    kind === "고급" ? "bg-violet-500 hover:bg-violet-600" : "bg-sky-500 hover:bg-sky-600"
                  }`}
                >
                  {drawing ? "개봉 중…" : `📖 스킬북 뽑기 (${view.fragCost}개)`}
                </button>
                <p className="mt-1.5 text-[10px] text-faint">
                  유니크 확률 {kind === "고급" ? "5%" : "1%"}
                </p>
              </div>
            );
          })}
        </div>

        {/* 교환소 */}
        <button
          type="button"
          onClick={() => setExchangeOpen((v) => !v)}
          className="mt-3 w-full rounded-xl border border-dashed border-line bg-surface py-2 text-xs font-bold text-muted transition hover:text-content"
        >
          ♻️ 스킬북 교환소 {exchangeOpen ? "닫기" : `열기 (보유 ${view.books.reduce((s, b) => s + b.qty, 0)}권)`}
        </button>
        {exchangeOpen && (
          <div className="mt-2 space-y-1.5">
            {view.books.length === 0 ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-faint">
                갈아둘 스킬북이 없어요.
              </p>
            ) : (
              view.books.map((book) => (
                <div
                  key={book.name}
                  className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-content">
                      {book.unique ? "🌟" : "📚"} {book.skillName}
                      <span className="ml-1 text-[10px] font-bold text-faint">
                        {book.job ?? "공용"} · {book.name} x{book.qty}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => exchangeSkillbook(book.name))}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-muted transition hover:border-rose-300 hover:text-rose-500 disabled:opacity-50"
                  >
                    갈기 → {book.unique ? "고급" : "일반"} 3
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {message && (
        <p
          className={`rounded-xl px-3 py-2 text-xs font-bold ${
            message.error ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {drawResult && <DrawResultModal result={drawResult} onClose={() => setDrawResult(null)} />}
    </div>
  );
}
