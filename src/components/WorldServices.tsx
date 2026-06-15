"use client";

import { useMemo, useState, useActionState } from "react";
import {
  buyHouse,
  buyFood,
  buyLifeGear,
  depositToStorage,
  enchantWeapon,
  restAtHome,
  restAtInn,
  sellFood,
  sellLifeCatch,
  sellMaterial,
  upgradeWeapon,
  withdrawFromStorage,
  type LifeShopState,
  type HousingState,
  type MarketState,
  type ServiceState,
  type StorageState,
} from "@/app/actions/services";
import { enterHome } from "@/app/actions/world";
import type { SheetInventoryItem } from "@/lib/googleSheets";

type Props = {
  canForge: boolean;
  canGuild: boolean;
  canMarket: boolean;
  canStorage: boolean;
  canInn: boolean;
  canHousing: boolean;
  inventoryItems: SheetInventoryItem[];
  lifeStorageItems: LifeStorageItemView[];
  lifeShop: LifeShopView;
  byproducts: ByproductView[];
  materials: MaterialView[];
  inn: InnView;
  housing: HousingView;
  storage: StorageView;
};

export type InnView = {
  gold: number;
  ap: number;
  maxAp: number;
  restedToday: boolean;
};

const INN_REST_COST = 100;
const INN_REST_AMOUNT = 60;

export type HousingView = {
  gold: number;
  ap: number;
  maxAp: number;
  tier: string | null;
  name: string | null;
  restAmount: number | null;
  restedToday: boolean;
  atHome: boolean;
  options: {
    tier: string;
    name: string;
    price: number;
    restAmount: number;
    note: string;
    owned: boolean;
  }[];
};

export type ByproductView = {
  kind: "낚시" | "채집";
  name: string;
  rank: number;
  unitPrice: number;
  qty: number;
};

export type MaterialView = {
  name: string;
  unitPrice: number;
  qty: number;
};

export type StorageView = {
  maxWeight: number;
  usedWeight: number;
  items: StorageItemView[];
};

export type StorageItemView = SheetInventoryItem & {
  id: string;
  sourceKind: "basic" | "낚시" | "채집";
};

export type LifeStorageItemView = SheetInventoryItem & {
  sourceKind: "낚시" | "채집";
};

export type LifeShopView = {
  gold: number;
  bags: {
    낚시: { name: string; maxWeight: number };
    채집: { name: string; maxWeight: number };
  };
  tools: {
    낚시: string;
    채집: string;
  };
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
  // 정확히 보석 이름인 것만 (예: "다이아몬드"). "강철 검(+1, 다이아몬드)" 같은 인첸트 무기는 제외.
  return GEM_NAMES.some((name) => item.name.trim() === name);
}

function isWeapon(item: SheetInventoryItem): boolean {
  if (item.name.trim() === "강철 파편") return false;
  if (item.name.includes("파편") || isGem(item)) return false;
  const source = `${item.name} ${item.effect ?? ""}`;
  return WEAPON_HINTS.some((hint) => source.includes(hint));
}

function itemTags(name: string): string[] {
  const match = name.trim().match(/\(([^()]*)\)$/);
  if (!match) return [];
  return match[1].split(",").map((tag) => tag.trim()).filter(Boolean);
}

// 이미 인첸트된 무기 (보석 태그 또는 효과에 '인첸트')
function isEnchanted(item: SheetInventoryItem): boolean {
  const tags = itemTags(item.name);
  return GEM_NAMES.some((gem) => tags.includes(gem)) || (item.effect ?? "").includes("인첸트");
}

