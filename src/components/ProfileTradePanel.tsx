"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  cancelTradeOffer,
  createTradeOffer,
  type TradeActionState,
} from "@/app/actions/trade";

type OfferableItem = {
  name: string;
  qty: number;
  effect?: string | null;
  weight?: number | null;
};

export type TradeOfferView = {
  id: string;
  fromNickname: string;
  fromUsername: string;
  toNickname: string;
  toUsername: string;
  offerItemName: string | null;
  offerItemQty: number;
  offerGold: number;
  requestGold: number;
  message: string | null;
  createdAt: string;
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

function CancelForm({ tradeId }: { tradeId: string }) {
  const [state, action, pending] = useActionState(cancelTradeOffer, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="tradeId" value={tradeId} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-extrabold text-rose-600 transition hover:bg-rose-500/15 disabled:opacity-60"
      >
        {pending ? "취소 중..." : "거래 취소"}
      </button>
      <StateLine state={state} />
    </form>
  );
}

function TradeCard({ offer }: { offer: TradeOfferView }) {
  return (
    <div className="rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-content">
            {offer.fromNickname} ↔ {offer.toNickname}
          </p>
          <p className="mt-1 text-sm text-muted">거래방 안에서 대화하고 조건을 조율합니다.</p>
          {offer.message && <p className="mt-1 text-xs text-faint">첫 메시지: “{offer.message}”</p>}
          <p className="mt-1 text-[11px] font-bold text-faint">{offer.createdAt}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-40 sm:grid-cols-1">
          <Link
            href={`/trade/${offer.id}`}
            className="rounded-xl bg-brand-600 px-3 py-2 text-center text-sm font-extrabold text-white transition hover:bg-brand-700"
          >
            거래방 열기
          </Link>
          <CancelForm tradeId={offer.id} />
        </div>
      </div>
    </div>
  );
}

export default function ProfileTradePanel({
  targetUserId,
  targetNickname,
  isOwn,
  offerableItems,
  incoming,
  outgoing,
}: {
  targetUserId: string;
  targetNickname: string;
  isOwn: boolean;
  offerableItems: OfferableItem[];
  incoming: TradeOfferView[];
  outgoing: TradeOfferView[];
}) {
  const [createState, createAction, createPending] = useActionState(createTradeOffer, {});

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-content">🤝 거래</h2>
          <p className="mt-1 text-sm text-faint">
            거래방에서 대화하며 양쪽이 아이템과 골드를 올리고, 둘 다 확정하면 완료됩니다.
          </p>
        </div>
      </div>

      {!isOwn && (
        <form action={createAction} className="mb-5 space-y-3 rounded-2xl bg-canvas p-4">
          <input type="hidden" name="toUserId" value={targetUserId} />
          <p className="text-sm font-bold text-muted">{targetNickname}님과 거래방 만들기</p>
          <textarea
            name="message"
            maxLength={160}
            rows={3}
            placeholder="첫 메시지나 거래 의도를 적어보세요."
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content"
          />
          <button
            type="submit"
            disabled={createPending}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {createPending ? "생성 중..." : "거래방 만들기"}
          </button>
          <StateLine state={createState} />
          {offerableItems.length === 0 && (
            <p className="text-xs text-faint">현재 기본 가방에 올릴 수 있는 아이템이 없어요. 골드 거래는 가능합니다.</p>
          )}
        </form>
      )}

      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-extrabold text-content">받은 거래방</h3>
          {incoming.length ? (
            <div className="space-y-2">
              {incoming.map((offer) => (
                <TradeCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-faint">대기 중인 거래방이 없어요.</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-extrabold text-content">보낸 거래방</h3>
          {outgoing.length ? (
            <div className="space-y-2">
              {outgoing.map((offer) => (
                <TradeCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-canvas px-4 py-3 text-sm text-faint">보낸 거래방이 없어요.</p>
          )}
        </div>
      </div>
    </section>
  );
}
