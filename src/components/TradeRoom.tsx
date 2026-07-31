"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "@/lib/usePolling";
import {
  cancelTradeOffer,
  confirmTradeOffer,
  sendTradeMessage,
  updateTradeOffer,
  type TradeActionState,
  type TradeSideItem,
  type TradeSource,
} from "@/app/actions/trade";
import AraconContent from "./AraconContent";
import AraconPicker from "./AraconPicker";

// trade.ts 의 TRADE_SOURCE_SEP 과 동일해야 함 ("use server" 파일의 값은 클라에서 못 가져옴)
const SOURCE_SEP = "~@~";
const SOURCE_EMOJI: Record<TradeSource, string> = { basic: "🎒", 낚시: "🎣", 채집: "🌿", 채광: "⛏️" };
const offerRef = (
  source: TradeSource | undefined,
  name: string,
  effect?: string | null,
  weight?: number | null,
) =>
  `${source ?? "basic"}${SOURCE_SEP}${encodeURIComponent(name)}${SOURCE_SEP}${encodeURIComponent(
    effect ?? "",
  )}${SOURCE_SEP}${weight ?? ""}`;

type OfferableItem = {
  name: string;
  qty: number;
  effect?: string | null;
  weight?: number | null;
  source: TradeSource;
};

type SideView = {
  userId: string;
  nickname: string;
  username: string;
  items: TradeSideItem[];
  gold: number;
  confirmed: boolean;
};

type MessageView = {
  id: string;
  nickname: string | null;
  content: string;
  system: boolean;
  createdAt: string;
};

type TradeSnapshot = {
  status: string;
  fromSide: SideView;
  toSide: SideView;
  messages: MessageView[];
};