// 이미 강화된 무기 (+N 태그)
function isEnhanced(item: SheetInventoryItem): boolean {
  return itemTags(item.name).some((tag) => /^\+\d+$/.test(tag));
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

function LifeShopStateLine({ state }: { state: LifeShopState }) {
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

function MarketStateLine({ state }: { state: MarketState }) {
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

function HousingStateLine({ state }: { state: HousingState }) {
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
  lifeStorageItems,
  storage,
  onClose,
}: {
  inventoryItems: SheetInventoryItem[];
  lifeStorageItems: LifeStorageItemView[];
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
  const lifeItems = useMemo(
    () => lifeStorageItems.filter((item) => item.qty > 0),
    [lifeStorageItems],
  );
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
              <input type="hidden" name="sourceKind" value="basic" />
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
            {lifeItems.length > 0 && (
              <form action={depositAction} className="mt-2 grid grid-cols-[1fr_4.5rem] gap-2">
                <select
                  name="itemName"
                  className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content outline-none focus:border-brand-300"
                >
                  {lifeItems.map((item) => (
                    <option key={`${item.sourceKind}-${item.name}`} value={item.name}>
                      {item.sourceKind} · {item.name} x{item.qty}
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
                <select
                  name="sourceKind"
                  className="col-span-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content outline-none focus:border-brand-300"
                >
                  <option value="낚시">낚시 가방에서 보관</option>
                  <option value="채집">채집 가방에서 보관</option>
                </select>
                <button
                  type="submit"
                  disabled={depositPending}
                  className="col-span-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {depositPending ? "보관 중..." : "생활 가방 물건 보관"}
                </button>
              </form>
            )}
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
                        <p className="mt-0.5 text-[11px] font-bold text-brand-600">
                          {item.sourceKind === "basic" ? "기본 가방" : `${item.sourceKind} 가방`}
                        </p>
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

const LIFE_SHOP_PRODUCTS = [
  { id: "fish_bag_20", kind: "낚시", group: "가방", name: "낚시꾼 가방 20칸", price: 2000, note: "낚시 가방 최대 중량 20" },
  { id: "fish_bag_30", kind: "낚시", group: "가방", name: "낚시꾼 가방 30칸", price: 5000, note: "낚시 가방 최대 중량 30" },
  { id: "plant_bag_20", kind: "채집", group: "가방", name: "약초꾼 가방 20칸", price: 2000, note: "채집 가방 최대 중량 20" },
  { id: "plant_bag_30", kind: "채집", group: "가방", name: "약초꾼 가방 30칸", price: 5000, note: "채집 가방 최대 중량 30" },
  { id: "good_rod", kind: "낚시", group: "도구", name: "좋은 낚싯대", price: 2500, note: "낚시 장비 1단계" },
  { id: "master_rod", kind: "낚시", group: "도구", name: "고급 낚싯대", price: 7000, note: "낚시 장비 2단계" },
  { id: "good_sickle", kind: "채집", group: "도구", name: "숙련 채집 도구", price: 2500, note: "채집 장비 1단계" },
  { id: "master_sickle", kind: "채집", group: "도구", name: "장인의 채집 도구", price: 7000, note: "채집 장비 2단계" },
] as const;

function LifeGearShop({
  lifeShop,
  onClose,
}: {
  lifeShop: LifeShopView;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<LifeShopState, FormData>(buyLifeGear, undefined);
  const groups = ["가방", "도구"] as const;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="생활 장비 구매"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Market Supply
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🎒 생활 장비 구매</span>
            <span className="text-sm font-bold text-emerald-500">
              {lifeShop.gold.toLocaleString()}G
            </span>
          </h3>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 rounded-2xl bg-subtle p-3 text-xs font-bold text-muted sm:grid-cols-2">
            <p>🎣 {lifeShop.bags.낚시.name} · {lifeShop.bags.낚시.maxWeight}칸 · {lifeShop.tools.낚시}</p>
            <p>🌿 {lifeShop.bags.채집.name} · {lifeShop.bags.채집.maxWeight}칸 · {lifeShop.tools.채집}</p>
          </div>
          <LifeShopStateLine state={state} />
          {groups.map((group) => (
            <section key={group}>
              <h4 className="mb-2 text-sm font-extrabold text-content">{group}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {LIFE_SHOP_PRODUCTS.filter((item) => item.group === group).map((item) => (
                  <form key={item.id} action={action}>
                    <input type="hidden" name="productId" value={item.id} />
                    <button
                      type="submit"
                      disabled={pending}
                      className="flex h-full w-full items-start gap-3 rounded-2xl border border-line bg-subtle px-3 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                    >
                      <span className="text-xl">{item.kind === "낚시" ? "🎣" : "🌿"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-content">{item.name}</span>
                        <span className="mt-0.5 block text-[11px] text-faint">{item.note}</span>
                      </span>
                      <span className="shrink-0 text-xs font-black text-emerald-500">
                        {item.price.toLocaleString()}G
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            </section>
          ))}
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

function QuestBoard({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="의뢰 게시판"
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Guild Requests
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">📜 의뢰 게시판</h3>
        </div>
        <div className="px-5 py-4">
          <article className="rounded-2xl border border-line bg-subtle p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-extrabold text-content">고블린 부락 토벌</p>
                <p className="mt-1 text-sm text-muted">고블린 부락을 토벌해라.</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-600">
                토벌
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-surface px-2 py-2">
                <dt className="font-bold text-faint">권장 레벨</dt>
                <dd className="mt-0.5 font-extrabold text-content">Lv.3</dd>
              </div>
              <div className="rounded-xl bg-surface px-2 py-2">
                <dt className="font-bold text-faint">요구 인원</dt>
                <dd className="mt-0.5 font-extrabold text-content">4인</dd>
              </div>
              <div className="rounded-xl bg-surface px-2 py-2">
                <dt className="font-bold text-faint">보상</dt>
                <dd className="mt-0.5 font-extrabold text-emerald-500">1000G</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled
              className="mt-3 w-full rounded-xl bg-subtle-hover px-4 py-2.5 text-sm font-bold text-faint"
            >
              수락 기능 준비 중
            </button>
          </article>
        </div>
        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function HousingPanel({ housing, onClose }: { housing: HousingView; onClose: () => void }) {
  const [buyState, buyAction, buyPending] = useActionState<HousingState, FormData>(
    buyHouse,
    undefined,
  );
  const [restState, restAction, restPending] = useActionState<HousingState, FormData>(
    restAtHome,
    undefined,
  );
  const owned = housing.options.some((option) => option.owned);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="하우징"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Housing
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🏠 하우징</span>
            <span className="text-sm font-bold text-emerald-500">
              {housing.gold.toLocaleString()}G
            </span>
          </h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <HousingStateLine state={buyState} />
          <HousingStateLine state={restState} />

          {owned ? (
            <section className="rounded-2xl border border-line bg-subtle p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold text-content">{housing.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    가구를 배치해 생활 보너스를 얻는 공간입니다.
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-600">
                  보유중
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-surface px-3 py-3">
                  <p className="text-xs font-bold text-faint">휴식 회복</p>
                  <p className="mt-1 text-lg font-extrabold text-content">
                    +{housing.restAmount}
                  </p>
                </div>
                <div className="rounded-xl bg-surface px-3 py-3">
                  <p className="text-xs font-bold text-faint">현재 피로도</p>
                  <p className="mt-1 text-lg font-extrabold text-content">
                    {housing.ap}/{housing.maxAp}
                  </p>
                </div>
                <div className="rounded-xl bg-surface px-3 py-3">
                  <p className="text-xs font-bold text-faint">초기화</p>
                  <p className="mt-1 text-sm font-extrabold text-content">KST 자정</p>
                </div>
              </div>
              <form action={restAction} className="mt-4">
                <button
                  type="submit"
                  disabled={restPending || housing.restedToday || !housing.atHome}
                  className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  {housing.atHome
                    ? housing.restedToday
                      ? "오늘 집 휴식 완료"
                      : "집에서 휴식"
                    : "본인 집에서만 휴식 가능"}
                </button>
              </form>
            </section>
          ) : (
            <p className="rounded-2xl bg-subtle px-4 py-3 text-sm text-muted">
              종탑 거리의 중개인을 통해 집을 구매할 수 있어요. 집을 사면 이동 가능 구역에
              본인 집이 생깁니다.
            </p>
          )}

          <section className="space-y-2">
            <h4 className="text-sm font-extrabold text-content">주택 목록</h4>
            <div className="grid gap-2">
              {housing.options.map((option) => (
                <form key={option.tier} action={option.owned ? enterHome : buyAction}>
                  <input type="hidden" name="tier" value={option.tier} />
                  <button
                    type="submit"
                    disabled={buyPending}
                    className="flex w-full items-start gap-3 rounded-2xl border border-line bg-subtle px-3 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                  >
                    <span className="text-xl">🏡</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-content">
                        {option.name}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-faint">{option.note}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                        option.owned
                          ? "bg-brand-50 text-brand-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {option.owned ? "입장" : `${option.price.toLocaleString()}G`}
                    </span>
                  </button>
                </form>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-line p-4">
            <p className="text-sm font-extrabold text-content">🪑 가구 배치</p>
            <p className="mt-1 text-sm text-faint">
              준비 중입니다. 이후 침대, 책상, 조리대 같은 가구를 추가하고 보너스를 붙일 수
              있게 확장할 예정입니다.
            </p>
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

const FOOD_PRODUCTS = [
  { id: "egg", name: "달걀", buyPrice: 20, sellPrice: 10 },
  { id: "milk", name: "우유", buyPrice: 30, sellPrice: 15 },
  { id: "meat", name: "고기", buyPrice: 80, sellPrice: 40 },
  { id: "vegetable", name: "채소", buyPrice: 35, sellPrice: 18 },
  { id: "fruit", name: "과일", buyPrice: 45, sellPrice: 22 },
  { id: "water", name: "물", buyPrice: 10, sellPrice: 5 },
  { id: "wheat", name: "밀", buyPrice: 25, sellPrice: 12 },
  { id: "salt", name: "소금", buyPrice: 15, sellPrice: 8 },
  { id: "spice", name: "향신료", buyPrice: 60, sellPrice: 30 },
  { id: "cheese", name: "치즈", buyPrice: 50, sellPrice: 25 },
] as const;

function FoodMarket({ onClose }: { onClose: () => void }) {
  const [buyState, buyAction, buyPending] = useActionState<MarketState, FormData>(
    buyFood,
    undefined,
  );
  const [sellState, sellAction, sellPending] = useActionState<MarketState, FormData>(
    sellFood,
    undefined,
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="식료품 상점"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Market Pantry
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">🥚 식료품 상점</h3>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <MarketStateLine state={buyState} />
          <MarketStateLine state={sellState} />
          <div className="grid gap-2 sm:grid-cols-2">
            {FOOD_PRODUCTS.map((item) => (
              <div key={item.id} className="rounded-2xl border border-line bg-subtle p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-content">{item.name}</p>
                    <p className="text-[11px] text-faint">
                      구매 {item.buyPrice}G · 판매 {item.sellPrice}G · 중량 1
                    </p>
                  </div>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                    식재료
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <form action={buyAction} className="grid grid-cols-[1fr_3.5rem] gap-1.5">
                    <input type="hidden" name="productId" value={item.id} />
                    <button
                      type="submit"
                      disabled={buyPending}
                      className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                    >
                      구매
                    </button>
                    <input
                      name="qty"
                      type="number"
                      min="1"
                      defaultValue="1"
                      className="rounded-xl border border-line bg-surface px-2 py-2 text-xs font-bold text-content outline-none focus:border-brand-300"
                    />
                  </form>
                  <form action={sellAction} className="grid grid-cols-[1fr_3.5rem] gap-1.5">
                    <input type="hidden" name="productId" value={item.id} />
                    <button
                      type="submit"
                      disabled={sellPending}
                      className="rounded-xl bg-surface px-3 py-2 text-xs font-bold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
                    >
                      판매
                    </button>
                    <input
                      name="qty"
                      type="number"
                      min="1"
                      defaultValue="1"
                      className="rounded-xl border border-line bg-surface px-2 py-2 text-xs font-bold text-content outline-none focus:border-brand-300"
                    />
                  </form>
                </div>
              </div>
            ))}
          </div>
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

function ByproductMarket({
  byproducts,
  materials,
  onClose,
}: {
  byproducts: ByproductView[];
  materials: MaterialView[];
  onClose: () => void;
}) {
  const [lifeState, lifeAction, lifePending] = useActionState<MarketState, FormData>(
    sellLifeCatch,
    undefined,
  );
  const [matState, matAction, matPending] = useActionState<MarketState, FormData>(
    sellMaterial,
    undefined,
  );
  const sellable = byproducts.filter((item) => item.qty > 0);
  const sellableMaterials = materials.filter((item) => item.qty > 0);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="부산물 매입"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Byproduct Trader
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">🐟 부산물 매입</h3>
          <p className="mt-1 text-[11px] text-faint">
            잡은 물고기·약초와 채집한 재료를 골드로 바꿔요.
          </p>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {sellable.length === 0 && sellableMaterials.length === 0 && (
            <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
              팔 수 있는 물건이 없어요.
            </p>
          )}

          {sellable.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">어획물 · 채집품</h4>
              <MarketStateLine state={lifeState} />
              <div className="grid gap-2 sm:grid-cols-2">
                {sellable.map((item) => (
                  <div
                    key={`${item.kind}-${item.name}`}
                    className="rounded-2xl border border-line bg-subtle p-3"
                  >
                    <div className="mb-2 min-w-0">
                      <p className="truncate text-sm font-extrabold text-content">
                        {item.kind === "낚시" ? "🎣" : "🌿"} {item.name}
                      </p>
                      <p className="text-[11px] text-faint">
                        R{item.rank} · 개당 {item.unitPrice.toLocaleString()}G · {item.qty}개 보유
                      </p>
                    </div>
                    <form action={lifeAction} className="grid grid-cols-[1fr_3.5rem] gap-1.5">
                      <input type="hidden" name="kind" value={item.kind} />
                      <input type="hidden" name="itemName" value={item.name} />
                      <button
                        type="submit"
                        disabled={lifePending}
                        className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                      >
                        {item.unitPrice > 0 ? "판매" : "버리기"}
                      </button>
                      <input
                        name="qty"
                        type="number"
                        min="1"
                        max={item.qty}
                        defaultValue="1"
                        className="rounded-xl border border-line bg-surface px-2 py-2 text-xs font-bold text-content outline-none focus:border-brand-300"
                      />
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sellableMaterials.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">재료 · 보석</h4>
              <MarketStateLine state={matState} />
              <div className="grid gap-2 sm:grid-cols-2">
                {sellableMaterials.map((item) => (
                  <div key={item.name} className="rounded-2xl border border-line bg-subtle p-3">
                    <div className="mb-2 min-w-0">
                      <p className="truncate text-sm font-extrabold text-content">⛏️ {item.name}</p>
                      <p className="text-[11px] text-faint">
                        개당 {item.unitPrice.toLocaleString()}G · {item.qty}개 보유
                      </p>
                    </div>
                    <form action={matAction} className="grid grid-cols-[1fr_3.5rem] gap-1.5">
                      <input type="hidden" name="itemName" value={item.name} />
                      <button
                        type="submit"
                        disabled={matPending || item.unitPrice <= 0}
                        className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-600 disabled:opacity-50"
                      >
                        판매
                      </button>
                      <input
                        name="qty"
                        type="number"
                        min="1"
                        max={item.qty}
                        defaultValue="1"
                        className="rounded-xl border border-line bg-surface px-2 py-2 text-xs font-bold text-content outline-none focus:border-brand-300"
                      />
                    </form>
                  </div>
                ))}
              </div>
            </section>
          )}
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

function InnRest({ inn, onClose }: { inn: InnView; onClose: () => void }) {
  const [state, action, pending] = useActionState<MarketState, FormData>(restAtInn, undefined);
  const full = inn.ap >= inn.maxAp;
  const poor = inn.gold < INN_REST_COST;
  const blocked = inn.restedToday || full || poor || pending;
  const actualGain = Math.max(0, Math.min(INN_REST_AMOUNT, inn.maxAp - inn.ap));
  const note = inn.restedToday
    ? "오늘은 이미 휴식했어요. 내일 다시 오세요."
    : full
      ? "피로도가 이미 가득 찼어요."
      : poor
        ? `골드가 부족해요. (${INN_REST_COST}G 필요)`
        : `이번 휴식 회복량: 피로도 +${actualGain} (${inn.ap} → ${inn.ap + actualGain})`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="여관 휴식"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">Inn</p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🛏️ 여관 휴식</span>
            <span className="text-sm font-bold text-emerald-500">{inn.gold.toLocaleString()}G</span>
          </h3>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div className="rounded-2xl bg-subtle px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-muted">현재 피로도</span>
              <span className="font-extrabold text-content">
                {inn.ap} / {inn.maxAp}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                style={{ width: `${Math.min(100, (inn.ap / inn.maxAp) * 100)}%` }}
              />
            </div>
          </div>
          <MarketStateLine state={state} />
          <p className="px-1 text-xs text-faint">{note}</p>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
            ⚠️ 최대 피로도({inn.maxAp})를 넘는 분량은 회복되지 않아요.
          </p>
          <form action={action}>
            <button
              type="submit"
              disabled={blocked}
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {pending
                ? "휴식 중..."
                : inn.restedToday
                  ? "오늘 휴식 완료"
                  : `휴식하기 (-${INN_REST_COST}G · 피로도 +${INN_REST_AMOUNT})`}
            </button>
          </form>
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

export default function WorldServices({
  canForge,
  canGuild,
  canMarket,
  canStorage,
  canInn,
  canHousing,
  inventoryItems,
  lifeStorageItems,
  lifeShop,
  byproducts,
  materials,
  inn,
  housing,
  storage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [lifeShopOpen, setLifeShopOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [foodMarketOpen, setFoodMarketOpen] = useState(false);
  const [byproductOpen, setByproductOpen] = useState(false);
  const [innOpen, setInnOpen] = useState(false);
  const [housingOpen, setHousingOpen] = useState(false);
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
  // 인첸트 대상: 강화(+N)·인첸트가 안 된 깨끗한 무기만
  const enchantableWeapons = weapons.filter((w) => !isEnchanted(w) && !isEnhanced(w));
  const gems = items.filter(isGem);
  const steelCount = countOf(items, "강철 파편");
  const moonCount = countOf(items, "달의 파편");

  if (!canForge && !canGuild && !canMarket && !canStorage && !canInn && !canHousing) return null;

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
          {canMarket && (
            <>
              <button
                type="button"
                onClick={() => setFoodMarketOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="text-xl">🥚</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-content">식료품 상점</span>
                  <span className="text-[11px] text-faint">요리 재료 구매 · 판매</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setByproductOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="text-xl">🐟</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-content">부산물 매입</span>
                  <span className="text-[11px] text-faint">어획물 · 채집품 · 재료 판매</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLifeShopOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="text-xl">🎒</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-content">생활 장비 구매</span>
                  <span className="text-[11px] text-faint">가방 확장 · 낚싯대 · 채집 도구</span>
                </span>
              </button>
            </>
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
          {canGuild && (
            <button
              type="button"
              onClick={() => setQuestOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">📜</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">의뢰 게시판</span>
                <span className="text-[11px] text-faint">토벌 의뢰 확인</span>
              </span>
            </button>
          )}
          {canInn && (
            <button
              type="button"
              onClick={() => setInnOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🛏️</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">여관 휴식</span>
                <span className="text-[11px] text-faint">
                  {inn.restedToday ? "오늘 휴식 완료" : `100G · 피로도 +${INN_REST_AMOUNT} (하루 1회)`}
                </span>
              </span>
            </button>
          )}
          {canHousing && (
            <button
              type="button"
              onClick={() => setHousingOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🏠</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">
                  {housing.tier ? "하우징" : "집 구매"}
                </span>
                <span className="text-[11px] text-faint">
                  {housing.tier
                    ? `${housing.name} · 휴식 +${housing.restAmount}`
                    : "종탑 거리 부동산"}
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {storageOpen && (
        <StorageManager
          inventoryItems={inventoryItems}
          lifeStorageItems={lifeStorageItems}
          storage={storage}
          onClose={() => setStorageOpen(false)}
        />
      )}

      {lifeShopOpen && (
        <LifeGearShop lifeShop={lifeShop} onClose={() => setLifeShopOpen(false)} />
      )}

      {questOpen && <QuestBoard onClose={() => setQuestOpen(false)} />}

      {foodMarketOpen && <FoodMarket onClose={() => setFoodMarketOpen(false)} />}

      {byproductOpen && (
        <ByproductMarket
          byproducts={byproducts}
          materials={materials}
          onClose={() => setByproductOpen(false)}
        />
      )}

      {innOpen && <InnRest inn={inn} onClose={() => setInnOpen(false)} />}

      {housingOpen && <HousingPanel housing={housing} onClose={() => setHousingOpen(false)} />}

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
                          {enchantableWeapons.map((item) => (
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
                      {(enchantableWeapons.length === 0 || gems.length === 0) && (
                        <p className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-3 text-sm text-stone-400">
                          제련 가능한 무기(강화·인첸트 안 된)와 보석이 모두 있어야 마법 제련을 할 수 있어요.
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={enchantPending || enchantableWeapons.length === 0 || gems.length === 0}
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
