"use client";

import { useMemo, useState, useActionState } from "react";
import {
  depositToStorage,
  enchantWeapon,
  upgradeWeapon,
  withdrawFromStorage,
  type ServiceState,
  type StorageState,
} from "@/app/actions/services";
import type { SheetInventoryItem } from "@/lib/googleSheets";

type Props = {
  canForge: boolean;
  canStorage: boolean;
  inventoryItems: SheetInventoryItem[];
  storage: StorageView;
};

export type StorageView = {
  maxWeight: number;
  usedWeight: number;
  items: StorageItemView[];
};

export type StorageItemView = SheetInventoryItem & {
  id: string;
};

const GEM_NAMES = ["루비", "에메랄드", "사파이어", "토파즈", "다이아몬드"];
const WEAPON_HINTS = [
  "검",
  "도",
  "창",
  "활",
  "단검",
  "도끼",
  "메이스",
  "해머",
  "완드",
  "스태프",
  "지팡이",
  "소드",
  "블레이드",
  "보우",
  "랜스",
  "액스",
];

function mergeItems(items: SheetInventoryItem[]): SheetInventoryItem[] {
  const byName = new Map<string, SheetInventoryItem>();
  for (const item of items) {
    if (item.qty <= 0) continue;
    const key = item.name.trim();
    const existing = byName.get(key);
    if (existing) existing.qty += item.qty;
    else byName.set(key, { ...item, name: key });
  }
  return [...byName.values()];
}

function isGem(item: SheetInventoryItem): boolean {
  return GEM_NAMES.some((name) => item.name.includes(name));
}

function isWeapon(item: SheetInventoryItem): boolean {
  if (item.name.trim() === "강철 파편") return false;
  if (item.name.includes("파편") || isGem(item)) return false;
  const source = `${item.name} ${item.effect ?? ""}`;
  return WEAPON_HINTS.some((hint) => source.includes(hint));
}

function countOf(items: SheetInventoryItem[], name: string): number {
  return items
    .filter((item) => item.name.trim() === name)
    .reduce((total, item) => total + item.qty, 0);
}

function StateLine({ state }: { state: ServiceState }) {
  if (state?.error) {
    return (
      <p className="rounded-xl border border-red-800/50 bg-red-950/55 px-3 py-2 text-xs font-semibold text-red-100">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p className="rounded-xl border border-emerald-700/50 bg-emerald-950/50 px-3 py-2 text-xs font-semibold text-emerald-100">
        {state.ok}
      </p>
    );
  }
  return null;
}

function StorageStateLine({ state }: { state: StorageState }) {
  if (state?.error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">
        {state.ok}
      </p>
    );
  }
  return null;
}