function StateLine({ state }: { state: TradeActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
        state.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
      }`}
    >
      {state.message}
    </p>
  );
}

function OfferSide({ side, mine }: { side: SideView; mine: boolean }) {
  return (
    <section
      className={`rounded-3xl border p-5 shadow-sm ${
        side.confirmed ? "border-emerald-400 bg-emerald-500/5" : "border-line bg-surface"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">
            {mine ? "MY OFFER" : "PARTNER OFFER"}
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-content">{side.nickname}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            side.confirmed ? "bg-emerald-500 text-white" : "bg-subtle text-muted"
          }`}
        >
          {side.confirmed ? "확정" : "조율 중"}
        </span>
      </div>

      <div className="mb-3 rounded-2xl bg-canvas px-4 py-3">
        <p className="text-xs font-bold text-faint">올린 골드</p>
        <p className="mt-1 text-xl font-extrabold text-emerald-500">{side.gold.toLocaleString()}G</p>
      </div>

      <div className="space-y-2">
        {side.items.length ? (
          side.items.map((item) => (
            <div key={`${item.name}-${item.effect ?? ""}-${item.weight ?? ""}`} className="rounded-2xl bg-canvas px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-extrabold text-content">
                    {SOURCE_EMOJI[item.source ?? "basic"]} {item.name}
                  </p>
                  {item.effect && <p className="mt-1 line-clamp-2 text-xs text-faint">{item.effect}</p>}
                </div>
                <div className="shrink-0 text-right text-sm font-bold text-muted">
                  {item.weight != null && <p>중량 {item.weight}</p>}
                  <p className="text-brand-600">x{item.qty}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-faint">올린 아이템이 없어요.</p>
        )}
      </div>
    </section>
  );
}

function OfferItemRow({
  row,
  offerableItems,
  disabled,
}: {
  row: TradeSideItem | null;
  offerableItems: OfferableItem[];
  disabled: boolean;
}) {
  const initialRef = row ? offerRef(row.source, row.name, row.effect, row.weight) : "";
  const [selectedRef, setSelectedRef] = useState(initialRef);
  const selectedItem = offerableItems.find(
    (item) => offerRef(item.source, item.name, item.effect, item.weight) === selectedRef,
  );
  const maxQty = selectedItem?.qty ?? row?.qty ?? 1;
  const [qty, setQty] = useState(Math.min(row?.qty ?? 1, maxQty));
  const clampedQty = Math.max(1, Math.min(maxQty, qty));

  return (
    <div className="grid gap-2 rounded-2xl border border-line bg-canvas p-2 sm:grid-cols-[minmax(0,1fr)_112px]">
      <label className="min-w-0 space-y-1">
        <span className="sr-only">거래 아이템</span>
        <select
          name="itemName"
          value={selectedRef}
          onChange={(event) => setSelectedRef(event.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content disabled:opacity-60"
        >
          <option value="">비우기</option>
          {selectedRef && !selectedItem && row && (
            <option value={selectedRef}>
              {SOURCE_EMOJI[row.source ?? "basic"]} {row.name} x{row.qty}
            </option>
          )}
          {offerableItems.map((item) => (
            <option
              key={`${item.source}-${item.name}-${item.effect ?? ""}-${item.weight ?? ""}`}
              value={offerRef(item.source, item.name, item.effect, item.weight)}
            >
              {SOURCE_EMOJI[item.source]} {item.name} x{item.qty}
            </option>
          ))}
        </select>
        <p className="truncate px-1 text-[11px] font-bold text-faint">
          {selectedItem ? `선택 가능 ${selectedItem.qty}개` : "아이템을 선택하세요"}
        </p>
      </label>
      <label className="space-y-1">
        <span className="block px-1 text-[11px] font-bold text-faint">수량</span>
        <input
          type="number"
          name="itemQty"
          min={1}
          max={maxQty}
          value={clampedQty}
          onChange={(event) => setQty(Math.max(1, Math.min(maxQty, Number(event.target.value) || 1)))}
          disabled={disabled || !selectedRef}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content disabled:opacity-60"
        />
      </label>
    </div>
  );
}

function OfferEditor({
  tradeId,
  offerableItems,
  myItems,
  myGold,
  currentGold,
  disabled,
}: {
  tradeId: string;
  offerableItems: OfferableItem[];
  myItems: TradeSideItem[];
  myGold: number;
  currentGold: number;
  disabled: boolean;
}) {
  const [updateState, updateAction, updatePending] = useActionState(updateTradeOffer, {});
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTradeOffer, {});
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTradeOffer, {});
  const rows = Array.from({ length: 6 }, (_, index) => myItems[index] ?? null);

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-content">내 거래 조건</h2>
          <p className="mt-1 text-sm text-faint">조건을 바꾸면 양쪽 확정이 해제됩니다.</p>
        </div>
        <Link href="/profile" className="rounded-xl bg-subtle px-3 py-2 text-sm font-bold text-muted hover:bg-line">
          내 프로필
        </Link>
      </div>

      <form action={updateAction} className="space-y-3">
        <input type="hidden" name="tradeId" value={tradeId} />
        <label className="block space-y-1">
          <span className="text-xs font-bold text-faint">올릴 골드 (보유 {currentGold.toLocaleString()}G)</span>
          <input
            type="number"
            name="gold"
            min={0}
            max={currentGold}
            defaultValue={myGold}
            disabled={disabled}
            className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-semibold text-content disabled:opacity-60"
          />
        </label>

        <div className="space-y-2">
          <p className="text-xs font-bold text-faint">올릴 아이템</p>
          {rows.map((row, index) => (
            <OfferItemRow key={index} row={row} offerableItems={offerableItems} disabled={disabled} />
          ))}
        </div>

        <button
          type="submit"
          disabled={disabled || updatePending}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {updatePending ? "갱신 중..." : "제안 갱신"}
        </button>
        <StateLine state={updateState} />
      </form>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <form action={confirmAction}>
          <input type="hidden" name="tradeId" value={tradeId} />
          <button
            type="submit"
            disabled={disabled || confirmPending}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {confirmPending ? "확정 중..." : "거래 확정"}
          </button>
          <StateLine state={confirmState} />
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="tradeId" value={tradeId} />
          <button
            type="submit"
            disabled={disabled || cancelPending}
            className="w-full rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-extrabold text-rose-600 transition hover:bg-rose-500/15 disabled:opacity-60"
          >
            {cancelPending ? "취소 중..." : "거래 취소"}
          </button>
          <StateLine state={cancelState} />
        </form>
      </div>
    </section>
  );
}

function ChatPanel({
  tradeId,
  messages,
  disabled,
}: {
  tradeId: string;
  messages: MessageView[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(sendTradeMessage, {});
  const [content, setContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!state.ok) return;
    const timeoutId = window.setTimeout(() => setContent(""), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.ok, state.message]);

  function insertAracon(token: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? start;
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`;
    setContent(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <section className="rounded-3xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-lg font-extrabold text-content">💬 거래 대화</h2>
      </div>
      <div className="max-h-[420px] space-y-3 overflow-y-auto p-5">
        {messages.length ? (
          messages.map((message) =>
            message.system ? (
              <p key={message.id} className="text-center text-xs font-bold text-faint">
                {message.content} · {message.createdAt}
              </p>
            ) : (
              <div key={message.id} className="rounded-2xl bg-canvas px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-extrabold text-content">{message.nickname}</p>
                  <p className="text-[11px] font-bold text-faint">{message.createdAt}</p>
                </div>
                <div className="whitespace-pre-wrap text-sm text-muted">
                  <AraconContent text={message.content} size="sm" />
                </div>
              </div>
            ),
          )
        ) : (
          <p className="text-center text-sm text-faint">아직 대화가 없어요.</p>
        )}
      </div>
      <form action={action} className="space-y-2 border-t border-line p-4">
        <input type="hidden" name="tradeId" value={tradeId} />
        <div className="flex gap-2">
          <input
            ref={inputRef}
            name="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={500}
            disabled={disabled}
            placeholder="거래 내용을 이야기해보세요."
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-semibold text-content disabled:opacity-60"
          />
          {!disabled && <AraconPicker onPick={insertAracon} compact align="right" placement="top" />}
          <button
            type="submit"
            disabled={disabled || pending || content.trim().length === 0}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            전송
          </button>
        </div>
        <StateLine state={state} />
      </form>
    </section>
  );
}

