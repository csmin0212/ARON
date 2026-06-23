"use client";

import { useActionState, useMemo, useState } from "react";
import { AUCTION_CATEGORIES, type AuctionCategory } from "@/lib/auction";
import type { ListingView, SellableItem } from "@/lib/auctionServer";
import {
  buyAuctionListing,
  cancelAuctionListing,
  listOnAuction,
  type AuctionState,
} from "@/app/actions/auction";

type Tab = "buy" | "sell" | "mine";

const CATEGORY_EMOJI: Record<string, string> = {
  전체: "🗂️",
  어획물: "🐟",
  채집품: "🌿",
  요리: "🍳",
  재료: "💎",
  소비: "🧪",
  스킬북: "📘",
  기타: "📦",
};

function gold(n: number): string {
  return n.toLocaleString("ko-KR");
}

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "곧 만료";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간`;
  if (h >= 1) return `${h}시간`;
  return `${Math.max(1, Math.floor(ms / 60_000))}분`;
}

function StateLine({ state }: { state: AuctionState }) {
  if (!state?.ok && !state?.error) return null;
  return (
    <p
      className={`mt-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
        state.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
      }`}
    >
      {state.ok ?? state.error}
    </p>
  );
}

function RankStars({ rank }: { rank: number | null }) {
  if (rank == null) return null;
  return (
    <span className="text-[11px] font-bold text-amber-500">
      {"★".repeat(rank)}
      {"☆".repeat(Math.max(0, 5 - rank))}
    </span>
  );
}

// ── 구매 행 ──
function BuyRow({ listing, myGold }: { listing: ListingView; myGold: number }) {
  const [state, action, pending] = useActionState<AuctionState, FormData>(buyAuctionListing, undefined);
  const [qty, setQty] = useState(1);
  const total = listing.unitPrice * qty;
  const tooPoor = total > myGold;

  return (
    <div className="rounded-2xl border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-content">{listing.itemName}</span>
            <RankStars rank={listing.rank} />
            <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10px] font-bold text-faint">
              {CATEGORY_EMOJI[listing.category] ?? "📦"} {listing.category}
            </span>
          </div>
          {listing.effect && (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted">{listing.effect}</p>
          )}
          <p className="mt-1 text-[11px] font-bold text-faint">
            판매자 {listing.sellerNickname} · 남음 {listing.quantity} · {timeLeft(listing.expiresAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-amber-600">{gold(listing.unitPrice)}G</p>
          <p className="text-[10px] text-faint">개당</p>
        </div>
      </div>

      <form action={action} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="listingId" value={listing.id} />
        <input
          type="number"
          name="qty"
          min={1}
          max={listing.quantity}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Math.min(listing.quantity, Number(e.target.value) || 1)))}
          className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-semibold outline-none focus:border-brand-400"
        />
        <button
          type="submit"
          disabled={pending || tooPoor}
          className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-extrabold text-white transition hover:bg-amber-600 disabled:opacity-50"
        >
          {pending ? "구매 중..." : tooPoor ? "골드 부족" : `즉시구매 ${gold(total)}G`}
        </button>
      </form>
      <StateLine state={state} />
    </div>
  );
}

// ── 판매(등록) 행 ──
function SellRow({ item }: { item: SellableItem }) {
  const [state, action, pending] = useActionState<AuctionState, FormData>(listOnAuction, undefined);
  const [price, setPrice] = useState(item.floor || 1);
  const [qty, setQty] = useState(1);
  const below = price < item.floor;

  return (
    <div className="rounded-2xl border border-line bg-canvas p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-extrabold text-content">{item.name}</span>
          <RankStars rank={item.rank} />
          <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[10px] font-bold text-faint">
            {CATEGORY_EMOJI[item.category] ?? "📦"} {item.category}
          </span>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-faint">보유 {item.qty}</span>
      </div>
      <p className="mt-1 text-[11px] text-faint">
        즉시매각 하한 <span className="font-bold text-content">{gold(item.floor)}G</span>
        {item.source !== "basic" && <span className="ml-1">· {item.source} 가방</span>}
      </p>

      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="source" value={item.source} />
        <input type="hidden" name="itemName" value={item.name} />
        <label className="flex items-center gap-1 text-[11px] font-bold text-faint">
          수량
          <input
            type="number"
            name="qty"
            min={1}
            max={item.qty}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(item.qty, Number(e.target.value) || 1)))}
            className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-semibold outline-none focus:border-brand-400"
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] font-bold text-faint">
          개당
          <input
            type="number"
            name="unitPrice"
            min={item.floor || 1}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
            className={`w-24 rounded-lg border bg-surface px-2 py-1.5 text-sm font-semibold outline-none ${
              below ? "border-rose-400 text-rose-600" : "border-line focus:border-brand-400"
            }`}
          />
          G
        </label>
        <button
          type="submit"
          disabled={pending || below}
          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "등록 중..." : below ? "하한 미만" : "등록"}
        </button>
      </form>
      <StateLine state={state} />
    </div>
  );
}

// ── 내 등록 행 ──
function MyListingRow({ listing }: { listing: ListingView }) {
  const [state, action, pending] = useActionState<AuctionState, FormData>(cancelAuctionListing, undefined);
  return (
    <div className="rounded-2xl border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-content">{listing.itemName}</span>
            <RankStars rank={listing.rank} />
          </div>
          <p className="mt-1 text-[11px] font-bold text-faint">
            개당 {gold(listing.unitPrice)}G · 남음 {listing.quantity} · {timeLeft(listing.expiresAt)} 남음
          </p>
        </div>
        <form action={action} className="shrink-0">
          <input type="hidden" name="listingId" value={listing.id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-extrabold text-rose-600 transition hover:bg-rose-500/15 disabled:opacity-50"
          >
            {pending ? "취소 중..." : "회수"}
          </button>
        </form>
      </div>
      <StateLine state={state} />
    </div>
  );
}

export default function MarketBrowser({
  meId,
  myGold,
  linked,
  listings,
  myListings,
  sellable,
}: {
  meId: string;
  myGold: number;
  linked: boolean;
  listings: ListingView[];
  myListings: ListingView[];
  sellable: SellableItem[];
}) {
  const [tab, setTab] = useState<Tab>("buy");
  const [category, setCategory] = useState<AuctionCategory>("전체");
  const [search, setSearch] = useState("");

  const buyList = useMemo(() => {
    const q = search.trim();
    return listings.filter((l) => {
      if (l.sellerId === meId) return false;
      if (category !== "전체" && l.category !== category) return false;
      if (q && !l.itemName.includes(q)) return false;
      return true;
    });
  }, [listings, category, search, meId]);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "buy", label: "🛒 구매", count: listings.filter((l) => l.sellerId !== meId).length },
    { key: "sell", label: "📤 판매", count: sellable.length },
    { key: "mine", label: "📋 내 등록", count: myListings.length },
  ];

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MARKET</p>
          <h1 className="mt-1 text-2xl font-black text-content">🏪 경매장</h1>
          <p className="mt-1 text-sm text-faint">위탁 등록 → 다른 모험가가 즉시구매. 수수료 2%(등록)·5%(판매).</p>
        </div>
        <div className="rounded-2xl bg-amber-500/10 px-4 py-2 text-right">
          <p className="text-[10px] font-bold text-amber-600">보유 골드</p>
          <p className="text-lg font-black text-amber-600">{gold(myGold)}G</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-extrabold transition ${
              tab === t.key ? "bg-brand-600 text-white shadow-sm" : "bg-subtle text-muted hover:bg-subtle-hover"
            }`}
          >
            {t.label}
            {t.count != null && <span className="ml-1 opacity-70">{t.count}</span>}
          </button>
        ))}
      </div>

      {!linked && (
        <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-700">
          캐릭터 시트를 먼저 연동해야 거래할 수 있어요.
        </p>
      )}

      {/* 구매 */}
      {tab === "buy" && (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <aside className="flex shrink-0 gap-1.5 overflow-x-auto sm:w-36 sm:flex-col sm:overflow-visible">
            {AUCTION_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm font-bold transition ${
                  category === c ? "bg-brand-500/15 text-brand-700" : "text-muted hover:bg-subtle"
                }`}
              >
                {CATEGORY_EMOJI[c]} {c}
              </button>
            ))}
          </aside>
          <div className="min-w-0 flex-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="아이템 이름 검색..."
              className="mb-3 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
            {buyList.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {buyList.map((l) => (
                  <BuyRow key={l.id} listing={l} myGold={myGold} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-canvas px-4 py-8 text-center text-sm text-faint">
                등록된 매물이 없어요.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 판매 */}
      {tab === "sell" && (
        <div className="mt-4">
          {sellable.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {sellable.map((item) => (
                <SellRow key={`${item.source}:${item.name}`} item={item} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-canvas px-4 py-8 text-center text-sm text-faint">
              등록할 수 있는 아이템이 없어요. (휴대품·낚시/채집 가방)
            </p>
          )}
        </div>
      )}

      {/* 내 등록 */}
      {tab === "mine" && (
        <div className="mt-4">
          {myListings.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {myListings.map((l) => (
                <MyListingRow key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-canvas px-4 py-8 text-center text-sm text-faint">
              등록한 매물이 없어요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
