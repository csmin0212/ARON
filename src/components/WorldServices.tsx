"use client";

import { useMemo, useState, useActionState } from "react";
import {
  buyFurniture,
  buyHouse,
  buyFood,
  buyLifeGear,
  cookDish,
  depositToStorage,
  enchantWeapon,
  expandStorage,
  promoteAdventurerRank,
  redeemHousingProduction,
  renameHome,
  restAtHome,
  restAtInn,
  sellCookedFood,
  sellHouse,
  sellFood,
  reforgeItem,
  stockHousingProduction,
  upgradeWeapon,
  useFurniture,
  withdrawHousingProduction,
  withdrawFromStorage,
  type CookingState,
  type GuildState,
  type LifeShopState,
  type HousingState,
  type MarketState,
  type ServiceState,
  type StorageState,
} from "@/app/actions/services";
import { inviteToHouse, type FriendState } from "@/app/actions/friends";
import { enterHome } from "@/app/actions/world";
import { FURNITURE_OPTIONS } from "@/lib/housing";
import { adventurerRankGoal, nextAdventurerRank, normalizeAdventurerRank } from "@/lib/adventurerRank";
import GuildQuestBoard, { type GuildQuestBoardView } from "@/components/GuildQuestBoard";
import CraftingForge, { type CraftMineralView } from "@/components/CraftingForge";
import RecipeGacha from "@/components/RecipeGacha";
import { detectForgeSlot } from "@/lib/forge";
import type { SheetInventoryItem } from "@/lib/googleSheets";

type Props = {
  canForge: boolean;
  canGuild: boolean;
  canMarket: boolean;
  canStorage: boolean;
  canInn: boolean;
  canHousing: boolean;
  canGacha: boolean;
  cooking: CookingView;
  inventoryItems: SheetInventoryItem[];
  lifeStorageItems: LifeStorageItemView[];
  lifeShop: LifeShopView;
  inn: InnView;
  housing: HousingView;
  storage: StorageView;
  guild: GuildView;
  craftMinerals: CraftMineralView[];
  isBlacksmith: boolean;
  craftSmithLevel: number;
  craftAp: number;
  craftTags: Record<string, string>;
  craftTagSlots: Record<string, string>;
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
  atHome: boolean; // 본인 집에 있을 때만 true (친구 집 방문은 false)
  options: {
    tier: string;
    name: string;
    price: number;
    restAmount: number;
    note: string;
    owned: boolean;
    sellPrice: number;
  }[];
  furnitureOwned: string[]; // 보유 가구 id — 집을 옮겨도 유지
  furnitureUsedToday: Record<string, boolean>; // 가구 id → 오늘 상호작용 여부
  production: Record<"낚시" | "채집", HousingProductionView>;
  homeName: string | null; // 문패로 지은 집 이름
  friends: { id: string; nickname: string }[]; // 집 초대 대상 (친구만)
};

export type HousingProductionView = {
  points: number;
  dailyPoints: number;
  slots: {
    name: string;
    rank: number;
    weight: number;
    text: string;
  }[];
  bagItems: {
    name: string;
    rank: number;
    qty: number;
  }[];
  redeemItems: {
    name: string;
    rank: number;
    cost: number;
  }[];
};

export type KnownRecipeView = {
  id: string;
  name: string;
  rank: string;
  category: string;
  ingredients: string;
  resultName: string;
  sellPrice: number;
  effect: string | null;
  tags: string | null;
};

export type CookedFoodView = {
  name: string;
  qty: number;
  unitPrice: number;
  effect: string | null;
};

export type CookingView = {
  enabled: boolean;
  facility: "public" | "home";
  facilityName: string;
  maxIngredients: number;
  ap: number;
  knownRecipes: KnownRecipeView[];
  cookedFoods: CookedFoodView[];
};

export type StorageView = {
  maxWeight: number;
  usedWeight: number;
  upgradeCost: number;
  upgradeAmount: number;
  items: StorageItemView[];
};

export type GuildView = {
  rank: string;
  fame: number;
  quests: GuildQuestBoardView;
};

export type StorageItemView = SheetInventoryItem & {
  id: string;
  sourceKind: "basic" | "낚시" | "채집" | "채광";
};

export type LifeStorageItemView = SheetInventoryItem & {
  sourceKind: "낚시" | "채집" | "채광";
};