export default function TradeRoom({
  tradeId,
  status,
  currentUserId,
  fromSide,
  toSide,
  offerableItems,
  currentGold,
  messages,
}: {
  tradeId: string;
  status: string;
  currentUserId: string;
  fromSide: SideView;
  toSide: SideView;
  offerableItems: OfferableItem[];
  currentGold: number;
  messages: MessageView[];
}) {
  const initialSnapshot = useMemo(
    () => ({ status, fromSide, toSide, messages }),
    [status, fromSide, toSide, messages],
  );
  const [live, setLive] = useState<TradeSnapshot>(initialSnapshot);
  const mine = currentUserId === live.fromSide.userId ? live.fromSide : live.toSide;
  const isOpen = live.status === "PENDING";

  // 거래는 주고받는 동안만 빨라야 한다 — 상대 응답을 기다리는 정지 상태에선 20초까지 늘어난다.
  // 스냅샷이 그대로면 setState 도 건너뛴다(폴링마다 방 전체가 다시 그려지던 것 방지).
  const snapshotKeyRef = useRef(JSON.stringify(initialSnapshot));
  usePolling(
    async () => {
      try {
        const res = await fetch(`/api/trade/${encodeURIComponent(tradeId)}`, {
          cache: "no-store",
        });
        if (!res.ok) return false;
        const next = (await res.json()) as TradeSnapshot;
        const key = JSON.stringify(next);
        if (key === snapshotKeyRef.current) return false;
        snapshotKeyRef.current = key;
        setLive(next);
        return true;
      } catch {
        return false; // 다음 주기에서 다시 시도한다.
      }
    },
    { minMs: 3_000, maxMs: 20_000, idleMs: 60_000 },
  );

  return (
    <div className="mx-auto max-w-5xl animate-fadeup space-y-5 py-4">
      <header className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">TRADE ROOM</p>
            <h1 className="mt-1 text-2xl font-black text-content">
              {live.fromSide.nickname} ↔ {live.toSide.nickname}
            </h1>
            <p className="mt-1 text-sm text-faint">
              양쪽이 확정하면 즉시 거래가 완료됩니다. 조건이 바뀌면 확정은 자동 해제됩니다.
            </p>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-sm font-extrabold ${
              isOpen
                ? "bg-brand-50 text-brand-600"
                : live.status === "ACCEPTED"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-rose-500/10 text-rose-600"
            }`}
          >
            {isOpen ? "진행 중" : live.status === "ACCEPTED" ? "완료" : "취소됨"}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <OfferSide side={live.fromSide} mine={currentUserId === live.fromSide.userId} />
        <OfferSide side={live.toSide} mine={currentUserId === live.toSide.userId} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <OfferEditor
          tradeId={tradeId}
          offerableItems={offerableItems}
          myItems={mine.items}
          myGold={mine.gold}
          currentGold={currentGold}
          disabled={!isOpen}
        />
        <ChatPanel tradeId={tradeId} messages={live.messages} disabled={!isOpen} />
      </div>
    </div>
  );
}
