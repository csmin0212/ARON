"use client";

import { useMemo, useState, useActionState } from "react";
import { enchantWeapon, upgradeWeapon, type ServiceState } from "@/app/actions/services";
import type { SheetInventoryItem } from "@/lib/googleSheets";

type Props = {
  canForge: boolean;
  inventoryItems: SheetInventoryItem[];
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
  const source = `${item.name} ${item.effect ?? ""}`;
  return WEAPON_HINTS.some((hint) => source.includes(hint));
}

function countOf(items: SheetInventoryItem[], name: string): number {
  return items.find((item) => item.name === name)?.qty ?? 0;
}

function StateLine({ state }: { state: ServiceState }) {
  if (state?.error) return <p className="text-xs font-semibold text-rose-500">{state.error}</p>;
  if (state?.ok) return <p className="text-xs font-semibold text-emerald-500">{state.ok}</p>;
  return null;
}

export default function WorldServices({ canForge, inventoryItems }: Props) {
  const [open, setOpen] = useState(false);
  const [forgeTab, setForgeTab] = useState<"weapon" | "magic">("weapon");
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

  if (!canForge) return null;

  return (
    <>
      <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        <h2 className="mb-3 px-1 text-sm font-extrabold text-content">🏷️ 시설</h2>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
        >
          <span className="text-xl">⚒️</span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-content">대장간</span>
            <span className="text-[11px] text-faint">무기 강화 · 마법 강화</span>
          </span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="대장간"
            className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line bg-subtle px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Forge</p>
                <h3 className="mt-1 text-xl font-extrabold text-content">대장간</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2 text-sm font-bold text-faint transition hover:bg-surface hover:text-content"
              >
                닫기
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-subtle p-1">
                  <button
                    type="button"
                    onClick={() => setForgeTab("weapon")}
                    className={`rounded-xl px-3 py-2 text-sm font-extrabold transition ${
                      forgeTab === "weapon"
                        ? "bg-surface text-content shadow-sm"
                        : "text-muted hover:text-content"
                    }`}
                  >
                    무기 강화
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgeTab("magic")}
                    className={`rounded-xl px-3 py-2 text-sm font-extrabold transition ${
                      forgeTab === "magic"
                        ? "bg-surface text-content shadow-sm"
                        : "text-muted hover:text-content"
                    }`}
                  >
                    마법 강화
                  </button>
                </div>

                <div className="rounded-2xl border border-line px-3 py-2 text-xs text-muted">
                  보유 강철 파편 <b className="text-content">{steelCount}</b>개
                </div>

                {forgeTab === "weapon" ? (
                  <form action={upgradeAction} className="space-y-3">
                    <StateLine state={upgradeState} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-faint">무기</span>
                      <select
                        name="weaponName"
                        className="w-full rounded-xl border border-line bg-subtle px-3 py-2.5 text-sm font-semibold text-content outline-none focus:border-brand-400"
                      >
                        {weapons.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div>
                      <span className="mb-1 block text-xs font-bold text-faint">무기 레벨</span>
                      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-subtle p-1">
                        {[1, 2, 3, 4].map((level) => (
                          <label key={level} className="cursor-pointer">
                            <input
                              type="radio"
                              name="level"
                              value={level}
                              defaultChecked={level === 1}
                              className="peer sr-only"
                            />
                            <span className="block rounded-xl px-2 py-2 text-center text-sm font-extrabold text-muted transition peer-checked:bg-surface peer-checked:text-brand-600 peer-checked:shadow-sm">
                              Lv.{level}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {weapons.length === 0 && (
                      <p className="rounded-xl bg-subtle px-3 py-3 text-sm text-faint">
                        인벤토리에서 무기 후보를 찾지 못했어요. 장비 중인 무기는 시트
                        휴대품에 넣은 뒤 동기화해주세요.
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={upgradePending || weapons.length === 0}
                      className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                    >
                      {upgradePending ? "강화 중..." : "강화 적용"}
                    </button>
                  </form>
                ) : (
                  <form action={enchantAction} className="space-y-3">
                    <StateLine state={enchantState} />
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-faint">무기</span>
                      <select
                        name="weaponName"
                        className="w-full rounded-xl border border-line bg-subtle px-3 py-2.5 text-sm font-semibold text-content outline-none focus:border-brand-400"
                      >
                        {weapons.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold text-faint">보석</span>
                      <select
                        name="gemName"
                        className="w-full rounded-xl border border-line bg-subtle px-3 py-2.5 text-sm font-semibold text-content outline-none focus:border-brand-400"
                      >
                        {gems.map((item) => (
                          <option key={item.name} value={item.name}>
                            {item.name} x{item.qty}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="rounded-xl bg-subtle px-3 py-2 text-xs text-muted">
                      필요 재료: 강철 파편 x2 + 선택한 보석 x1
                    </p>
                    {(weapons.length === 0 || gems.length === 0) && (
                      <p className="rounded-xl bg-subtle px-3 py-3 text-sm text-faint">
                        무기와 보석이 모두 인벤토리에 있어야 마법 강화를 할 수 있어요.
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={enchantPending || weapons.length === 0 || gems.length === 0}
                      className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                    >
                      {enchantPending ? "인첸트 중..." : "인첸트 적용"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