function ForgeChoice({
  tone,
  icon,
  title,
  subtitle,
  onClick,
}: {
  tone: "fire" | "arcane";
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  const fire = tone === "fire";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative min-h-[12.5rem] overflow-hidden rounded-[1.6rem] border-2 p-5 text-left shadow-2xl transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] focus:outline-none focus:ring-2 ${
        fire
          ? "border-amber-700/70 bg-stone-950 focus:ring-amber-300"
          : "border-violet-500/60 bg-slate-950 focus:ring-violet-300"
      }`}
    >
      <span
        className={`absolute inset-0 opacity-90 ${
          fire
            ? "bg-[radial-gradient(circle_at_50%_35%,rgba(251,146,60,0.45),transparent_34%),linear-gradient(145deg,rgba(26,18,13,0.96),rgba(63,32,16,0.9))]"
            : "bg-[radial-gradient(circle_at_50%_35%,rgba(168,85,247,0.5),transparent_34%),linear-gradient(145deg,rgba(16,13,32,0.96),rgba(44,28,78,0.9))]"
        }`}
      />
      <span className="absolute inset-3 rounded-[1.2rem] border border-white/10 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.65)]" />
      <span
        className={`absolute inset-x-8 bottom-10 h-px transition group-hover:scale-x-110 ${
          fire ? "bg-amber-300/70" : "bg-violet-300/70"
        }`}
      />
      <span className="relative z-10 flex h-full min-h-[10rem] flex-col items-center justify-center text-center">
        <span className="mb-3 text-5xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.75)]">{icon}</span>
        <span
          className={`text-3xl font-black tracking-wide drop-shadow-[0_3px_0_rgba(0,0,0,0.75)] sm:text-4xl ${
            fire ? "text-amber-100" : "text-violet-100"
          }`}
        >
          {title}
        </span>
        <span className="mt-3 text-xs font-bold text-stone-200/75">{subtitle}</span>
      </span>
    </button>
  );
}

function StorageManager({
  inventoryItems,
  storage,
  onClose,
}: {
  inventoryItems: SheetInventoryItem[];
  storage: StorageView;
  onClose: () => void;
}) {
  const [depositState, depositAction, depositPending] = useActionState<StorageState, FormData>(
    depositToStorage,
    undefined,
  );
  const [withdrawState, withdrawAction, withdrawPending] = useActionState<StorageState, FormData>(
    withdrawFromStorage,
    undefined,
  );
  const items = useMemo(() => mergeItems(inventoryItems), [inventoryItems]);
  const storageItems = storage.items.filter((item) => item.qty > 0);
  const fill = Math.min(100, Math.round((storage.usedWeight / storage.maxWeight) * 100));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="창고 관리인"
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Storage Keeper
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🧰 창고 관리인</span>
            <span className="text-sm font-bold text-muted">
              {storage.usedWeight} / {storage.maxWeight}
            </span>
          </h3>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-brand-500"
              style={{ width: `${fill}%` }}
            />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section className="rounded-2xl border border-line p-3">
            <h4 className="mb-2 text-sm font-extrabold text-content">가방에서 보관</h4>
            <StorageStateLine state={depositState} />
            <form action={depositAction} className="mt-2 grid grid-cols-[1fr_4.5rem] gap-2">
              <select
                name="itemName"
                className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content outline-none focus:border-brand-300"
              >
                {items.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} x{item.qty}
                  </option>
                ))}
              </select>
              <input
                name="qty"
                type="number"
                min="1"
                defaultValue="1"
                className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-content outline-none focus:border-brand-300"
              />
              <button
                type="submit"
                disabled={depositPending || items.length === 0}
                className="col-span-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {depositPending ? "보관 중..." : "보관하기"}
              </button>
            </form>
          </section>

          <section>
            <h4 className="mb-2 text-sm font-extrabold text-content">창고 내용물</h4>
            <StorageStateLine state={withdrawState} />
            {storageItems.length === 0 ? (
              <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
                아직 맡긴 물건이 없어요.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {storageItems.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl bg-subtle px-3 py-3"
                  >
                    <div className="mb-2 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-content">{item.name}</p>
                        {item.effect && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-faint">{item.effect}</p>
                        )}
                      </div>
                      <div className="text-right text-xs font-bold text-muted">
                        <p>중량 {item.weight ?? "-"}</p>
                        <p className="text-brand-600">x{item.qty}</p>
                      </div>
                    </div>
                    <form action={withdrawAction} className="grid grid-cols-[1fr_5rem] gap-2">
                      <input type="hidden" name="entryId" value={item.id} />
                      <input
                        name="qty"
                        type="number"
                        min="1"
                        max={item.qty}
                        defaultValue="1"
                        className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-content outline-none focus:border-brand-300"
                      />
                      <button
                        type="submit"
                        disabled={withdrawPending}
                        className="rounded-xl bg-surface px-3 py-2 text-sm font-extrabold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
                      >
                        꺼내기
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-subtle px-4 py-2.5 text-sm font-bold text-content transition hover:bg-subtle-hover"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorldServices({ canForge, canStorage, inventoryItems, storage }: Props) {
  const [open, setOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [forgeMode, setForgeMode] = useState<"weapon" | "magic" | null>(null);
  const [upgradeState, upgradeAction, upgradePending] = useActionState<ServiceState, FormData>(
    upgradeWeapon,
    undefined,
  );
  const [enchantState, enchantAction, enchantPending] = useActionState<ServiceState, FormData>(
    enchantWeapon,
    undefined,
  );

  const items = useMemo(() => mergeItems(inventoryItems), [inventoryItems]);
  const weapons = items.filter(isWeapon);
  const gems = items.filter(isGem);
  const steelCount = countOf(items, "강철 파편");
  const moonCount = countOf(items, "달의 파편");

  if (!canForge && !canStorage) return null;

  function closeForge() {
    setOpen(false);
    setForgeMode(null);
  }

  return (
    <>
      <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 px-1 text-sm font-extrabold text-content">🏷️ 시설</h2>
        <div className="space-y-2">
          {canForge && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">⚒️</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">대장간</span>
                <span className="text-[11px] text-faint">무기 강화 · 마법 제련</span>
              </span>
            </button>
          )}
          {canStorage && (
            <button
              type="button"
              onClick={() => setStorageOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🧰</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">창고 관리인</span>
                <span className="text-[11px] text-faint">
                  캐릭터별 창고 {storage.usedWeight}/{storage.maxWeight}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {storageOpen && (
        <StorageManager
          inventoryItems={inventoryItems}
          storage={storage}
          onClose={() => setStorageOpen(false)}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-3 py-5"
          role="presentation"
          onClick={closeForge}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="대장간"
            className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-stone-950 bg-[#1a0f08] p-2 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.82)]"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(#2b170c, #100906)",
              backgroundSize: "72px 100%, 100% 100%",
            }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[2rem] border-[10px] border-stone-900/80 shadow-[inset_0_0_0_2px_rgba(214,163,91,0.35),inset_0_0_42px_rgba(0,0,0,0.9)]" />
            <div className="pointer-events-none absolute left-1/2 top-0 z-10 grid h-20 w-24 -translate-x-1/2 place-items-center rounded-b-3xl border-x border-b border-amber-700/50 bg-stone-950/90 text-4xl shadow-xl">
              ⚒️
            </div>

            <div className="relative z-20 flex items-center justify-between px-5 pb-3 pt-16 sm:px-8">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-300/75">
                  Blacksmith
                </p>
                <h3 className="mt-1 text-2xl font-black text-amber-50 sm:text-3xl">대장간</h3>
              </div>
              <button
                type="button"
                onClick={closeForge}
                className="rounded-xl border border-amber-800/70 bg-stone-950/80 px-4 py-2 text-sm font-black text-amber-100 shadow-inner transition hover:bg-stone-900"
              >
                나가기
              </button>
            </div>

            <div className="relative z-20 max-h-[72vh] overflow-y-auto px-5 pb-6 sm:px-8">
              {!forgeMode ? (
                <div className="grid gap-5 py-5 md:grid-cols-2">
                  <ForgeChoice
                    tone="fire"
                    icon="⚔️"
                    title="무기 강화"
                    subtitle="+1은 강철 파편, +2부터는 달의 파편을 사용합니다"
                    onClick={() => setForgeMode("weapon")}
                  />
                  <ForgeChoice
                    tone="arcane"
                    icon="💎"
                    title="마법 제련"
                    subtitle="보석과 강철 파편으로 무기에 인첸트를 부여합니다"
                    onClick={() => setForgeMode("magic")}
                  />
                </div>
              ) : (
                <div className="mx-auto max-w-xl space-y-4 rounded-[1.5rem] border border-amber-900/60 bg-stone-950/72 p-4 shadow-[inset_0_0_30px_rgba(0,0,0,0.75)] sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setForgeMode(null)}
                      className="rounded-xl border border-stone-700 bg-stone-900 px-3 py-2 text-xs font-black text-stone-200 transition hover:bg-stone-800"
                    >
                      선택으로
                    </button>
                    <div className="rounded-xl border border-amber-900/70 bg-stone-900 px-3 py-2 text-xs font-bold text-stone-300">
                      강철 파편 <b className="text-amber-200">{steelCount}</b>개 · 달의 파편{" "}
                      <b className="text-amber-200">{moonCount}</b>개
                    </div>
                  </div>

                  {forgeMode === "weapon" ? (
                    <form action={upgradeAction} className="space-y-3">
                      <h4 className="text-lg font-black text-amber-100">무기 강화</h4>
                      <StateLine state={upgradeState} />
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-stone-400">무기</span>
                        <select
                          name="weaponName"
                          className="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm font-semibold text-stone-100 outline-none focus:border-amber-400"
                        >
                          {weapons.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div>
                        <span className="mb-1 block text-xs font-bold text-stone-400">
                          무기 레벨
                        </span>
                        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-900 p-1">
                          {[1, 2, 3, 4].map((level) => (
                            <label key={level} className="cursor-pointer">
                              <input
                                type="radio"
                                name="level"
                                value={level}
                                defaultChecked={level === 1}
                                className="peer sr-only"
                              />
                              <span className="block rounded-xl px-2 py-2 text-center text-sm font-black text-stone-400 transition peer-checked:bg-amber-600 peer-checked:text-white">
                                Lv.{level}
                              </span>
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 text-xs font-semibold text-amber-100/75">
                          선택한 무기 레벨만큼 재료를 소모합니다. +1은 강철 파편, +2부터는
                          달의 파편을 사용합니다.
                        </p>
                      </div>
                      {weapons.length === 0 && (
                        <p className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-3 text-sm text-stone-400">
                          인벤토리에서 무기 후보를 찾지 못했어요. 장비 중인 무기는 시트
                          휴대품에 넣은 뒤 동기화해주세요.
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={upgradePending || weapons.length === 0}
                        className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white shadow-lg transition hover:bg-amber-500 disabled:opacity-50"
                      >
                        {upgradePending ? "강화 중..." : "강화 적용"}
                      </button>
                    </form>
                  ) : (
                    <form action={enchantAction} className="space-y-3">
                      <h4 className="text-lg font-black text-violet-100">마법 제련</h4>
                      <StateLine state={enchantState} />
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-stone-400">무기</span>
                        <select
                          name="weaponName"
                          className="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm font-semibold text-stone-100 outline-none focus:border-violet-400"
                        >
                          {weapons.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-stone-400">보석</span>
                        <select
                          name="gemName"
                          className="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm font-semibold text-stone-100 outline-none focus:border-violet-400"
                        >
                          {gems.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name} x{item.qty}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="rounded-xl border border-violet-900/60 bg-violet-950/35 px-3 py-2 text-xs text-violet-100">
                        필요 재료: 강철 파편 x2 + 선택한 보석 x1
                      </p>
                      {(weapons.length === 0 || gems.length === 0) && (
                        <p className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-3 text-sm text-stone-400">
                          무기와 보석이 모두 인벤토리에 있어야 마법 제련을 할 수 있어요.
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={enchantPending || weapons.length === 0 || gems.length === 0}
                        className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-lg transition hover:bg-violet-500 disabled:opacity-50"
                      >
                        {enchantPending ? "제련 중..." : "제련 적용"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
