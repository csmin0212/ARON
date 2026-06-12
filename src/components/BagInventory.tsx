"use client";

import { useMemo, useState } from "react";
import type { SheetInventoryItem } from "@/lib/googleSheets";

export type LifeBagPocket = {
  name: string;
  emoji: string;
  weight: string;
  items: SheetInventoryItem[];
};

type Props = {
  gold: string;
  weight: string | null;
  items: SheetInventoryItem[];
  lifeBags?: LifeBagPocket[];
};

function mergeItems(items: SheetInventoryItem[]): SheetInventoryItem[] {
  const byName = new Map<string, SheetInventoryItem>();
  for (const item of items) {
    if (item.qty <= 0) continue;
    const key = item.name.trim();
    const existing = byName.get(key);
    if (existing) {
      existing.qty += item.qty;
      existing.effect ||= item.effect;
      existing.weight ??= item.weight;
    } else {
      byName.set(key, { ...item, name: key });
    }
  }
  return [...byName.values()];
}

function weightText(item: SheetInventoryItem): string {
  if (item.weight == null) return "-";
  const total = item.weight * item.qty;
  return item.qty > 1 ? `${item.weight} / 합계 ${total}` : String(item.weight);
}

export default function BagInventory({ gold, weight, items, lifeBags = [] }: Props) {
  const mergedItems = useMemo(() => mergeItems(items), [items]);
  const [selected, setSelected] = useState<SheetInventoryItem | null>(null);
  const [openedBag, setOpenedBag] = useState<LifeBagPocket | null>(null);
  const openedItems = useMemo(() => mergeItems(openedBag?.items ?? []), [openedBag]);

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-extrabold text-content">
        <span>🎒 기본 가방</span>
        <span className="text-xs font-bold text-emerald-500">{gold}</span>
      </h2>
      {lifeBags.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {lifeBags.map((bag) => (
            <button
              key={bag.name}
              type="button"
              onClick={() => setOpenedBag(bag)}
              className="rounded-2xl border border-line bg-subtle px-3 py-2 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <p className="truncate text-xs font-extrabold text-content">
                {bag.emoji} {bag.name}
              </p>
              <p className="mt-0.5 text-[11px] font-bold text-faint">{bag.weight}</p>
            </button>
          ))}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-subtle px-3 py-2 text-xs">
        <span className="font-semibold text-muted">중량</span>
        <span className="font-extrabold text-content">{weight ?? "-"}</span>
      </div>

      {mergedItems.length === 0 ? (
        <p className="px-1 text-xs text-faint">
          아직 비어 있어요. 시트에서 소지품을 추가한 뒤 프로필에서 가방만 다시
          동기화해보세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {mergedItems.map((item, i) => (
            <li key={`${item.name}-${i}`}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="w-full rounded-2xl bg-subtle px-3 py-2 text-left transition hover:bg-subtle-hover focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-content">{item.name}</p>
                    {item.effect && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-faint">
                        {item.effect}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-bold text-muted">
                    <p>중량 {item.weight ?? "-"}</p>
                    <p className="text-brand-600">x{item.qty}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openedBag && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
          role="presentation"
          onClick={() => setOpenedBag(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${openedBag.name} 내용물`}
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line bg-subtle px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
                Life Bag
              </p>
              <h3 className="mt-1 flex items-center justify-between gap-3 text-xl font-extrabold text-content">
                <span>
                  {openedBag.emoji} {openedBag.name}
                </span>
                <span className="text-sm font-bold text-muted">{openedBag.weight}</span>
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {openedItems.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
                  아직 비어 있어요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {openedItems.map((item, i) => (
                    <li key={`${item.name}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="w-full rounded-2xl bg-subtle px-3 py-2 text-left transition hover:bg-subtle-hover"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-extrabold text-content">{item.name}</p>
                            {item.effect && (
                              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-faint">
                                {item.effect}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right text-[11px] font-bold text-muted">
                            <p>중량 {item.weight ?? "-"}</p>
                            <p className="text-brand-600">x{item.qty}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setOpenedBag(null)}
                className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} 상세 정보`}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line bg-subtle px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
                Item Detail
              </p>
              <h3 className="mt-1 text-xl font-extrabold text-content">{selected.name}</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-subtle px-3 py-2">
                  <p className="text-[11px] font-bold text-faint">갯수</p>
                  <p className="text-lg font-extrabold text-brand-600">x{selected.qty}</p>
                </div>
                <div className="rounded-2xl bg-subtle px-3 py-2">
                  <p className="text-[11px] font-bold text-faint">중량</p>
                  <p className="text-lg font-extrabold text-content">{weightText(selected)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line px-3 py-3">
                <p className="mb-1 text-[11px] font-bold text-faint">상세 효과</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                  {selected.effect || "아직 등록된 효과가 없어요."}
                </p>
              </div>
            </div>
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
