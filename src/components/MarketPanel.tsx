"use client";

import { useActionState } from "react";
import {
  listItem,
  buyListing,
  cancelListing,
  type MarketState,
} from "@/app/actions/market";

export type MarketItemOption = { name: string; qty: number };
export type MarketListingView = {
  id: string;
  sellerName: string;
  itemName: string;
  itemEffect: string | null;
  qty: number;
  price: number;
  isMine: boolean;
};

function StateLine({ state }: { state: MarketState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
        state.error ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export default function MarketPanel({
  myItems,
  myGold,
  listings,
  feePercent,
}: {
  myItems: MarketItemOption[];
  myGold: number;
  listings: MarketListingView[];
  feePercent: number;
}) {
  const [listState, listAction, listPending] = useActionState<MarketState, FormData>(
    listItem,
    undefined,
  );
  const [buyState, buyAction, buyPending] = useActionState<MarketState, FormData>(
    buyListing,
    undefined,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState<MarketState, FormData>(
    cancelListing,
    undefined,
  );

  return (
    <div className="space-y-5">
      {/* 등록 */}
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-content">🪧 물건 등록</h2>
          <span className="text-xs font-bold text-emerald-500">{myGold.toLocaleString("ko-KR")}G</span>
        </div>
        <form action={listAction} className="space-y-2">
          <select
            name="itemName"
            defaultValue=""
            required
            className="w-full rounded-xl border border-line bg-subtle px-3 py-2 text-sm text-content outline-none"
          >
            <option value="" disabled>
              — 가방에서 아이템 선택 —
            </option>
            {myItems.map((it) => (
              <option key={it.name} value={it.name}>
                {it.name} (보유 {it.qty})
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="qty"
              type="number"
              min={1}
              defaultValue={1}
              placeholder="수량"
              className="rounded-xl border border-line bg-subtle px-3 py-2 text-sm text-content outline-none"
            />
            <input
              name="price"
              type="number"
              min={1}
              placeholder="가격(G)"
              className="rounded-xl border border-line bg-subtle px-3 py-2 text-sm text-content outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={listPending}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
          >
            {listPending ? "등록 중…" : "거래소에 등록"}
          </button>
          <p className="text-[11px] text-faint">판매 시 수수료 {feePercent}%가 차감돼요. 대금은 우편으로 도착합니다.</p>
          <StateLine state={listState} />
        </form>
      </section>

      {/* 매물 목록 */}
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-content">🛒 판매 중인 매물</h2>
        <StateLine state={buyState} />
        <StateLine state={cancelState} />
        {listings.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">아직 등록된 매물이 없어요.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {listings.map((l) => (
              <li
                key={l.id}
                className="flex items-start gap-3 rounded-2xl border border-line bg-subtle px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-content">
                    {l.itemName} <span className="text-brand-600">x{l.qty}</span>
                  </p>
                  {l.itemEffect && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-faint">{l.itemEffect}</p>
                  )}
                  <p className="mt-0.5 text-[11px] font-semibold text-faint">판매자 {l.sellerName}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-extrabold text-emerald-600">
                    {l.price.toLocaleString("ko-KR")}G
                  </span>
                  {l.isMine ? (
                    <form action={cancelAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <button
                        type="submit"
                        disabled={cancelPending}
                        className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle-hover disabled:opacity-60"
                      >
                        등록 취소
                      </button>
                    </form>
                  ) : (
                    <form action={buyAction}>
                      <input type="hidden" name="listingId" value={l.id} />
                      <button
                        type="submit"
                        disabled={buyPending}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-60"
                      >
                        구매
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