export type LifeShopView = {
  gold: number;
  bags: {
    낚시: { name: string; maxWeight: number };
    채집: { name: string; maxWeight: number };
    채광: { name: string; maxWeight: number };
  };
  tools: {
    낚시: string;
    채집: string;
    채광: string;
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

function CookingStateLine({ state }: { state: CookingState }) {
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
  onClick,
}: {
  tone: "fire" | "arcane";
  icon: string;
  title: string;
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
  const [upgradeState, upgradeAction, upgradePending] = useActionState<StorageState, FormData>(
    expandStorage,
    undefined,
  );
  const [view, setView] = useState<"deposit" | "storage">("deposit");
  const items = useMemo(() => mergeItems(inventoryItems), [inventoryItems]);
  const lifeItems = useMemo(
    () => lifeStorageItems.filter((item) => item.qty > 0),
    [lifeStorageItems],
  );
  const storageItems = storage.items.filter((item) => item.qty > 0);
  const fill = Math.min(100, Math.round((storage.usedWeight / storage.maxWeight) * 100));

  const SOURCE_BADGE: Record<string, string> = { basic: "🎒", 낚시: "🎣", 채집: "🌿", 채광: "⛏️" };
  // 기본 + 생활 가방을 한 리스트로 — 행마다 바로 보관
  const depositRows = [
    ...items.map((item) => ({ ...item, sourceKind: "basic" as const })),
    ...lifeItems,
  ];

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
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
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

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StorageStateLine state={upgradeState} />
          <form action={upgradeAction} className="mb-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-content">창고 확장</p>
                <p className="mt-0.5 text-xs text-brand-600">
                  최대 중량 +{storage.upgradeAmount} · {storage.upgradeCost.toLocaleString()}G
                </p>
              </div>
              <button
                type="submit"
                disabled={upgradePending}
                className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                확장
              </button>
            </div>
          </form>
          {/* 맡기기 / 창고 탭 */}
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-subtle p-1">
            {(
              [
                { key: "deposit" as const, label: `🎒 맡기기 (${depositRows.length})` },
                { key: "storage" as const, label: `📦 창고 (${storageItems.length})` },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`rounded-xl py-2 text-sm font-extrabold transition ${
                  view === tab.key ? "bg-surface text-brand-600 shadow-sm" : "text-muted hover:text-content"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {view === "deposit" ? (
            <>
              <StorageStateLine state={depositState} />
              {depositRows.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  맡길 물건이 없어요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {depositRows.map((item) => (
                    <li
                      key={`${item.sourceKind}-${item.name}`}
                      className="flex items-center gap-2.5 rounded-2xl bg-subtle px-3 py-2.5"
                    >
                      <span className="shrink-0 text-lg" title={item.sourceKind === "basic" ? "기본 가방" : `${item.sourceKind} 가방`}>
                        {SOURCE_BADGE[item.sourceKind] ?? "🎒"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold text-content">
                          {item.name} <span className="text-brand-600">x{item.qty}</span>
                          {item.weight != null && (
                            <span className="ml-1 text-[10px] font-bold text-faint">중량 {item.weight}</span>
                          )}
                        </p>
                        {item.effect && (
                          <p className="truncate text-[10px] text-faint">{item.effect}</p>
                        )}
                      </div>
                      <form action={depositAction} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="itemName" value={item.name} />
                        <input type="hidden" name="sourceKind" value={item.sourceKind} />
                        <input
                          name="qty"
                          type="number"
                          min="1"
                          max={item.qty}
                          defaultValue="1"
                          className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-center text-xs font-bold text-content outline-none focus:border-brand-300"
                        />
                        <button
                          type="submit"
                          disabled={depositPending}
                          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
                        >
                          보관
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <StorageStateLine state={withdrawState} />
              {storageItems.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  아직 맡긴 물건이 없어요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {storageItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-2xl bg-subtle px-3 py-2.5"
                    >
                      <span className="shrink-0 text-lg" title={item.sourceKind === "basic" ? "기본 가방" : `${item.sourceKind} 가방`}>
                        {SOURCE_BADGE[item.sourceKind] ?? "🎒"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-extrabold text-content">
                          {item.name} <span className="text-brand-600">x{item.qty}</span>
                          {item.weight != null && (
                            <span className="ml-1 text-[10px] font-bold text-faint">중량 {item.weight}</span>
                          )}
                        </p>
                        {item.effect && (
                          <p className="truncate text-[10px] text-faint">{item.effect}</p>
                        )}
                      </div>
                      <form action={withdrawAction} className="flex shrink-0 items-center gap-1.5">
                        <input type="hidden" name="entryId" value={item.id} />
                        <input
                          name="qty"
                          type="number"
                          min="1"
                          max={item.qty}
                          defaultValue="1"
                          className="w-14 rounded-lg border border-line bg-surface px-2 py-1.5 text-center text-xs font-bold text-content outline-none focus:border-brand-300"
                        />
                        <button
                          type="submit"
                          disabled={withdrawPending}
                          className="rounded-lg border border-brand-200 bg-surface px-3 py-1.5 text-xs font-extrabold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
                        >
                          꺼내기
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </>
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

const LIFE_SHOP_PRODUCTS = [
  { id: "fish_bag_10", kind: "낚시", group: "가방", name: "낚시꾼 가방 10칸", price: 1000, note: "낚시 가방 최대 중량 10" },
  { id: "fish_bag_20", kind: "낚시", group: "가방", name: "낚시꾼 가방 20칸", price: 2500, note: "낚시 가방 최대 중량 20" },
  { id: "fish_bag_30", kind: "낚시", group: "가방", name: "낚시꾼 가방 30칸", price: 5000, note: "낚시 가방 최대 중량 30" },
  { id: "plant_bag_10", kind: "채집", group: "가방", name: "약초꾼 가방 10칸", price: 1000, note: "채집 가방 최대 중량 10" },
  { id: "plant_bag_20", kind: "채집", group: "가방", name: "약초꾼 가방 20칸", price: 2500, note: "채집 가방 최대 중량 20" },
  { id: "plant_bag_30", kind: "채집", group: "가방", name: "약초꾼 가방 30칸", price: 5000, note: "채집 가방 최대 중량 30" },
  { id: "mine_bag_10", kind: "채광", group: "가방", name: "광부 가방 10칸", price: 1000, note: "채광 가방 최대 중량 10" },
  { id: "mine_bag_20", kind: "채광", group: "가방", name: "광부 가방 20칸", price: 2500, note: "채광 가방 최대 중량 20" },
  { id: "mine_bag_30", kind: "채광", group: "가방", name: "광부 가방 30칸", price: 5000, note: "채광 가방 최대 중량 30" },
  { id: "good_rod", kind: "낚시", group: "도구", name: "좋은 낚싯대", price: 2500, note: "낚시 장비 1단계" },
  { id: "master_rod", kind: "낚시", group: "도구", name: "고급 낚싯대", price: 7000, note: "낚시 장비 2단계" },
  { id: "good_sickle", kind: "채집", group: "도구", name: "숙련 채집 도구", price: 2500, note: "채집 장비 1단계" },
  { id: "master_sickle", kind: "채집", group: "도구", name: "장인의 채집 도구", price: 7000, note: "채집 장비 2단계" },
  { id: "iron_pick", kind: "채광", group: "도구", name: "철 곡괭이", price: 2500, note: "채광 장비 1단계" },
  { id: "mithril_pick", kind: "채광", group: "도구", name: "미스릴 곡괭이", price: 7000, note: "채광 장비 2단계" },
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
  const kindTabs = ["낚시", "채집", "채광"] as const;
  const kindEmoji: Record<string, string> = { 낚시: "🎣", 채집: "🌿", 채광: "⛏️" };
  const [kindTab, setKindTab] = useState<(typeof kindTabs)[number]>("낚시");

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
          {/* 낚시 / 채집 / 채광 탭 */}
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-subtle p-1.5">
            {kindTabs.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setKindTab(kind)}
                className={`rounded-xl px-3 py-2 text-sm font-extrabold transition ${
                  kindTab === kind
                    ? "bg-surface text-brand-600 shadow-sm"
                    : "text-muted hover:bg-surface/70 hover:text-content"
                }`}
              >
                {kindEmoji[kind]} {kind}
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-subtle p-3 text-xs font-bold text-muted">
            <p>
              {kindEmoji[kindTab]} {lifeShop.bags[kindTab].name} · {lifeShop.bags[kindTab].maxWeight}칸 ·{" "}
              {lifeShop.tools[kindTab]}
            </p>
          </div>
          <LifeShopStateLine state={state} />
          {groups.map((group) => (
            <section key={group}>
              <h4 className="mb-2 text-sm font-extrabold text-content">{group}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {LIFE_SHOP_PRODUCTS.filter((item) => item.group === group && item.kind === kindTab).map(
                  (item) => (
                    <form key={item.id} action={action}>
                      <input type="hidden" name="productId" value={item.id} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="flex h-full w-full items-start gap-3 rounded-2xl border border-line bg-subtle px-3 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-50"
                      >
                        <span className="text-xl">{kindEmoji[item.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-extrabold text-content">{item.name}</span>
                          <span className="mt-0.5 block text-[11px] text-faint">{item.note}</span>
                        </span>
                        <span className="shrink-0 text-xs font-black text-emerald-500">
                          {item.price.toLocaleString()}G
                        </span>
                      </button>
                    </form>
                  ),
                )}
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

function GuildStateLine({ state }: { state?: { ok?: string; error?: string } }) {
  if (!state?.ok && !state?.error) return null;
  return (
    <p className={`mt-2 text-xs font-bold ${state.error ? "text-rose-500" : "text-emerald-500"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

function QuestBoard({ guild, onClose }: { guild: GuildView; onClose: () => void }) {
  const [tab, setTab] = useState<"quests" | "shards">("quests");
  const [rankState, rankAction, rankPending] = useActionState<GuildState, FormData>(
    promoteAdventurerRank,
    undefined,
  );
  const rank = normalizeAdventurerRank(guild.rank);
  const goal = adventurerRankGoal(rank);
  const nextRank = nextAdventurerRank(rank);
  const ready = !!nextRank && guild.fame >= goal;
  const pct = goal > 0 ? Math.min(100, Math.round((guild.fame / goal) * 100)) : 100;
  const fragTotal = guild.quests.frags.일반 + guild.quests.frags.고급;

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
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Adventurer Guild
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">🏛️ 모험가 길드</h3>
          <div className="mt-3 flex gap-1">
            {(
              [
                { key: "quests" as const, label: "📜 의뢰 게시판" },
                { key: "shards" as const, label: `🧩 파편 교환소${fragTotal > 0 ? ` (${fragTotal})` : ""}` },
              ]
            ).map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={`rounded-t-xl px-4 py-2 text-sm font-extrabold transition ${
                  tab === entry.key
                    ? "bg-surface text-brand-600 shadow-sm"
                    : "text-muted hover:text-content"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {tab === "shards" ? (
            <GuildQuestBoard view={guild.quests} section="shards" />
          ) : (
            <>
          <section className="rounded-2xl border border-line bg-subtle p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-faint">모험가 랭크</p>
                <p className="mt-0.5 text-lg font-extrabold text-content">
                  길드 등급 {rank}
                  {nextRank ? <span className="text-faint"> → {nextRank}</span> : null}
                </p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-2xl font-black text-white shadow-sm">
                {rank}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-brand-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-faint">
              <span>{nextRank ? `승급 필요 명성 ${goal.toLocaleString()}` : "최고 등급"}</span>
              <span>
                {guild.fame.toLocaleString()} / {goal.toLocaleString()}
              </span>
            </div>
            <form action={rankAction} className="mt-3">
              <button
                type="submit"
                disabled={!ready || rankPending}
                className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600 disabled:bg-subtle-hover disabled:text-faint"
              >
                {nextRank
                  ? rankPending
                    ? "승급 처리 중..."
                    : ready
                      ? `${nextRank} 등급으로 승급`
                      : "명성이 부족합니다"
                  : "최고 등급입니다"}
              </button>
              <GuildStateLine state={rankState} />
            </form>
          </section>
          <GuildQuestBoard view={guild.quests} section="quests" />
            </>
          )}
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
  const [tab, setTab] = useState<"rest" | "buy" | "furniture">("rest");
  const [buyState, buyAction, buyPending] = useActionState<HousingState, FormData>(
    buyHouse,
    undefined,
  );
  const [restState, restAction, restPending] = useActionState<HousingState, FormData>(
    restAtHome,
    undefined,
  );
  const [sellState, sellAction, sellPending] = useActionState<HousingState, FormData>(
    sellHouse,
    undefined,
  );
  const [furnState, furnAction, furnPending] = useActionState<HousingState, FormData>(
    buyFurniture,
    undefined,
  );
  const [interactState, interactAction, interactPending] = useActionState<HousingState, FormData>(
    useFurniture,
    undefined,
  );
  const [renameState, renameAction, renamePending] = useActionState<HousingState, FormData>(
    renameHome,
    undefined,
  );
  const [stockState, stockAction, stockPending] = useActionState<HousingState, FormData>(
    stockHousingProduction,
    undefined,
  );
  const [withdrawProdState, withdrawProdAction, withdrawProdPending] = useActionState<HousingState, FormData>(
    withdrawHousingProduction,
    undefined,
  );
  const [redeemState, redeemAction, redeemPending] = useActionState<HousingState, FormData>(
    redeemHousingProduction,
    undefined,
  );
  const [inviteState, inviteAction, invitePending] = useActionState<FriendState, FormData>(
    inviteToHouse,
    undefined,
  );
  const owned = housing.options.some((option) => option.owned);
  const ownedOption = housing.options.find((option) => option.owned) ?? null;
  const ownedFurniture = new Set(housing.furnitureOwned);
  const hasNameplate = housing.furnitureOwned.some(
    (id) => FURNITURE_OPTIONS.find((f) => f.id === id)?.effect.type === "nameplate",
  );
  // 침구류 보너스 — 보유 침대 중 최고만 적용
  const bedBonus = housing.furnitureOwned.reduce((max, id) => {
    const effect = FURNITURE_OPTIONS.find((f) => f.id === id)?.effect;
    return effect?.type === "rest_bonus" ? Math.max(max, effect.amount) : max;
  }, 0);

  const TABS = [
    { key: "rest" as const, label: "🛏️ 휴식" },
    { key: "buy" as const, label: "🏡 집 구매" },
    { key: "furniture" as const, label: "🪑 가구" },
  ];

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
        <div className="border-b border-line bg-subtle px-5 pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Housing
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>
              🏠 하우징
              {housing.homeName && (
                <span className="ml-2 align-middle text-sm font-bold text-faint">
                  🪧 {housing.homeName}
                </span>
              )}
            </span>
            <span className="text-sm font-bold text-emerald-500">
              {housing.gold.toLocaleString()}G
            </span>
          </h3>
          <div className="mt-3 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-t-xl px-4 py-2 text-sm font-extrabold transition ${
                  tab === t.key
                    ? "bg-surface text-content shadow-sm"
                    : "text-faint hover:text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <HousingStateLine state={buyState} />
          <HousingStateLine state={restState} />
          <HousingStateLine state={sellState} />
          <HousingStateLine state={furnState} />
          <HousingStateLine state={interactState} />
          <HousingStateLine state={renameState} />
          <HousingStateLine state={stockState} />
          <HousingStateLine state={withdrawProdState} />
          <HousingStateLine state={redeemState} />
          {(inviteState?.error || inviteState?.ok) && (
            <p
              className={`rounded-xl px-3 py-2 text-xs font-bold ${
                inviteState.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {inviteState.error ?? inviteState.ok}
            </p>
          )}

          {tab === "rest" && (
            <>
              {owned ? (
                <section className="rounded-2xl border border-line bg-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-content">
                        {housing.homeName ?? housing.name}
                      </p>
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
                        +{(housing.restAmount ?? 0) + bedBonus}
                        {bedBonus > 0 && (
                          <span className="ml-1 text-xs font-bold text-brand-500">
                            (침대 +{bedBonus})
                          </span>
                        )}
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
                  종탑 거리의 중개인을 통해 집을 구매할 수 있어요. 집을 사면 이동 가능
                  구역에 본인 집이 생깁니다.
                </p>
              )}

              {owned && hasNameplate && (
                <section className="rounded-2xl border border-line bg-subtle p-4">
                  <p className="text-sm font-extrabold text-content">🪧 문패</p>
                  <p className="mt-1 text-xs text-faint">
                    집 이름을 지으면 문패에 &lsquo;OO의 {housing.homeName ?? "…"}&rsquo;처럼
                    새겨져요. (16자 이내)
                  </p>
                  <form action={renameAction} className="mt-3 flex gap-2">
                    <input
                      type="text"
                      name="name"
                      maxLength={16}
                      defaultValue={housing.homeName ?? ""}
                      placeholder="예: 아늑한 다락방"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-faint2 focus:border-brand-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={renamePending}
                      className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
                    >
                      이름 짓기
                    </button>
                  </form>
                </section>
              )}

              {owned && (
                <section className="rounded-2xl border border-line bg-subtle p-4">
                  <p className="text-sm font-extrabold text-content">💌 집으로 초대</p>
                  <p className="mt-1 text-xs font-bold text-brand-500">
                    친구만 집에 초대할 수 있어요!
                  </p>
                  {housing.friends.length === 0 ? (
                    <p className="mt-2 rounded-xl bg-surface px-3 py-2.5 text-xs text-faint">
                      아직 친구가 없어요. 월드 화면의 👥 친구 패널에서 친구를 추가해보세요.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {housing.friends.map((friend) => (
                        <form
                          key={friend.id}
                          action={inviteAction}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="friendId" value={friend.id} />
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-content">
                            {friend.nickname}
                          </span>
                          <button
                            type="submit"
                            disabled={invitePending}
                            className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-black text-brand-600 transition hover:bg-brand-100 disabled:opacity-50"
                          >
                            초대하기
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {tab === "buy" && (
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">주택 목록</h4>
              {ownedOption && (
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-700">
                  소유 주택은 인당 1개입니다. 다른 집을 구매하면 기존 집을 자동 판매하고
                  판매가의 50%인 {ownedOption.sellPrice.toLocaleString()}G를 돌려받습니다.
                  가구는 집을 옮겨도 그대로 유지돼요.
                </p>
              )}
              <div className="grid gap-2">
                {housing.options.map((option) => (
                  <div
                    key={option.tier}
                    className="rounded-2xl border border-line bg-subtle p-3 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <form
                      action={option.owned ? enterHome : buyAction}
                      onSubmit={(e) => {
                        if (option.owned) return;
                        if (!ownedOption) return;
                        const ok = window.confirm(
                          `소유 주택은 인당 1개입니다. 기존 집(${ownedOption.name})을 판매해 ${ownedOption.sellPrice.toLocaleString()}G를 돌려받고 ${option.name}을 구매합니다. 진행하시겠습니까?`,
                        );
                        if (!ok) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="tier" value={option.tier} />
                      <button
                        type="submit"
                        disabled={buyPending}
                        className="flex w-full items-start gap-3 text-left disabled:opacity-50"
                      >
                        <span className="text-xl">🏡</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-extrabold text-content">
                            {option.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-faint">
                            {option.note}
                          </span>
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
                    {option.owned && (
                      <form
                        action={sellAction}
                        onSubmit={(e) => {
                          const ok = window.confirm(
                            `${option.name}을 판매하고 ${option.sellPrice.toLocaleString()}G를 돌려받습니다. 진행하시겠습니까?`,
                          );
                          if (!ok) e.preventDefault();
                        }}
                        className="mt-2"
                      >
                        <input type="hidden" name="tier" value={option.tier} />
                        <button
                          type="submit"
                          disabled={sellPending}
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          판매하고 {option.sellPrice.toLocaleString()}G 받기
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "furniture" && (
            <section className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">🪑 가구</h4>
              <p className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs font-bold leading-relaxed text-brand-600">
                가구는 캐릭터 소유라 집을 옮겨도 그대로 유지됩니다. 상호작용 가구는 하루
                1회, 본인 집에서만 사용할 수 있어요. (KST 자정 초기화)
              </p>
              {!owned && (
                <p className="rounded-2xl bg-subtle px-4 py-3 text-xs text-faint">
                  집을 먼저 구매하면 가구를 들일 수 있어요.
                </p>
              )}
              <div className="grid gap-2">
                {FURNITURE_OPTIONS.map((item) => {
                  const isOwned = ownedFurniture.has(item.id);
                  const usedToday = housing.furnitureUsedToday[item.id] ?? false;
                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-line bg-subtle p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl">{item.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-extrabold text-content">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">
                            {item.desc}
                          </span>
                        </span>
                        {isOwned ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-600">
                            보유중
                          </span>
                        ) : (
                          <form
                            action={furnAction}
                            className="shrink-0"
                            onSubmit={(e) => {
                              if (!owned) {
                                e.preventDefault();
                                window.alert("집을 먼저 구매해주세요.");
                              }
                            }}
                          >
                            <input type="hidden" name="itemId" value={item.id} />
                            <button
                              type="submit"
                              disabled={furnPending}
                              className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {item.price.toLocaleString()}G
                            </button>
                          </form>
                        )}
                      </div>
                      {isOwned && item.interactLabel && (
                        <form action={interactAction} className="mt-2">
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            disabled={interactPending || usedToday || !housing.atHome}
                            className="w-full rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
                          >
                            {!housing.atHome
                              ? `${item.interactLabel} — 본인 집에서만`
                              : usedToday
                                ? `오늘 ${item.interactLabel} 완료`
                                : item.interactLabel}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
              {owned && (
                <div className="mt-4 grid gap-3">
                  {(["낚시", "채집"] as const).map((kind) => {
                    const itemId = kind === "낚시" ? "aquarium" : "planter";
                    if (!ownedFurniture.has(itemId)) return null;
                    const data = housing.production[kind];
                    const title = kind === "낚시" ? "🐠 어항" : "🪴 약초 화분";
                    const pointName = kind === "낚시" ? "어항 점수" : "화분 점수";
                    return (
                      <section key={kind} className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-content">{title}</p>
                            <p className="mt-0.5 text-xs font-bold text-brand-600">
                              {pointName} {data.points.toLocaleString()}P · 매일 +{data.dailyPoints.toLocaleString()}P
                            </p>
                          </div>
                          <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-black text-brand-600">
                            {data.slots.length}/5
                          </span>
                        </div>

                        {data.slots.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            {data.slots.map((slot, index) => (
                              <form
                                key={`${kind}-${slot.name}-${index}`}
                                action={withdrawProdAction}
                                className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2"
                              >
                                <input type="hidden" name="kind" value={kind} />
                                <input type="hidden" name="index" value={index} />
                                <span className="min-w-0 flex-1 truncate text-xs font-bold text-content">
                                  R{slot.rank} · {slot.name}
                                </span>
                                <button
                                  type="submit"
                                  disabled={withdrawProdPending || !housing.atHome}
                                  className="rounded-lg border border-line px-2 py-1 text-[11px] font-black text-muted transition hover:bg-subtle disabled:opacity-50"
                                >
                                  빼기
                                </button>
                              </form>
                            ))}
                          </div>
                        )}

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <form action={stockAction} className="rounded-xl bg-surface p-2">
                            <input type="hidden" name="kind" value={kind} />
                            <p className="mb-1 text-[11px] font-black text-faint">가방에서 넣기</p>
                            <div className="flex gap-1.5">
                              <select
                                name="itemName"
                                disabled={stockPending || !housing.atHome || data.bagItems.length === 0}
                                className="min-w-0 flex-1 rounded-lg border border-line bg-subtle px-2 py-1.5 text-xs font-bold text-content"
                              >
                                {data.bagItems.length === 0 ? (
                                  <option value="">가방 비어 있음</option>
                                ) : (
                                  data.bagItems.map((item) => (
                                    <option key={item.name} value={item.name}>
                                      R{item.rank} · {item.name} x{item.qty}
                                    </option>
                                  ))
                                )}
                              </select>
                              <button
                                type="submit"
                                disabled={stockPending || !housing.atHome || data.bagItems.length === 0}
                                className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
                              >
                                넣기
                              </button>
                            </div>
                          </form>

                          <form action={redeemAction} className="rounded-xl bg-surface p-2">
                            <input type="hidden" name="kind" value={kind} />
                            <p className="mb-1 text-[11px] font-black text-faint">도감에서 꺼내기</p>
                            <div className="flex gap-1.5">
                              <select
                                name="itemName"
                                disabled={redeemPending || !housing.atHome || data.redeemItems.length === 0}
                                className="min-w-0 flex-1 rounded-lg border border-line bg-subtle px-2 py-1.5 text-xs font-bold text-content"
                              >
                                {data.redeemItems.length === 0 ? (
                                  <option value="">등록된 항목 없음</option>
                                ) : (
                                  data.redeemItems.map((item) => (
                                    <option key={item.name} value={item.name}>
                                      R{item.rank} · {item.name} · {item.cost.toLocaleString()}P
                                    </option>
                                  ))
                                )}
                              </select>
                              <button
                                type="submit"
                                disabled={redeemPending || !housing.atHome || data.redeemItems.length === 0}
                                className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[11px] font-black text-white disabled:opacity-50"
                              >
                                꺼내기
                              </button>
                            </div>
                          </form>
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
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

const FOOD_PRODUCTS = [
  { id: "egg", name: "달걀", buyPrice: 10, sellPrice: 5 },
  { id: "milk", name: "우유", buyPrice: 10, sellPrice: 5 },
  { id: "meat", name: "고기", buyPrice: 10, sellPrice: 5 },
  { id: "vegetable", name: "채소", buyPrice: 10, sellPrice: 5 },
  { id: "fruit", name: "과일", buyPrice: 10, sellPrice: 5 },
  { id: "water", name: "물", buyPrice: 5, sellPrice: 2 },
  { id: "wheat", name: "밀", buyPrice: 20, sellPrice: 10 },
  { id: "salt", name: "소금", buyPrice: 30, sellPrice: 15 },
  { id: "spice", name: "향신료", buyPrice: 50, sellPrice: 25 },
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

function CookingKitchen({
  cooking,
  inventoryItems,
  lifeStorageItems,
  onClose,
}: {
  cooking: CookingView;
  inventoryItems: SheetInventoryItem[];
  lifeStorageItems: LifeStorageItemView[];
  onClose: () => void;
}) {
  const [cookState, cookAction, cookPending] = useActionState<CookingState, FormData>(
    cookDish,
    undefined,
  );
  const [sellState, sellAction, sellPending] = useActionState<CookingState, FormData>(
    sellCookedFood,
    undefined,
  );
  const ingredientOptions = useMemo(
    () => mergeItems([...inventoryItems, ...lifeStorageItems]).filter((item) => item.qty > 0),
    [inventoryItems, lifeStorageItems],
  );
  const slots = Array.from({ length: cooking.maxIngredients }, (_, index) => index);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>(
    Array.from({ length: cooking.maxIngredients }, () => ""),
  );
  const selectedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of selectedIngredients) {
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [selectedIngredients]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="요리"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Cooking
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🍳 {cooking.facilityName}</span>
            <span className="text-xs font-bold text-amber-500">
              피로도 {cooking.ap} · 조리 -10
            </span>
          </h3>
          <p className="mt-2 text-xs font-semibold text-muted">
            재료를 최대 {cooking.maxIngredients}개까지 넣어 조리합니다. 조합이 맞으면 레시피가
            해금돼요.
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <CookingStateLine state={cookState} />
          <CookingStateLine state={sellState} />

          <section className="rounded-2xl border border-line bg-subtle p-4">
            <h4 className="mb-3 text-sm font-extrabold text-content">재료 넣기</h4>
            <form action={cookAction} className="space-y-3">
              <input type="hidden" name="facility" value={cooking.facility} />
              <div className="grid gap-2 sm:grid-cols-2">
                  {slots.map((slot) => (
                    <select
                      key={slot}
                      name="ingredient"
                      className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content outline-none focus:border-brand-300"
                      value={selectedIngredients[slot] ?? ""}
                      onChange={(e) => {
                        const next = [...selectedIngredients];
                        next[slot] = e.target.value;
                        setSelectedIngredients(next);
                      }}
                    >
                      <option value="">재료 선택 안 함</option>
                      {ingredientOptions.map((item) => {
                        const current = selectedIngredients[slot] === item.name ? 1 : 0;
                        const usedElsewhere = (selectedCounts.get(item.name) ?? 0) - current;
                        const disabled = usedElsewhere >= item.qty;
                        return (
                          <option key={`${slot}-${item.name}`} value={item.name} disabled={disabled}>
                            {item.name} x{item.qty - usedElsewhere}
                          </option>
                        );
                      })}
                    </select>
                  ))}
                </div>
              <button
                type="submit"
                disabled={cookPending || ingredientOptions.length === 0 || cooking.ap < 10}
                className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {cookPending ? "조리 중..." : "조리하기 (-피로도 10)"}
              </button>
            </form>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">
                발견한 레시피 {cooking.knownRecipes.length}개
              </h4>
              {cooking.knownRecipes.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
                  아직 발견한 레시피가 없어요.
                </p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {cooking.knownRecipes.map((recipe) => (
                    <li key={recipe.id} className="rounded-2xl border border-line bg-subtle p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-content">{recipe.name}</p>
                          <p className="mt-0.5 text-[11px] font-bold text-brand-600">
                            {recipe.rank} · {recipe.category} · 판매가 {recipe.sellPrice}G
                          </p>
                        </div>
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                          {recipe.resultName}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted">재료: {recipe.ingredients}</p>
                      {recipe.effect && (
                        <p className="mt-1 line-clamp-2 text-xs text-faint">{recipe.effect}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-content">요리 판매</h4>
              {cooking.cookedFoods.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
                  판매할 요리가 없어요.
                </p>
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {cooking.cookedFoods.map((food) => (
                    <li key={food.name} className="rounded-2xl border border-line bg-subtle p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold text-content">{food.name}</p>
                          <p className="mt-0.5 text-[11px] font-bold text-emerald-600">
                            판매가 {food.unitPrice}G · 보유 x{food.qty}
                          </p>
                          {food.effect && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-faint">{food.effect}</p>
                          )}
                        </div>
                      </div>
                      <form action={sellAction} className="grid grid-cols-[1fr_5rem] gap-2">
                        <input type="hidden" name="itemName" value={food.name} />
                        <input
                          name="qty"
                          type="number"
                          min="1"
                          max={food.qty}
                          defaultValue="1"
                          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-content outline-none focus:border-brand-300"
                        />
                        <button
                          type="submit"
                          disabled={sellPending}
                          className="rounded-xl bg-surface px-3 py-2 text-sm font-extrabold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
                        >
                          판매
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
  canGacha,
  cooking,
  inventoryItems,
  lifeStorageItems,
  lifeShop,
  inn,
  housing,
  storage,
  guild,
  craftMinerals,
  isBlacksmith,
  craftSmithLevel,
  craftAp,
  craftTags,
  craftTagSlots,
}: Props) {
  const [open, setOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [lifeShopOpen, setLifeShopOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [foodMarketOpen, setFoodMarketOpen] = useState(false);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [gachaOpen, setGachaOpen] = useState(false);
  const [innOpen, setInnOpen] = useState(false);
  const [housingOpen, setHousingOpen] = useState(false);
  const [forgeMode, setForgeMode] = useState<"weapon" | "magic" | "reforge" | null>(null);
  const [upgradeState, upgradeAction, upgradePending] = useActionState<ServiceState, FormData>(
    upgradeWeapon,
    undefined,
  );
  const [enchantState, enchantAction, enchantPending] = useActionState<ServiceState, FormData>(
    enchantWeapon,
    undefined,
  );
  const [reforgeState, reforgeAction, reforgePending] = useActionState<ServiceState, FormData>(
    reforgeItem,
    undefined,
  );

  const items = useMemo(() => mergeItems(inventoryItems), [inventoryItems]);
  const weapons = items.filter(isWeapon);
  // 인첸트 대상: 강화(+N)·인첸트가 안 된 깨끗한 무기만
  const enchantableWeapons = weapons.filter((w) => !isEnchanted(w) && !isEnhanced(w));
  // 수식어 리롤 대상: 무기 또는 방어구 (강철 파편·보석 제외)
  const forgeables = items.filter(
    (it) =>
      !isGem(it) &&
      !it.name.includes("파편") &&
      detectForgeSlot(`${it.name} ${it.effect ?? ""}`) !== null,
  );
  const gems = items.filter(isGem);
  const steelCount = countOf(items, "강철 파편");
  const moonCount = countOf(items, "달의 파편");

  if (!canForge && !canGuild && !canMarket && !canStorage && !canInn && !canHousing && !cooking.enabled && !canGacha) return null;

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
                <span className="text-[11px] text-faint">장비 제작 · 무기 강화 · 마법 제련 · 수식어</span>
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
                onClick={() => setLifeShopOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="text-xl">🎒</span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-content">생활 장비 구매</span>
                  <span className="text-[11px] text-faint">가방 확장 · 낚싯대 · 채집 도구 · 곡괭이</span>
                </span>
              </button>
            </>
          )}
          {cooking.enabled && (
            <button
              type="button"
              onClick={() => setCookingOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🍳</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">요리</span>
                <span className="text-[11px] text-faint">
                  {cooking.facilityName} · 재료 최대 {cooking.maxIngredients}개 · 피로도 10
                </span>
              </span>
            </button>
          )}
          {canGacha && (
            <button
              type="button"
              onClick={() => setGachaOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🎁</span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">레시피 가챠</span>
                <span className="text-[11px] text-faint">대상 야영지 전용 · 랜덤 레시피 · 1회 50골드</span>
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

      {questOpen && <QuestBoard guild={guild} onClose={() => setQuestOpen(false)} />}

      {craftOpen && (
        <CraftingForge
          minerals={craftMinerals}
          gold={lifeShop.gold}
          isBlacksmith={isBlacksmith}
          smithLevel={craftSmithLevel}
          ap={craftAp}
          tags={craftTags}
          tagSlots={craftTagSlots}
          onClose={() => setCraftOpen(false)}
        />
      )}

      {foodMarketOpen && <FoodMarket onClose={() => setFoodMarketOpen(false)} />}

      {cookingOpen && (
        <CookingKitchen
          cooking={cooking}
          inventoryItems={inventoryItems}
          lifeStorageItems={lifeStorageItems}
          onClose={() => setCookingOpen(false)}
        />
      )}

      {gachaOpen && <RecipeGacha gold={lifeShop.gold} onClose={() => setGachaOpen(false)} />}

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
                    onClick={() => setForgeMode("weapon")}
                  />
                  <ForgeChoice
                    tone="arcane"
                    icon="💎"
                    title="마법 제련"
                    onClick={() => setForgeMode("magic")}
                  />
                  <ForgeChoice
                    tone="fire"
                    icon="🔨"
                    title="수식어 부여"
                    onClick={() => setForgeMode("reforge")}
                  />
                  <ForgeChoice
                    tone="arcane"
                    icon="⚒️"
                    title="장비 제작"
                    onClick={() => setCraftOpen(true)}
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
                  ) : forgeMode === "magic" ? (
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
                  ) : (
                    <form action={reforgeAction} className="space-y-3">
                      <h4 className="text-lg font-black text-amber-100">수식어 부여</h4>
                      <StateLine state={reforgeState} />
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-stone-400">무기 · 방어구</span>
                        <select
                          name="itemName"
                          className="w-full rounded-xl border border-stone-700 bg-stone-900 px-3 py-2.5 text-sm font-semibold text-stone-100 outline-none focus:border-amber-400"
                        >
                          {forgeables.map((item) => (
                            <option key={item.name} value={item.name}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {forgeables.length === 0 && (
                        <p className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-3 text-sm text-stone-400">
                          인벤토리에서 무기·방어구를 찾지 못했어요. 시트 휴대품에 넣고 동기화해주세요.
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={reforgePending || forgeables.length === 0 || steelCount < 1}
                        className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white shadow-lg transition hover:bg-amber-500 disabled:opacity-50"
                      >
                        {reforgePending ? "제작 중..." : "수식어 리롤 (강철 파편 1)"}
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
