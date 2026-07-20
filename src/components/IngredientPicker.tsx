"use client";

// 재료 선택 팝업 — 연금술 가마·요리 냄비 공용.
// 스크롤 칩 나열 대신: 가방별 탭(전체/휴대품/채집/낚시/채광) + 검색 + 수량 스테퍼로
// 원하는 재료를 원하는 수량만큼 담고 [확인]으로 한 번에 반영한다.

import { useMemo, useState } from "react";

export type PickerItem = {
  name: string;
  qty: number; // 보유 수량
  note?: string | null; // 부가 정보 (등급·효과 요약)
};

export type PickerSource = {
  key: string;
  label: string;
  emoji: string;
  items: PickerItem[];
};

export default function IngredientPicker({
  title,
  accent = "brand",
  sources,
  initial,
  maxTypes,
  maxUnits,
  onConfirm,
  onClose,
}: {
  title: string;
  accent?: "brand" | "violet";
  sources: PickerSource[];
  initial: Record<string, number>; // 열 때 이미 담겨 있던 수량
  maxTypes?: number | null; // 재료 종류 상한 (연금술 5종)
  maxUnits?: number | null; // 재료 총 개수 상한 (요리 3~4개)
  onConfirm: (draft: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>(() => ({ ...initial }));

  // 이름 → 보유 수량 (전체 탭·검증용 합산)
  const haveMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const source of sources) {
      for (const item of source.items) {
        map.set(item.name, (map.get(item.name) ?? 0) + item.qty);
      }
    }
    return map;
  }, [sources]);

  const allItems = useMemo(() => {
    const seen = new Map<string, PickerItem>();
    for (const source of sources) {
      for (const item of source.items) {
        const existing = seen.get(item.name);
        if (existing) existing.qty += item.qty;
        else seen.set(item.name, { ...item });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [sources]);

  const visible = useMemo(() => {
    const base =
      tab === "all" ? allItems : (sources.find((s) => s.key === tab)?.items ?? []);
    const kw = keyword.trim();
    return kw ? base.filter((item) => item.name.includes(kw)) : base;
  }, [tab, allItems, sources, keyword]);

  const pickedTypes = Object.entries(draft).filter(([, q]) => q > 0);
  const totalUnits = pickedTypes.reduce((sum, [, q]) => sum + q, 0);

  function setQty(name: string, next: number) {
    const have = haveMap.get(name) ?? 0;
    const current = draft[name] ?? 0;
    let clamped = Math.max(0, Math.min(have, Math.trunc(next) || 0));
    // 종류 상한 — 새 종류 추가가 상한을 넘으면 무시
    if (clamped > 0 && current === 0 && maxTypes != null && pickedTypes.length >= maxTypes) {
      return;
    }
    // 총 개수 상한 — 남은 여유만큼만
    if (maxUnits != null) {
      const others = totalUnits - current;
      clamped = Math.min(clamped, Math.max(0, maxUnits - others));
    }
    setDraft((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[name];
      else next[name] = clamped;
      return next;
    });
  }

  const accentBtn =
    accent === "violet"
      ? "bg-gradient-to-r from-violet-600 to-fuchsia-600"
      : "bg-brand-500 hover:bg-brand-600";
  const accentText = accent === "violet" ? "text-violet-600 dark:text-violet-300" : "text-brand-600";
  const accentChip =
    accent === "violet"
      ? "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
      : "bg-brand-50 text-brand-600";

  const TABS = [{ key: "all", label: "전체", emoji: "🧺" }, ...sources];

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/50 px-4 py-6"
      role="presentation"
      onClick={(e) => {
        // 중첩 모달 — 부모(공방/주방) 오버레이까지 닫히지 않게 전파 차단
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-4 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-base font-extrabold text-content">{title}</h4>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${accentChip}`}>
              {maxTypes != null ? `${pickedTypes.length}/${maxTypes}종` : `${pickedTypes.length}종`}
              {" · "}
              {maxUnits != null ? `${totalUnits}/${maxUnits}개` : `${totalUnits}개`}
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-t-xl px-3 py-1.5 text-xs font-extrabold transition ${
                  tab === t.key ? "bg-surface text-content shadow-sm" : "text-faint hover:text-muted"
                }`}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b border-line px-4 py-2.5">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="재료 이름 검색"
            className="w-full rounded-xl border border-line bg-subtle px-3 py-1.5 text-sm text-content placeholder:text-faint2 focus:border-brand-400 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {visible.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs font-bold text-faint">
              {keyword ? "검색 결과가 없어요." : "이 가방엔 재료가 없어요."}
            </p>
          ) : (
            <ul className="space-y-1">
              {visible.map((item) => {
                const picked = draft[item.name] ?? 0;
                const have = haveMap.get(item.name) ?? 0;
                return (
                  <li
                    key={item.name}
                    className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition ${
                      picked > 0 ? accentChip : "hover:bg-subtle"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-content">
                        {item.name}
                        <span className="ml-1.5 text-[11px] font-bold text-faint">×{have}</span>
                      </p>
                      {item.note && (
                        <p className="truncate text-[10px] text-faint">{item.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(item.name, picked - 1)}
                        disabled={picked <= 0}
                        className="h-7 w-7 rounded-full border border-line bg-surface text-sm font-black text-content transition hover:bg-subtle disabled:opacity-30"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={have}
                        value={picked}
                        onChange={(e) => setQty(item.name, Number(e.target.value))}
                        className={`h-7 w-11 rounded-lg border border-line bg-surface text-center text-sm font-black tabular-nums focus:outline-none ${
                          picked > 0 ? accentText : "text-faint"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setQty(item.name, picked + 1)}
                        disabled={picked >= have}
                        className="h-7 w-7 rounded-full border border-line bg-surface text-sm font-black text-content transition hover:bg-subtle disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-subtle px-4 py-3">
          <button
            type="button"
            onClick={() => setDraft({})}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-muted transition hover:text-red-500"
          >
            초기화
          </button>
          <div className="min-w-0 flex-1 truncate text-right text-[11px] font-bold text-faint">
            {pickedTypes.length > 0
              ? pickedTypes.map(([name, q]) => `${name}×${q}`).join(", ")
              : "담은 재료 없음"}
          </div>
          <button
            type="button"
            onClick={() => {
              onConfirm(draft);
              onClose();
            }}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold text-white shadow-sm transition hover:opacity-90 ${accentBtn}`}
          >
            담기
          </button>
        </div>
      </div>
    </div>
  );
}
