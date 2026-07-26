"use client";

import { useEffect, useMemo, useState, useActionState, useTransition } from "react";
import {
  buyAlchemyBook,
  buyFurniture,
  buyHouse,
  buyFood,
  claimAllWeeklyIncome,
  claimWeeklyIncome,
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
import {
  buyBlackMarketPotion,
  buyBlackMarketItem,
  deliverBlackMarketQuest,
  exchangeBlackMarketCoin,
  resetBlackMarketStockForGm,
  type BlackMarketState,
} from "@/app/actions/blackMarket";
import {
  buyWanderingMerchantItem,
  dismissWanderingMerchantForGm,
  summonWanderingMerchantForGm,
  type WanderingMerchantState,
} from "@/app/actions/wanderingMerchant";
import { inviteToHouse, type FriendState } from "@/app/actions/friends";
import { enterHome } from "@/app/actions/world";
import { FURNITURE_OPTIONS } from "@/lib/housing";
import type { WeeklyIncomeView } from "@/lib/weeklyIncome";
import { adventurerRankGoal, nextAdventurerRank, normalizeAdventurerRank } from "@/lib/adventurerRank";
import GuildQuestBoard, { type GuildQuestBoardView } from "@/components/GuildQuestBoard";
import TrainingYard, { type TrainingView } from "@/components/TrainingYard";
import CraftingForge, { type CraftMineralView } from "@/components/CraftingForge";
import AlchemyLab, { type AlchemyView } from "@/components/AlchemyLab";
import IngredientPicker, { type PickerSource } from "@/components/IngredientPicker";
import RecipeGacha from "@/components/RecipeGacha";
import { detectForgeSlot } from "@/lib/forge";
import type { SheetInventoryItem } from "@/lib/googleSheets";

type Props = {
  canForge: boolean;
  canGuild: boolean;
  canGuildBackyard: boolean;
  canMarket: boolean;
  canStorage: boolean;
  canInn: boolean;
  canHousing: boolean;
  canGacha: boolean;
  canBlackMarket: boolean;
  canAlchemyBookShop: boolean;
  cooking: CookingView;
  alchemy: AlchemyView;
  blackMarket: BlackMarketView;
  wanderingMerchant: WanderingMerchantView;
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
  weeklyIncome: WeeklyIncomeView | null; // 분수 광장에서만 채워짐
};

export type InnView = {
  gold: number;
  ap: number;
  maxAp: number;
  restedToday: boolean;
};

const INN_REST_COST = 100;
const INN_REST_AMOUNT = 60;

function rankOrder(rank: string): number {
  const value = Number(rank.replace(/[^\d]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 99;
}

function sortedRanks(ranks: string[]): string[] {
  return [...new Set(ranks.filter(Boolean))].sort(
    (a, b) => rankOrder(a) - rankOrder(b) || a.localeCompare(b, "ko"),
  );
}

const STORAGE_SOURCE_FILTERS = [
  { key: "all", label: "전체", icon: "✨" },
  { key: "basic", label: "휴대품", icon: "🎒" },
  { key: "낚시", label: "낚시", icon: "🎣" },
  { key: "채집", label: "채집", icon: "🌿" },
  { key: "채광", label: "채광", icon: "⛏️" },
] as const;

type StorageSourceFilter = (typeof STORAGE_SOURCE_FILTERS)[number]["key"];

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
  capacity: number; // 보유 가구 티어별 보관 한도 (미보유 0)
  facilityName: string; // 보유 가구 이름 (어항/큰 어항/산호 수족관 …)
  facilityEmoji: string;
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
  ingredientList: { name: string; qty: number }[]; // 원클릭 담기용
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
  training: TrainingView;
};

export type StorageItemView = SheetInventoryItem & {
  id: string;
  sourceKind: "basic" | "낚시" | "채집" | "채광";
};

export type LifeStorageItemView = SheetInventoryItem & {
  sourceKind: "낚시" | "채집" | "채광";
  rank?: number;
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

export type BlackMarketView = {
  gold: number;
  coins: number;
  isGm: boolean;
  quest: {
    id: string;
    itemName: string;
    value: number;
    qty: number;
    rewardCoins: number;
    have: number;
    delivered: boolean;
  } | null;
  stock: {
    id: string;
    slot: string;
    kind: "낚시" | "채집" | "채광" | "스킬북";
    itemName: string;
    rank: number;
    price: number;
    stock: number;
    initialStock: number;
    meta: string | null;
    skillName: string | null;
  }[];
  potions: {
    id: string;
    itemName: string;
    desc: string | null;
    weight: number | null;
    coinPrice: number;
  }[];
  exchanges: {
    id: string;
    goldCost: number;
    coinReward: number;
    dailyLimit: number | null;
    used: number;
    remaining: number | null;
  }[];
  books: {
    id: string;
    name: string;
    price: number;
    optionLabel: string;
    optionNames: string[];
    total: number;
    unlocked: number;
  }[];
};

export type WanderingMerchantView = {
  enabled: boolean;
  isGm: boolean;
  gold: number;
  todaySummonCount: number;
  active: {
    id: string;
    startsAt: string;
    endsAt: string;
    stock: {
      id: string;
      slot: string;
      kind: "낚시" | "채집" | "채광" | "포션" | "소모품";
      itemName: string;
      rank: number;
      price: number;
      stock: number;
      initialStock: number;
      meta: string | null;
    }[];
  } | null;
};

export type WanderingMerchantStockView = NonNullable<
  WanderingMerchantView["active"]
>["stock"][number];

const GEM_NAMES =["루비", "에메랄드", "사파이어", "토파즈", "다이아몬드"];
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

type ProductionKind = "낚시" | "채집";

function productionMeta(kind: ProductionKind) {
  return kind === "낚시"
    ? {
        itemId: "aquarium",
        icon: "🐠",
        title: "어항",
        pointName: "어항 점수",
        verb: "물고기",
        empty: "물고기를 넣어두면 매일 점수가 쌓입니다.",
        accent: "from-sky-400 to-cyan-500",
      }
    : {
        itemId: "planter",
        icon: "🪴",
        title: "약초 화분",
        pointName: "화분 점수",
        verb: "채집물",
        empty: "채집물을 심어두면 매일 점수가 쌓입니다.",
        accent: "from-emerald-400 to-lime-500",
      };
}

function HousingProductionFacility({
  kind,
  housing,
  onClose,
}: {
  kind: ProductionKind;
  housing: HousingView;
  onClose: () => void;
}) {
  const meta = productionMeta(kind);
  const data = housing.production[kind];
  const [stockState, stockAction, stockPending] = useActionState<HousingState, FormData>(
    stockHousingProduction,
    undefined,
  );
  const [withdrawState, withdrawAction, withdrawPending] = useActionState<HousingState, FormData>(
    withdrawHousingProduction,
    undefined,
  );
  const [redeemState, redeemAction, redeemPending] = useActionState<HousingState, FormData>(
    redeemHousingProduction,
    undefined,
  );
  const capacity = Math.max(data.capacity, data.slots.length);
  const slotPlaceholders = Array.from({ length: capacity }, (_, i) => data.slots[i] ?? null);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Home Facility
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-2xl font-extrabold text-content">
                {data.facilityEmoji} {data.facilityName}
              </h3>
              <p className="mt-1 text-xs font-bold text-faint">
                {housing.atHome ? "본인 집 시설 사용 가능" : "본인 집에서만 상호작용 가능"}
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1.5 text-sm font-black text-brand-600">
              {data.slots.length}/{capacity}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <HousingStateLine state={stockState} />
          <HousingStateLine state={withdrawState} />
          <HousingStateLine state={redeemState} />

          <section className={`rounded-3xl bg-gradient-to-br ${meta.accent} p-4 text-white shadow-sm`}>
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/75">
                  Balance
                </p>
                <p className="mt-1 text-3xl font-black">{data.points.toLocaleString()}P</p>
                <p className="mt-1 text-sm font-bold text-white/85">{meta.pointName}</p>
              </div>
              <div className="rounded-2xl bg-white/18 px-3 py-3 backdrop-blur">
                <p className="text-xs font-bold text-white/75">매일 적립</p>
                <p className="mt-1 text-xl font-black">+{data.dailyPoints.toLocaleString()}P</p>
              </div>
              <div className="rounded-2xl bg-white/18 px-3 py-3 backdrop-blur">
                <p className="text-xs font-bold text-white/75">초기화</p>
                <p className="mt-1 text-xl font-black">자정</p>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-content">보관 슬롯</h4>
              <span className="text-xs font-bold text-faint">
                등급별 점수가 매일 누적됩니다
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {slotPlaceholders.map((slot, index) =>
                slot ? (
                  <form
                    key={`${slot.name}-${index}`}
                    action={withdrawAction}
                    className="min-h-28 rounded-2xl border border-line bg-subtle p-3"
                  >
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="index" value={index} />
                    <p className="text-[11px] font-black text-brand-600">R{slot.rank}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-extrabold text-content">
                      {slot.name}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-faint">중량 {slot.weight}</p>
                    <button
                      type="submit"
                      disabled={withdrawPending || !housing.atHome}
                      className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-black text-muted transition hover:bg-subtle-hover disabled:opacity-50"
                    >
                      빼기
                    </button>
                  </form>
                ) : (
                  <div
                    key={`empty-${index}`}
                    className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-line bg-subtle/55 p-3 text-center"
                  >
                    <span className="text-xs font-bold text-faint">빈 슬롯</span>
                  </div>
                ),
              )}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <form action={stockAction} className="rounded-2xl border border-line bg-subtle p-4">
              <input type="hidden" name="kind" value={kind} />
              <p className="text-sm font-extrabold text-content">가방에서 넣기</p>
              <p className="mt-1 text-xs text-faint">
                {meta.verb} 최대 {capacity}개까지 보관합니다.
              </p>
              <div className="mt-3 flex gap-2">
                <select
                  name="itemName"
                  disabled={stockPending || !housing.atHome || data.bagItems.length === 0}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-content"
                >
                  {data.bagItems.length === 0 ? (
                    <option value="">가방에 넣을 항목 없음</option>
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
                  className="shrink-0 rounded-xl bg-brand-500 px-4 py-2 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
                >
                  넣기
                </button>
              </div>
            </form>

            <form action={redeemAction} className="rounded-2xl border border-line bg-subtle p-4">
              <input type="hidden" name="kind" value={kind} />
              <p className="text-sm font-extrabold text-content">도감에서 꺼내기</p>
              <p className="mt-1 text-xs text-faint">도감 등록 기록이 있는 항목만 선택됩니다.</p>
              <div className="mt-3 flex gap-2">
                <select
                  name="itemName"
                  disabled={redeemPending || !housing.atHome || data.redeemItems.length === 0}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-bold text-content"
                >
                  {data.redeemItems.length === 0 ? (
                    <option value="">꺼낼 수 있는 항목 없음</option>
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
                  className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                >
                  꺼내기
                </button>
              </div>
            </form>
          </div>

          {data.slots.length === 0 && (
            <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-faint">
              {meta.empty}
            </p>
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

function DailyFurnitureFacility({
  itemId,
  housing,
  onClose,
}: {
  itemId: string;
  housing: HousingView;
  onClose: () => void;
}) {
  const item = FURNITURE_OPTIONS.find((option) => option.id === itemId);
  const [state, action, pending] = useActionState<HousingState, FormData>(useFurniture, undefined);
  if (!item) return null;
  const usedToday = housing.furnitureUsedToday[item.id] ?? false;
  const effectText =
    item.effect.type === "daily_ap"
      ? `피로도 +${item.effect.amount}`
      : item.effect.type === "daily_gold"
        ? `${item.effect.min}-${item.effect.max}G`
        : item.desc;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Home Facility
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">
            {item.emoji} {item.name}
          </h3>
        </div>
        <div className="space-y-4 px-5 py-4">
          <HousingStateLine state={state} />
          <div className="rounded-3xl border border-line bg-subtle p-4">
            <p className="text-sm font-bold leading-relaxed text-muted">{item.desc}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-surface px-3 py-3">
                <p className="text-xs font-bold text-faint">효과</p>
                <p className="mt-1 text-lg font-black text-content">{effectText}</p>
              </div>
              <div className="rounded-2xl bg-surface px-3 py-3">
                <p className="text-xs font-bold text-faint">상태</p>
                <p className="mt-1 text-lg font-black text-content">
                  {usedToday ? "완료" : "가능"}
                </p>
              </div>
            </div>
          </div>
          <form action={action}>
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              disabled={pending || usedToday || !housing.atHome}
              className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {!housing.atHome
                ? "본인 집에서만 사용 가능"
                : usedToday
                  ? "오늘 사용 완료"
                  : item.interactLabel}
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
  const [depositSource, setDepositSource] = useState<StorageSourceFilter>("all");
  const [storageSource, setStorageSource] = useState<StorageSourceFilter>("all");
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
  const filteredDepositRows = depositRows.filter(
    (item) => depositSource === "all" || item.sourceKind === depositSource,
  );
  const filteredStorageItems = storageItems.filter(
    (item) => storageSource === "all" || item.sourceKind === storageSource,
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
          <div className="mb-3 flex gap-1 overflow-x-auto rounded-2xl bg-subtle p-1">
            {STORAGE_SOURCE_FILTERS.map((filter) => {
              const activeSource = view === "deposit" ? depositSource : storageSource;
              const rows = view === "deposit" ? depositRows : storageItems;
              const count =
                filter.key === "all"
                  ? rows.length
                  : rows.filter((item) => item.sourceKind === filter.key).length;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() =>
                    view === "deposit" ? setDepositSource(filter.key) : setStorageSource(filter.key)
                  }
                  className={`shrink-0 rounded-xl px-2.5 py-1.5 text-xs font-black transition ${
                    activeSource === filter.key
                      ? "bg-surface text-brand-600 shadow-sm"
                      : "text-muted hover:text-content"
                  }`}
                >
                  {filter.icon} {filter.label} {count}
                </button>
              );
            })}
          </div>

          {view === "deposit" ? (
            <>
              <StorageStateLine state={depositState} />
              {depositRows.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  맡길 물건이 없어요.
                </p>
              ) : filteredDepositRows.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  이 분류에 맡길 물건이 없어요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredDepositRows.map((item) => (
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
              ) : filteredStorageItems.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  이 분류에 맡긴 물건이 없어요.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {filteredStorageItems.map((item) => (
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

// ── 분수 광장 주간 수입 — 프리 플레이 스킬·우상 환전소 ──
function WeeklyIncomePanel({
  income,
  onClose,
}: {
  income: WeeklyIncomeView;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<ServiceState, FormData>(
    claimWeeklyIncome,
    undefined,
  );
  const [allState, allAction, allPending] = useActionState<ServiceState, FormData>(
    claimAllWeeklyIncome,
    undefined,
  );
  const [lastActionKind, setLastActionKind] = useState<"single" | "all">("single");
  const feedback = lastActionKind === "all" ? allState ?? state : state ?? allState;
  const anyPending = pending || allPending;
  const remaining = income.entries.filter((entry) => !entry.claimed);
  const remainingTotal = remaining.reduce((sum, entry) => sum + entry.amount, 0);
  const [, month, day] = income.week.split("-");
  const weekLabel = `${Number(month)}/${Number(day)} 주간`;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="주간 수입"
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Fountain Plaza
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">💰 주간 수입</h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {(feedback?.error || feedback?.ok) && (
            <p
              className={`rounded-xl px-3 py-2 text-xs font-bold ${
                feedback.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
              }`}
            >
              {feedback.error ?? feedback.ok}
            </p>
          )}

          <section className="rounded-3xl bg-gradient-to-br from-amber-400 to-yellow-500 p-4 text-white shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/75">
                  {weekLabel}
                </p>
                <p className="mt-1 text-3xl font-black">
                  {remainingTotal.toLocaleString()}
                  <span className="ml-1 text-lg">G</span>
                </p>
                <p className="mt-1 text-sm font-bold text-white/85">
                  이번 주 받을 수 있는 금액
                </p>
              </div>
              <div className="rounded-2xl bg-white/18 px-3 py-3 backdrop-blur">
                <p className="text-xs font-bold text-white/75">초기화</p>
                <p className="mt-1 text-lg font-black">월요일 자정</p>
                <form action={allAction} className="mt-3">
                  <button
                    type="submit"
                    disabled={anyPending || remainingTotal <= 0}
                    onClick={() => setLastActionKind("all")}
                    className="w-full rounded-xl bg-white px-3 py-2 text-xs font-black text-amber-600 shadow-sm transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    한번에 받기
                  </button>
                </form>
              </div>
            </div>
          </section>

          {income.entries.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-subtle/60 px-4 py-10 text-center">
              <p className="text-sm font-bold leading-relaxed text-faint">
                받을 수 있는 주간 수입이 없어요.
                <br />
                프리 플레이 스킬(SL 1 이상)을 배웠거나 우상을 갖고 있다면,
                <br />
                프로필에서 시트를 다시 동기화해보세요.
              </p>
            </div>
          ) : (
            <section className="space-y-2">
              {income.entries.map((entry) => (
                <div
                  key={entry.key}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    entry.claimed
                      ? "border-line bg-subtle/60 opacity-75"
                      : "border-amber-200/80 bg-subtle"
                  }`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-200/70 bg-amber-50 text-xl">
                    {entry.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-extrabold text-content">
                      {entry.name}
                      <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-black text-faint">
                        {entry.kind === "skill" ? "스킬" : "아이템"}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] font-bold text-faint">
                      {entry.formula}
                    </p>
                  </div>
                  {entry.claimed ? (
                    <span className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-xs font-black text-faint">
                      ✅ 수령 완료
                    </span>
                  ) : (
                    <form action={action} className="shrink-0">
                      <input type="hidden" name="key" value={entry.key} />
                      <button
                        type="submit"
                        disabled={anyPending || entry.amount <= 0}
                        onClick={() => setLastActionKind("single")}
                        className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-50"
                      >
                        {entry.amount.toLocaleString()}G 받기
                      </button>
                    </form>
                  )}
                </div>
              ))}
              <p className="px-1 text-[11px] font-bold text-faint">
                스킬·아이템을 새로 배우거나 얻었다면, 프로필에서 시트를 다시 동기화해야 목록에
                반영돼요.
              </p>
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

// ── 가구 탭 — 내 가구 쇼룸 + 계열별 상점 ──
type FurnitureItem = (typeof FURNITURE_OPTIONS)[number];

// 가구별 타일 색 — 쇼룸·상점 공통
function furnitureTile(item: FurnitureItem): string {
  switch (item.family) {
    case "bed":
      return "border-amber-200/70 bg-amber-50";
    case "aquarium":
      return "border-sky-200/70 bg-sky-50";
    case "planter":
      return "border-emerald-200/70 bg-emerald-50";
    case "bank":
      return "border-yellow-200/70 bg-yellow-50";
  }
  if (item.effect.type === "daily_ap") return "border-orange-200/70 bg-orange-50";
  return "border-rose-200/70 bg-rose-50"; // 문패·방명록대
}

// 상점 섹션 — 계열(3단계)은 family, 단품은 ids 로 묶는다
const FURNITURE_SECTIONS: readonly {
  key: string;
  icon: string;
  title: string;
  note: string;
  family?: FurnitureItem["family"];
  ids?: readonly string[];
}[] = [
  { key: "bed", icon: "🛏️", title: "침구류", note: "집 휴식 회복량 상승", family: "bed" },
  { key: "aquarium", icon: "🐠", title: "어항 (낚시)", note: "물고기 보관 → 매일 어항 점수", family: "aquarium" },
  { key: "planter", icon: "🪴", title: "화분 (채집)", note: "채집물 보관 → 매일 화분 점수", family: "planter" },
  { key: "alchemy", icon: "⚗️", title: "연금술 공방", note: "집에서 포션 제조 해금", family: "alchemy" },
  { key: "bank", icon: "🐖", title: "저금통", note: "하루 1회 흔들어 골드 획득", family: "bank" },
  { key: "func", icon: "🔥", title: "기타 기능", note: "하루 1회 상호작용", ids: ["fireplace"] },
  { key: "deco", icon: "🎀", title: "꾸미기 · 손님맞이", note: "집 이름 · 방명록", ids: ["nameplate", "guestbook_stand"] },
] as const;

function sectionItems(section: (typeof FURNITURE_SECTIONS)[number]): FurnitureItem[] {
  if (section.family) {
    return FURNITURE_OPTIONS.filter((item) => item.family === section.family).sort(
      (a, b) => (a.tier ?? 0) - (b.tier ?? 0),
    );
  }
  return (section.ids ?? [])
    .map((id) => FURNITURE_OPTIONS.find((item) => item.id === id))
    .filter((item): item is FurnitureItem => !!item);
}

function FurnitureTab({
  housing,
  owned,
  bedBonus,
  furnAction,
  furnPending,
}: {
  housing: HousingView;
  owned: boolean;
  bedBonus: number;
  furnAction: (formData: FormData) => void;
  furnPending: boolean;
}) {
  const ownedSet = new Set(housing.furnitureOwned);
  const ownedItems = FURNITURE_OPTIONS.filter((item) => ownedSet.has(item.id));
  const [detail, setDetail] = useState<FurnitureItem | null>(null);

  // 구매/교체 상태 계산 — 카드·상세 모달 공용
  function purchaseInfo(item: FurnitureItem) {
    const isOwned = ownedSet.has(item.id);
    const fam = item.family ? (ownedItems.find((o) => o.family === item.family) ?? null) : null;
    const surpassed = !isOwned && !!fam && (fam.tier ?? 0) > (item.tier ?? 0);
    const upgradeFrom = !isOwned && !surpassed && fam && fam.id !== item.id ? fam : null;
    const refund = upgradeFrom ? Math.floor(upgradeFrom.price / 2) : 0;
    return { isOwned, surpassed, upgradeFrom, refund };
  }

  // 효과 한 줄 요약 (상세 모달용)
  function effectSummary(item: FurnitureItem): string {
    const e = item.effect;
    switch (e.type) {
      case "rest_bonus":
        return `집 휴식 회복 +${e.amount}`;
      case "daily_ap":
        return `하루 1회 · 피로도 +${e.amount}`;
      case "daily_gold":
        return `하루 1회 · ${e.min}~${e.max}G`;
      case "production":
        return `${e.kind} ${e.slots}칸 보관 · 매일 점수 적립`;
      case "nameplate":
        return "집 이름 짓기 해금";
      case "guestbook":
        return "방문객 방명록 해금";
      case "alchemy":
        return "연금술 제조 해금";
    }
  }

  // 구매/교체 버튼 또는 상태 배지 — 카드·상세 모달 공용
  function purchaseAction(item: FurnitureItem) {
    const { isOwned, surpassed, upgradeFrom, refund } = purchaseInfo(item);
    if (isOwned) {
      return (
        <span className="block w-full rounded-xl bg-brand-500 px-3 py-1.5 text-center text-xs font-black text-white">
          ✅ 사용중
        </span>
      );
    }
    if (surpassed) {
      return (
        <span className="block w-full rounded-xl bg-subtle-hover px-3 py-1.5 text-center text-xs font-black text-faint">
          하위 등급
        </span>
      );
    }
    return (
      <form
        action={furnAction}
        onSubmit={(e) => {
          if (!owned) {
            e.preventDefault();
            window.alert("집을 먼저 구매해주세요.");
            return;
          }
          if (upgradeFrom) {
            const ok = window.confirm(
              `기존 ${upgradeFrom.name}을(를) ${refund.toLocaleString()}G에 판매하고 ${item.name}(으)로 교체합니다. 넣어둔 내용물과 점수는 그대로 유지돼요. 진행할까요?`,
            );
            if (!ok) e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="itemId" value={item.id} />
        <button
          type="submit"
          disabled={furnPending}
          className={`w-full rounded-xl px-3 py-1.5 text-xs font-black text-white transition disabled:opacity-50 ${
            upgradeFrom ? "bg-brand-500/90 hover:bg-brand-500" : "bg-emerald-500/90 hover:bg-emerald-500"
          }`}
        >
          {upgradeFrom
            ? `${item.price.toLocaleString()}G 교체`
            : `${item.price.toLocaleString()}G 구매`}
        </button>
        {upgradeFrom && (
          <p className="mt-1 text-center text-[10px] font-bold text-faint">
            기존 {refund.toLocaleString()}G 환급
          </p>
        )}
      </form>
    );
  }

  // 보유 타일 상태 한 줄 — 지금 뭘 해주고 있는지
  function ownedStatus(item: (typeof FURNITURE_OPTIONS)[number]): {
    text: string;
    tone: string;
  } {
    const effect = item.effect;
    if (effect.type === "rest_bonus") {
      return effect.amount === bedBonus
        ? { text: `휴식 +${effect.amount} 적용중`, tone: "text-emerald-600" }
        : { text: `휴식 +${effect.amount} · 대기`, tone: "text-faint" };
    }
    if (effect.type === "daily_ap" || effect.type === "daily_gold") {
      const usedToday = housing.furnitureUsedToday[item.id] ?? false;
      return usedToday
        ? { text: "오늘 사용 완료", tone: "text-faint" }
        : { text: `${item.interactLabel} 가능`, tone: "text-emerald-600" };
    }
    if (effect.type === "production") {
      const data = housing.production[effect.kind];
      return {
        text: `${data.points.toLocaleString()}P · ${data.slots.length}/${Math.max(data.capacity, data.slots.length)}`,
        tone: "text-brand-600",
      };
    }
    if (effect.type === "nameplate") {
      return housing.homeName
        ? { text: `‘${housing.homeName}’`, tone: "text-brand-600" }
        : { text: "휴식 탭에서 이름 짓기", tone: "text-faint" };
    }
    return { text: "방명록 열림", tone: "text-brand-600" };
  }

  return (
    <div className="space-y-5">
      {/* 내 가구 쇼룸 */}
      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h4 className="text-sm font-extrabold text-content">🏠 내 가구</h4>
          <span className="text-[11px] font-bold text-faint">
            가구는 캐릭터 소유 — 집을 옮겨도 유지돼요
          </span>
        </div>
        {ownedItems.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-subtle/60 px-4 py-8 text-center">
            <p className="text-sm font-bold text-faint">
              아직 가구가 없어요.
              <br />
              아래 상점에서 첫 가구를 들여보세요!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ownedItems.map((item) => {
              const status = ownedStatus(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetail(item)}
                  className={`rounded-2xl border p-3 text-center transition hover:brightness-95 ${furnitureTile(item)}`}
                >
                  <span className="block text-3xl drop-shadow-sm">{item.emoji}</span>
                  <p className="mt-1.5 truncate text-sm font-extrabold text-content">
                    {item.name}
                  </p>
                  <p className={`mt-0.5 truncate text-[11px] font-bold ${status.tone}`}>
                    {status.text}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 가구 상점 — 카테고리별, 미보유만 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-sm font-extrabold text-content">🛒 가구 상점</h4>
          {!owned && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-600">
              집을 먼저 구매해주세요
            </span>
          )}
        </div>
        {FURNITURE_SECTIONS.map((section) => {
          const items = sectionItems(section);
          const cols = items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
          return (
            <div key={section.key}>
              <div className="mb-1.5 flex items-baseline gap-2 px-1">
                <p className="text-xs font-extrabold text-content">
                  {section.icon} {section.title}
                </p>
                <p className="hidden truncate text-[11px] text-faint sm:block">{section.note}</p>
              </div>
              <div className={`grid gap-2 ${cols}`}>
                {items.map((item) => {
                  const { isOwned, surpassed } = purchaseInfo(item);
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col rounded-2xl border p-3 ${
                        isOwned
                          ? "border-brand-300 bg-brand-50/70"
                          : surpassed
                            ? "border-line bg-subtle/50 opacity-70"
                            : "border-line bg-subtle"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setDetail(item)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-lg ${furnitureTile(item)}`}
                          >
                            {item.emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-content">
                              {item.name}
                            </p>
                            {item.tier != null && (
                              <p className="text-[10px] font-black text-faint">{item.tier}단계</p>
                            )}
                          </div>
                          <span className="shrink-0 text-[11px] font-bold text-faint2">ⓘ</span>
                        </div>
                        <p className="mt-2 line-clamp-2 min-h-[2.4em] text-[11px] leading-relaxed text-faint">
                          {item.desc}
                        </p>
                      </button>
                      <div className="mt-2.5">{purchaseAction(item)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* 가구 상세 — 카드 클릭 시 전체 설명 + 구매/취소 */}
      {detail && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/50 px-4 py-6"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center gap-3 border-b border-line p-5 ${furnitureTile(detail)}`}>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface/70 text-3xl">
                {detail.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-content">{detail.name}</p>
                <p className="mt-0.5 text-xs font-bold text-muted">
                  {detail.tier != null ? `${detail.tier}단계 · ` : ""}
                  {effectSummary(detail)}
                </p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                {detail.desc}
              </p>
              {(() => {
                const { isOwned, upgradeFrom, refund } = purchaseInfo(detail);
                return (
                  <div className="space-y-1.5">
                    {!isOwned && (
                      <div className="flex items-baseline justify-between rounded-xl bg-subtle px-3 py-2">
                        <span className="text-xs font-bold text-faint">
                          {upgradeFrom ? "교체 비용" : "구매 비용"}
                        </span>
                        <span className="text-sm font-extrabold text-content">
                          {detail.price.toLocaleString()}G
                          {upgradeFrom && (
                            <span className="ml-1 text-[11px] font-bold text-emerald-500">
                              (기존 {refund.toLocaleString()}G 환급)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {purchaseAction(detail)}
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="w-full rounded-xl bg-subtle px-4 py-2.5 text-sm font-bold text-content transition hover:bg-subtle-hover"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
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
  const [renameState, renameAction, renamePending] = useActionState<HousingState, FormData>(
    renameHome,
    undefined,
  );
  const [inviteState, inviteAction, invitePending] = useActionState<FriendState, FormData>(
    inviteToHouse,
    undefined,
  );
  const owned = housing.options.some((option) => option.owned);
  const ownedOption = housing.options.find((option) => option.owned) ?? null;
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
          <HousingStateLine state={renameState} />
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
            <FurnitureTab
              housing={housing}
              owned={owned}
              bedBonus={bedBonus}
              furnAction={furnAction}
              furnPending={furnPending}
            />
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

function AlchemyBookShop({
  gold,
  books,
  onClose,
}: {
  gold: number;
  books: BlackMarketView["books"];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<MarketState, FormData>(
    buyAlchemyBook,
    undefined,
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="오두막 서가"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-emerald-950/20 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-gradient-to-r from-stone-950 via-emerald-950 to-stone-950 px-5 py-4 text-white">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">
            Hidden Shelf
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold">
            <span>🏚️ 오두막 서가</span>
            <span className="text-sm font-bold text-amber-200">
              {gold.toLocaleString()}G
            </span>
          </h3>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <MarketStateLine state={state} />
          <div className="grid gap-2">
            {books.map((book) => {
              const complete = book.total > 0 && book.unlocked >= book.total;
              return (
                <form key={book.id} action={action}>
                  <input type="hidden" name="productId" value={book.id} />
                  <button
                    type="submit"
                    disabled={pending || complete || book.total === 0}
                    className="flex w-full items-start gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-55 dark:hover:bg-emerald-950/40"
                  >
                    <span className="text-xl">📖</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-content">{book.name}</span>
                      <span className="mt-0.5 block text-[11px] text-faint">
                        {book.optionLabel} 옵션 해금 · {book.unlocked}/{book.total}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-black text-amber-500">
                      {complete ? "완료" : `${book.price.toLocaleString()}G`}
                    </span>
                  </button>
                </form>
              );
            })}
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

function BlackMarketDealer({
  blackMarket,
  onClose,
}: {
  blackMarket: BlackMarketView;
  onClose: () => void;
}) {
  const [buyState, buyAction, buyPending] = useActionState<BlackMarketState, FormData>(
    buyBlackMarketItem,
    undefined,
  );
  const [potionState, potionAction, potionPending] = useActionState<BlackMarketState, FormData>(
    buyBlackMarketPotion,
    undefined,
  );
  const [exchangeState, exchangeAction, exchangePending] = useActionState<BlackMarketState, FormData>(
    exchangeBlackMarketCoin,
    undefined,
  );
  const [actionState, setActionState] = useState<BlackMarketState>(undefined);
  const [tab, setTab] = useState<"goods" | "potions" | "exchange">("goods");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<BlackMarketState>) {
    startTransition(() => {
      void action().then(setActionState);
    });
  }

  const state = exchangeState ?? potionState ?? buyState ?? actionState;
  const quest = blackMarket.quest;

  const iconOf = (kind: string) => {
    if (kind === "낚시") return "🐟";
    if (kind === "채집") return "🌿";
    if (kind === "채광") return "⛏️";
    return "📘";
  };
  const labelOf = (kind: string) => (kind === "채광" ? "광물" : kind);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="뒷골목 암상인"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-900/30 bg-zinc-950 text-zinc-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-white/10 bg-gradient-to-r from-zinc-950 via-violet-950 to-black px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-200">
            Back Alley Broker
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold">
            <span>🕯️ 암상인</span>
            <span className="rounded-full bg-violet-400/15 px-3 py-1 text-sm font-black text-violet-100">
              암상인 코인 {blackMarket.coins.toLocaleString()}개
            </span>
          </h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {state?.ok && (
            <p className="rounded-xl bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200">{state.ok}</p>
          )}
          {state?.error && (
            <p className="rounded-xl bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-200">{state.error}</p>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-extrabold text-white">📜 오늘의 의뢰</h4>
              <span className="text-xs font-bold text-violet-200">보상 {quest?.rewardCoins ?? 3}코인</span>
            </div>
            {quest ? (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-black text-white">{quest.itemName} x{quest.qty}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-400">
                    보유 {quest.have}/{quest.qty}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending || quest.delivered || quest.have < quest.qty}
                  onClick={() => run(deliverBlackMarketQuest)}
                  className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-black text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {quest.delivered ? "완료됨" : pending ? "처리 중..." : "납품"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">오늘 받을 의뢰가 없습니다.</p>
            )}
          </section>

          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/[0.04] p-1">
            {[
              { id: "goods" as const, label: "오늘의 물품" },
              { id: "potions" as const, label: "포션" },
              { id: "exchange" as const, label: "교환" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-3 py-2 text-sm font-black transition ${
                  tab === item.id
                    ? "bg-violet-500 text-white"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "goods" ? (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-sm font-extrabold text-white">🧿 오늘의 물품</h4>
                {blackMarket.isGm && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(resetBlackMarketStockForGm)}
                    className="rounded-lg border border-violet-300/30 px-3 py-1.5 text-xs font-black text-violet-100 transition hover:bg-violet-400/10 disabled:opacity-50"
                  >
                    재고 리셋
                  </button>
                )}
              </div>
              <div className="grid gap-2">
                {blackMarket.stock.map((item) => {
                  const soldOut = item.stock <= 0;
                  const label = item.skillName ?? item.itemName;
                  return (
                    <form key={item.id} action={buyAction}>
                      <input type="hidden" name="listingId" value={item.id} />
                      <button
                        type="submit"
                        disabled={buyPending || soldOut || blackMarket.coins < item.price}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:border-violet-300/50 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="text-xl">{iconOf(item.kind)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-extrabold text-white">{label}</span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-zinc-400">
                            {item.kind === "스킬북" ? item.itemName : `${labelOf(item.kind)} · ${item.rank}성`} · 재고 {item.stock}/{item.initialStock}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-black text-violet-100">
                          {soldOut ? "매진" : `${item.price}코인`}
                        </span>
                      </button>
                    </form>
                  );
                })}
                {blackMarket.stock.length === 0 && (
                  <p className="rounded-2xl bg-white/[0.04] px-4 py-8 text-center text-sm text-zinc-400">
                    오늘 들어온 물품이 없습니다.
                  </p>
                )}
              </div>
            </section>
          ) : tab === "potions" ? (
            <section>
              <h4 className="mb-2 text-sm font-extrabold text-white">🧪 포션</h4>
              <div className="grid gap-2">
                {blackMarket.potions.map((item) => (
                  <form key={item.id} action={potionAction}>
                    <input type="hidden" name="productId" value={item.id} />
                    <button
                      type="submit"
                      disabled={potionPending || blackMarket.coins < item.coinPrice}
                      className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:border-violet-300/50 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="text-xl">🧪</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-white">{item.itemName}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-zinc-400">
                          소모품 · 중량 {item.weight ?? 1}
                        </span>
                        {item.desc && (
                          <span className="mt-1 block line-clamp-2 text-[11px] leading-snug text-zinc-500">
                            {item.desc}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-black text-violet-100">
                        {item.coinPrice}코인
                      </span>
                    </button>
                  </form>
                ))}
              </div>
            </section>
          ) : (
            <section>
              <h4 className="mb-2 text-sm font-extrabold text-white">🪙 교환</h4>
              <div className="grid gap-2">
                {blackMarket.exchanges.map((item) => {
                  const limited = item.dailyLimit != null;
                  const soldOut = limited && item.remaining != null && item.remaining <= 0;
                  const goldShortage = blackMarket.gold < item.goldCost;
                  return (
                    <form key={item.id} action={exchangeAction}>
                      <input type="hidden" name="offerId" value={item.id} />
                      <button
                        type="submit"
                        disabled={exchangePending || soldOut || goldShortage}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:border-violet-300/50 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="text-xl">💰</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-extrabold text-white">
                            {item.goldCost.toLocaleString()}G → 암상인 코인 {item.coinReward}개
                          </span>
                          <span className="mt-0.5 block text-[11px] font-semibold text-zinc-400">
                            {limited
                              ? `오늘 ${item.used}/${item.dailyLimit}회 사용`
                              : "일일 제한 없음"}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-black text-violet-100">
                          {soldOut
                            ? "완료"
                            : goldShortage
                              ? "골드 부족"
                              : limited
                                ? `${item.remaining}회 남음`
                                : "교환"}
                        </span>
                      </button>
                    </form>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRemain(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function WanderingMerchantModal({
  merchant,
  nowMs,
  onClose,
}: {
  merchant: WanderingMerchantView;
  nowMs: number;
  onClose: () => void;
}) {
  const [buyState, buyAction, buyPending] = useActionState<WanderingMerchantState, FormData>(
    buyWanderingMerchantItem,
    undefined,
  );
  const [actionState, setActionState] = useState<WanderingMerchantState>(undefined);
  const [pending, startTransition] = useTransition();
  const active = merchant.active;
  const remainMs = active ? Date.parse(active.endsAt) - nowMs : 0;
  const open = !!active && remainMs > 0;

  function run(action: () => Promise<WanderingMerchantState>) {
    startTransition(() => {
      void action().then(setActionState);
    });
  }

  const state = buyState ?? actionState;
  const iconOf = (kind: string) => {
    if (kind === "낚시") return "🐟";
    if (kind === "채집") return "🌿";
    if (kind === "채광") return "⛏️";
    if (kind === "포션") return "🧪";
    return "📜";
  };
  const labelOf = (kind: string) => (kind === "채광" ? "광물" : kind);
  const metaLabel = (meta: string | null) => {
    try {
      return meta ? ((JSON.parse(meta) as { label?: string }).label ?? null) : null;
    } catch {
      return null;
    }
  };
  const rankTone = (rank: number) => {
    if (rank >= 4) return "bg-amber-400/20 text-amber-100 ring-amber-300/30";
    if (rank === 3) return "bg-violet-400/15 text-violet-200 ring-violet-300/25";
    if (rank === 2) return "bg-sky-400/15 text-sky-200 ring-sky-300/25";
    return "bg-white/10 text-stone-300 ring-white/15";
  };

  const stock = active?.stock ?? [];
  const specials = stock.filter((item) => item.kind === "포션" || item.kind === "소모품");
  const goods = stock
    .filter((item) => item.kind !== "포션" && item.kind !== "소모품")
    .sort((a, b) => a.rank - b.rank || a.price - b.price);
  const totalMs = active
    ? Math.max(1, Date.parse(active.endsAt) - Date.parse(active.startsAt))
    : 1;
  const remainRatio = open ? Math.min(1, Math.max(0, remainMs / totalMs)) : 0;
  const soldOutCount = stock.filter((item) => item.stock <= 0).length;

  function renderCard(item: WanderingMerchantStockView) {
    const soldOut = item.stock <= 0;
    const shortage = merchant.gold < item.price;
    const disabled = buyPending || soldOut || shortage;
    const extra = metaLabel(item.meta);
    const special = item.kind === "포션" || item.kind === "소모품";
    const ratio = item.initialStock > 0 ? item.stock / item.initialStock : 0;
    return (
      <form key={item.id} action={buyAction} className="contents">
        <input type="hidden" name="listingId" value={item.id} />
        <button
          type="submit"
          disabled={disabled}
          className={`group flex flex-col gap-2.5 rounded-2xl border p-3.5 text-left transition ${
            soldOut
              ? "border-white/5 bg-white/[0.02] opacity-50"
              : shortage
                ? "border-white/10 bg-white/[0.03] opacity-70"
                : "border-white/10 bg-white/[0.05] hover:-translate-y-0.5 hover:border-amber-300/50 hover:bg-amber-400/10 hover:shadow-lg hover:shadow-amber-950/40"
          } disabled:cursor-not-allowed`}
        >
          <span className="flex items-start gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/40 text-xl ring-1 ring-white/10">
              {iconOf(item.kind)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold text-white">{item.itemName}</span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ${rankTone(item.rank)}`}
                >
                  {special ? item.kind : `${labelOf(item.kind)} ${item.rank}★`}
                </span>
                {extra && (
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-stone-300">
                    {extra}
                  </span>
                )}
              </span>
            </span>
          </span>

          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className={`block h-full rounded-full ${soldOut ? "bg-stone-600" : "bg-amber-400/80"}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </span>
            <span className="shrink-0 text-[10px] font-bold text-stone-400">
              재고 {item.stock}/{item.initialStock}
            </span>
          </span>

          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-black text-amber-200">
              {item.price.toLocaleString()}G
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                soldOut
                  ? "bg-white/5 text-stone-400"
                  : shortage
                    ? "bg-rose-400/10 text-rose-200"
                    : "bg-amber-400/15 text-amber-100 group-hover:bg-amber-400 group-hover:text-stone-950"
              }`}
            >
              {soldOut ? "매진" : shortage ? "골드 부족" : "구매하기"}
            </span>
          </span>
        </button>
      </form>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="떠돌이 행상인"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-amber-900/25 bg-stone-950 text-amber-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-br from-stone-950 via-amber-950 to-stone-900 px-5 py-4">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-amber-400/10 blur-3xl"
          />
          <div className="relative flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-black text-amber-100 transition hover:border-amber-300/50 hover:bg-white/10"
            >
              <span aria-hidden>←</span> 돌아가기
            </button>
            <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-sm font-black text-amber-100 ring-1 ring-amber-300/20">
              {merchant.gold.toLocaleString()}G
            </span>
          </div>
          <p className="relative mt-3 text-[11px] font-black uppercase tracking-[0.22em] text-amber-200/80">
            Traveling Merchant
          </p>
          <h3 className="relative mt-0.5 text-2xl font-extrabold">🧳 떠돌이 행상인</h3>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {state?.ok && (
            <p className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-sm font-bold text-emerald-200">
              ✅ {state.ok}
            </p>
          )}
          {state?.error && (
            <p className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-3 py-2 text-sm font-bold text-rose-200">
              ⚠️ {state.error}
            </p>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-extrabold text-white">⛺ 대상 야영지</h4>
                {open && soldOutCount > 0 && (
                  <p className="mt-1 text-xs font-semibold text-stone-400">매진 {soldOutCount}종</p>
                )}
              </div>
              {open ? (
                <span className="rounded-full bg-amber-400/15 px-3 py-1.5 text-sm font-black text-amber-100 ring-1 ring-amber-300/20">
                  ⏳ {formatRemain(remainMs)}
                </span>
              ) : (
                <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm font-black text-stone-300">
                  부재중
                </span>
              )}
            </div>

            {open && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${Math.round(remainRatio * 100)}%` }}
                />
              </div>
            )}

            {merchant.isGm && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                <p className="text-[11px] font-bold text-stone-500">
                  GM 전용 · 소환 시 1시간 동안 전역 재고가 열립니다.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {open && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm("남은 시간과 상관없이 행상인을 지금 돌려보냅니다. 진행할까요?")) return;
                        run(dismissWanderingMerchantForGm);
                      }}
                      className="rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-2 text-sm font-black text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                    >
                      {pending ? "처리 중..." : "행상인 돌려보내기"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(summonWanderingMerchantForGm)}
                    className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-stone-950 transition hover:bg-amber-400 disabled:opacity-50"
                  >
                    {pending ? "소환 중..." : "행상인 소환"}
                  </button>
                </div>
              </div>
            )}
          </section>

          {open && active ? (
            <>
              {specials.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-white">
                    ✨ 특별 상품
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-stone-300">
                      {specials.length}
                    </span>
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">{specials.map(renderCard)}</div>
                </section>
              )}

              {goods.length > 0 && (
                <section>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-white">
                    🛒 생활 재료
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-stone-300">
                      {goods.length}
                    </span>
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">{goods.map(renderCard)}</div>
                </section>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-4 py-10 text-center">
              <p className="text-3xl">🏜️</p>
              <p className="mt-2 text-sm font-bold text-stone-300">지금은 행상인이 없습니다</p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black text-white transition hover:bg-white/15"
          >
            ← 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

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
  storageItems,
  onClose,
}: {
  cooking: CookingView;
  inventoryItems: SheetInventoryItem[];
  lifeStorageItems: LifeStorageItemView[];
  storageItems: StorageItemView[];
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
  const [tab, setTab] = useState<"pot" | "book" | "sell">("pot");
  // 냄비 — 재료 1개 단위의 이름 배열 (서버 폼 계약: ingredient 히든 인풋 1개 = 1단위)
  const [pot, setPot] = useState<string[]>([]);
  const [bookRank, setBookRank] = useState("all");
  const [bookFilter, setBookFilter] = useState("");
  const [bookSort, setBookSort] = useState<"name" | "craftable">("name");
  const [pickerOpen, setPickerOpen] = useState(false);

  const ingredientOptions = useMemo(
    () =>
      mergeItems([...inventoryItems, ...lifeStorageItems, ...storageItems]).filter(
        (item) => item.qty > 0,
      ),
    [inventoryItems, lifeStorageItems, storageItems],
  );
  const haveMap = useMemo(
    () => new Map(ingredientOptions.map((item) => [item.name, item.qty])),
    [ingredientOptions],
  );
  const potCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of pot) counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  }, [pot]);

  // 재료 팝업 소스 — 가방별 탭 (휴대품 / 채집 / 낚시 / 채광)
  const pickerSources = useMemo<PickerSource[]>(() => {
    const byKind = (kind: "채집" | "낚시" | "채광") =>
      mergeItems(lifeStorageItems.filter((item) => item.sourceKind === kind))
        .filter((item) => item.qty > 0)
        .map((item) => ({ name: item.name, qty: item.qty, note: item.effect }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const bagItems = mergeItems(inventoryItems)
      .filter((item) => item.qty > 0)
      .map((item) => ({ name: item.name, qty: item.qty }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const storedItems = mergeItems(storageItems)
      .filter((item) => item.qty > 0)
      .map((item) => ({ name: item.name, qty: item.qty, note: item.effect }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return [
      { key: "inv", label: "휴대품", emoji: "🎒", items: bagItems },
      { key: "storage", label: "창고", emoji: "📦", items: storedItems },
      { key: "gather", label: "채집", emoji: "🌿", items: byKind("채집") },
      { key: "fish", label: "낚시", emoji: "🎣", items: byKind("낚시") },
      { key: "mine", label: "채광", emoji: "⛏️", items: byKind("채광") },
    ];
  }, [inventoryItems, lifeStorageItems, storageItems]);

  function removeFromPot(index: number) {
    setPot(pot.filter((_, i) => i !== index));
  }

  // 레시피 상태 — 재료 충분 여부·주방 슬롯 초과 여부
  function recipeStatus(recipe: KnownRecipeView) {
    const total = recipe.ingredientList.reduce((sum, item) => sum + item.qty, 0);
    const overCap = total > cooking.maxIngredients;
    const hasAll = recipe.ingredientList.every(
      (item) => (haveMap.get(item.name) ?? 0) >= item.qty,
    );
    return { total, overCap, hasAll };
  }

  // 레시피 원클릭 담기 — 필요한 재료를 그대로 냄비에
  function loadRecipe(recipe: KnownRecipeView) {
    const units = recipe.ingredientList.flatMap((item) =>
      Array.from({ length: item.qty }, () => item.name),
    );
    setPot(units.slice(0, cooking.maxIngredients));
    setTab("pot");
  }

  // 냄비 내용과 정확히 일치하는 발견 레시피 — 예상 결과 미리보기
  const predicted = useMemo(() => {
    if (pot.length === 0) return null;
    return (
      cooking.knownRecipes.find((recipe) => {
        const total = recipe.ingredientList.reduce((sum, item) => sum + item.qty, 0);
        if (total !== pot.length || recipe.ingredientList.length !== potCounts.size) return false;
        return recipe.ingredientList.every((item) => potCounts.get(item.name) === item.qty);
      }) ?? null
    );
  }, [pot.length, potCounts, cooking.knownRecipes]);

  const recipeRanks = useMemo(
    () => sortedRanks(cooking.knownRecipes.map((recipe) => recipe.rank)),
    [cooking.knownRecipes],
  );

  const filteredRecipes = [...cooking.knownRecipes]
    .filter((recipe) => {
      if (bookRank !== "all" && recipe.rank !== bookRank) return false;
      const keyword = bookFilter.trim();
      if (!keyword) return true;
      return `${recipe.name} ${recipe.resultName} ${recipe.category} ${recipe.ingredients} ${
        recipe.effect ?? ""
      }`.includes(keyword);
    })
    .sort((a, b) => {
      if (bookSort === "craftable") {
        const aStatus = recipeStatus(a);
        const bStatus = recipeStatus(b);
        const aCraftable = aStatus.hasAll && !aStatus.overCap;
        const bCraftable = bStatus.hasAll && !bStatus.overCap;
        if (aCraftable !== bCraftable) return aCraftable ? -1 : 1;
        if (aStatus.overCap !== bStatus.overCap) return aStatus.overCap ? 1 : -1;
      }
      return a.name.localeCompare(b.name, "ko");
    });

  const potSlots = Array.from({ length: cooking.maxIngredients }, (_, i) => pot[i] ?? null);

  const TABS = [
    { key: "pot" as const, label: `🍲 조리대 (${pot.length}/${cooking.maxIngredients})` },
    { key: "book" as const, label: `📖 레시피북 (${cooking.knownRecipes.length})` },
    { key: "sell" as const, label: `💰 판매 (${cooking.cookedFoods.length})` },
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
        aria-label="요리"
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">
            Cooking
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>🍳 {cooking.facilityName}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-black text-brand-600">
                재료 최대 {cooking.maxIngredients}개
              </span>
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-black text-amber-500">
                ⚡ {cooking.ap} · 조리 -10
              </span>
            </span>
          </h3>
          <div className="mt-3 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-t-xl px-3.5 py-2 text-sm font-extrabold transition ${
                  tab === t.key ? "bg-surface text-content shadow-sm" : "text-faint hover:text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <CookingStateLine state={cookState} />
          <CookingStateLine state={sellState} />

          {tab === "pot" && (
            <>
              {/* 냄비 슬롯 */}
              <section className="rounded-2xl border border-line bg-subtle p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-extrabold text-content">🍲 냄비</h4>
                  {pot.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPot([])}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-black text-muted transition hover:bg-red-50 hover:text-red-500"
                    >
                      비우기
                    </button>
                  )}
                </div>
                <div
                  className={`grid gap-2 ${
                    cooking.maxIngredients >= 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"
                  }`}
                >
                  {potSlots.map((name, index) =>
                    name ? (
                      <button
                        key={`${name}-${index}`}
                        type="button"
                        onClick={() => removeFromPot(index)}
                        title="눌러서 빼기"
                        className="group grid min-h-20 place-items-center rounded-2xl border border-brand-200 bg-brand-50 p-2 text-center transition hover:border-red-200 hover:bg-red-50"
                      >
                        <span className="line-clamp-2 text-sm font-extrabold text-content">
                          {name}
                        </span>
                        <span className="text-[10px] font-black text-brand-500 group-hover:text-red-500">
                          ✕ 빼기
                        </span>
                      </button>
                    ) : (
                      <button
                        key={`empty-${index}`}
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        title="재료 넣기"
                        className="grid min-h-20 place-items-center rounded-2xl border border-dashed border-line bg-surface/60 text-xs font-bold text-faint2 transition hover:border-brand-300 hover:text-brand-500"
                      >
                        + 재료 넣기
                      </button>
                    ),
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="mt-3 w-full rounded-xl border border-brand-200 bg-surface px-3 py-2 text-sm font-extrabold text-brand-600 transition hover:bg-brand-50"
                >
                  🎒 재료 넣기 — 가방에서 골라 담기
                </button>

                {/* 예상 결과 미리보기 — 잘못 조리로 재료 날리는 사고 방지 */}
                {pot.length > 0 && (
                  <p
                    className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
                      predicted
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {predicted
                      ? `✨ 이대로 조리하면 [${predicted.name}] 완성!`
                      : "❓ 아는 레시피와 일치하지 않아요 — 새로운 발견이거나, 실패작이 나올 수 있어요."}
                  </p>
                )}

                <form action={cookAction} className="mt-3">
                  <input type="hidden" name="facility" value={cooking.facility} />
                  {pot.map((name, index) => (
                    <input key={`${name}-${index}`} type="hidden" name="ingredient" value={name} />
                  ))}
                  <button
                    type="submit"
                    disabled={cookPending || pot.length === 0 || cooking.ap < 10}
                    className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-600 disabled:opacity-50"
                  >
                    {cookPending
                      ? "조리 중..."
                      : pot.length === 0
                        ? "재료를 먼저 넣어주세요"
                        : `조리하기 (재료 ${pot.length}개 · 피로도 -10)`}
                  </button>
                </form>
              </section>

            </>
          )}

          {tab === "book" && (
            <section className="space-y-2">
              {cooking.knownRecipes.length > 0 && (
                <div className="flex gap-1 overflow-x-auto rounded-2xl bg-subtle p-1">
                  {[
                    { key: "all", label: `전체 ${cooking.knownRecipes.length}` },
                    ...recipeRanks.map((rank) => ({
                      key: rank,
                      label: `${rank} ${
                        cooking.knownRecipes.filter((recipe) => recipe.rank === rank).length
                      }`,
                    })),
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setBookRank(filter.key)}
                      className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                        bookRank === filter.key
                          ? "bg-surface text-brand-600 shadow-sm"
                          : "text-muted hover:text-content"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={bookFilter}
                  onChange={(e) => setBookFilter(e.target.value)}
                  placeholder="레시피·재료 검색"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-faint2 focus:border-brand-400 focus:outline-none"
                />
                <span className="shrink-0 text-[11px] font-bold text-faint">
                  {filteredRecipes.length}개
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto rounded-2xl bg-subtle p-1">
                {[
                  { key: "name" as const, label: "이름순" },
                  { key: "craftable" as const, label: "제작 가능순" },
                ].map((sort) => (
                  <button
                    key={sort.key}
                    type="button"
                    onClick={() => setBookSort(sort.key)}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                      bookSort === sort.key
                        ? "bg-surface text-brand-600 shadow-sm"
                        : "text-muted hover:text-content"
                    }`}
                  >
                    {sort.label}
                  </button>
                ))}
              </div>
              {cooking.knownRecipes.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  아직 발견한 레시피가 없어요.
                  <br />
                  조리대에서 재료를 조합해 첫 레시피를 발견해보세요!
                </p>
              ) : (
                <>
                  {filteredRecipes.length === 0 ? (
                    <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                      조건에 맞는 레시피가 없어요.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {filteredRecipes.map((recipe) => {
                        const status = recipeStatus(recipe);
                        return (
                          <li
                            key={recipe.id}
                            className="rounded-2xl border border-line bg-subtle p-3.5"
                          >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-content">
                              {recipe.name}
                              <span className="ml-1.5 align-middle text-[11px] font-black text-amber-500">
                                {recipe.rank}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[11px] font-bold text-faint">
                              {recipe.category} · {recipe.resultName} · 판매{" "}
                              {recipe.sellPrice.toLocaleString()}G
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${
                              status.overCap
                                ? "bg-violet-50 text-violet-500"
                                : "bg-surface text-muted"
                            }`}
                          >
                            재료 {status.total}개{status.overCap ? " · 집 주방 전용" : ""}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {recipe.ingredientList.map((item) => {
                            const have = haveMap.get(item.name) ?? 0;
                            const enough = have >= item.qty;
                            return (
                              <span
                                key={item.name}
                                className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                                  enough
                                    ? "bg-emerald-50 text-emerald-600"
                                    : "bg-red-50 text-red-500"
                                }`}
                              >
                                {item.name} {Math.min(have, item.qty)}/{item.qty}
                              </span>
                            );
                          })}
                        </div>
                        {recipe.effect && (
                          <p className="mt-2 line-clamp-2 text-xs text-faint">{recipe.effect}</p>
                        )}
                        <button
                          type="button"
                          disabled={!status.hasAll || status.overCap}
                          onClick={() => loadRecipe(recipe)}
                          className="mt-2.5 w-full rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-40"
                        >
                          {status.overCap
                            ? `이 주방에서는 불가 (재료 ${status.total}개 · 최대 ${cooking.maxIngredients}개)`
                            : status.hasAll
                              ? "🍲 재료 담기"
                              : "재료가 부족해요"}
                        </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}

          {tab === "sell" && (
            <section className="space-y-2">
              {cooking.cookedFoods.length === 0 ? (
                <p className="rounded-2xl bg-subtle px-4 py-10 text-center text-sm text-faint">
                  판매할 요리가 없어요.
                </p>
              ) : (
                <ul className="space-y-2">
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

      {pickerOpen && (
        <IngredientPicker
          title="🍲 냄비에 재료 담기"
          accent="brand"
          sources={pickerSources}
          initial={Object.fromEntries(potCounts)}
          maxUnits={cooking.maxIngredients}
          onConfirm={(draft) =>
            setPot(
              Object.entries(draft)
                .filter(([, qty]) => qty > 0)
                .flatMap(([name, qty]) => Array.from({ length: qty }, () => name))
                .slice(0, cooking.maxIngredients),
            )
          }
          onClose={() => setPickerOpen(false)}
        />
      )}
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
  canGuildBackyard,
  canMarket,
  canStorage,
  canInn,
  canHousing,
  canGacha,
  canBlackMarket,
  canAlchemyBookShop,
  cooking,
  alchemy,
  blackMarket,
  wanderingMerchant,
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
  weeklyIncome,
}: Props) {
  const [open, setOpen] = useState(false);
  const [craftOpen, setCraftOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [lifeShopOpen, setLifeShopOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [foodMarketOpen, setFoodMarketOpen] = useState(false);
  const [cookingOpen, setCookingOpen] = useState(false);
  const [alchemyOpen, setAlchemyOpen] = useState(false);
  const [alchemyBookOpen, setAlchemyBookOpen] = useState(false);
  const [blackDealerOpen, setBlackDealerOpen] = useState(false);
  const [wanderingMerchantOpen, setWanderingMerchantOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 서버·클라이언트가 각자 Date.now() 를 찍으면 카운트다운 문구가 어긋나 하이드레이션이 깨진다.
  const [mounted, setMounted] = useState(false);
  const [gachaOpen, setGachaOpen] = useState(false);
  const [innOpen, setInnOpen] = useState(false);
  const [housingOpen, setHousingOpen] = useState(false);
  const [productionOpen, setProductionOpen] = useState<ProductionKind | null>(null);
  const [dailyFurnitureOpen, setDailyFurnitureOpen] = useState<string | null>(null);
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
  const ownedFurniture = useMemo(() => new Set(housing.furnitureOwned), [housing.furnitureOwned]);
  const merchantRemainMs = wanderingMerchant.active
    ? Date.parse(wanderingMerchant.active.endsAt) - nowMs
    : 0;
  const merchantOpenNow = !!wanderingMerchant.active && merchantRemainMs > 0;
  const merchantVisible = wanderingMerchant.enabled && (merchantOpenNow || wanderingMerchant.isGm);
  // 티어 무관 — 해당 종류의 생산 가구(어항·화분 계열)를 하나라도 보유하면 시설 노출
  const productionFacilities = (["낚시", "채집"] as const).filter((kind) =>
    FURNITURE_OPTIONS.some(
      (item) =>
        item.effect.type === "production" &&
        item.effect.kind === kind &&
        ownedFurniture.has(item.id),
    ),
  );
  const dailyFacilities = FURNITURE_OPTIONS.filter(
    (item) => ownedFurniture.has(item.id) && item.interactLabel && item.effect.type !== "production",
  );
  const alchemyReady = !!alchemy.brewing && nowMs >= alchemy.brewing.readyAt;

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    if (!alchemy.brewing && !wanderingMerchant.active) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [alchemy.brewing, wanderingMerchant.active]);

  if (!canForge && !canGuild && !canGuildBackyard && !canMarket && !canStorage && !canInn && !canHousing && !cooking.enabled && !alchemy.enabled && !canGacha && !canBlackMarket && !canAlchemyBookShop && !merchantVisible && !weeklyIncome) return null;

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
          {alchemy.enabled && (
            <button
              type="button"
              onClick={() => setAlchemyOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3.5 py-3 text-left transition hover:border-violet-300 hover:from-violet-100 hover:to-fuchsia-100 dark:from-violet-950/40 dark:to-fuchsia-950/30"
            >
              <span className={`text-xl ${alchemy.brewing ? "alch-glow inline-block" : ""}`}>
                {alchemy.labEmoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-content">{alchemy.labName}</span>
                <span className="text-[11px] font-bold text-violet-600 dark:text-violet-300">
                  {alchemy.brewing
                    ? alchemyReady
                      ? `${alchemy.brewing.recipeName} 완성!`
                      : `${alchemy.brewing.recipeName} 끓는 중…`
                    : `연금술 Lv.${alchemy.level}`}
                </span>
              </span>
              {alchemyReady && (
                <span className="shrink-0 rounded-full bg-violet-500 px-2.5 py-1 text-xs font-black text-white">
                  ✨수령
                </span>
              )}
            </button>
          )}
          {canAlchemyBookShop && (
            <button
              type="button"
              onClick={() => setAlchemyBookOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-stone-50 px-3.5 py-3 text-left transition hover:border-emerald-300 hover:from-emerald-100 hover:to-stone-100 dark:from-emerald-950/40 dark:to-stone-950/30"
            >
              <span className="text-xl">📚</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-content">오두막 서가</span>
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  연금술 레시피 해금
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
          {merchantVisible && (
            <button
              type="button"
              onClick={() => setWanderingMerchantOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-300/50 bg-gradient-to-r from-stone-900 to-amber-900 px-3.5 py-3 text-left text-white shadow-sm transition hover:border-amber-300"
            >
              <span className="text-xl">🧳</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">떠돌이 행상인</span>
                <span className="text-[11px] text-amber-100">
                  {merchantOpenNow
                    ? mounted
                      ? `전역 재고 · 남은 시간 ${formatRemain(merchantRemainMs)}`
                      : "전역 재고 판매 중"
                    : wanderingMerchant.isGm
                      ? `GM 소환 가능 · 오늘 ${wanderingMerchant.todaySummonCount}회`
                      : "지금은 머물고 있지 않음"}
                </span>
              </span>
            </button>
          )}
          {canBlackMarket && (
            <button
              type="button"
              onClick={() => setBlackDealerOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800/20 bg-gradient-to-r from-zinc-950 to-violet-950 px-3.5 py-3 text-left text-white shadow-sm transition hover:border-violet-400"
            >
              <span className="text-xl">🕯️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold">암상인</span>
                <span className="text-[11px] text-violet-100">
                  일일 의뢰 · 희귀 자원 · 코인 {blackMarket.coins.toLocaleString()}개
                </span>
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
          {canGuildBackyard && (
            <button
              type="button"
              onClick={() => setTrainingOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="text-xl">🏋️</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-content">길드 뒷마당</span>
                <span className="text-[11px] text-faint">단련 · 피로도 5</span>
              </span>
              {guild.training.pendingPicks > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-white">
                  성장 {guild.training.pendingPicks}
                </span>
              )}
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
          {weeklyIncome && (
            <button
              type="button"
              onClick={() => setIncomeOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-3.5 py-3 text-left transition hover:border-amber-300 hover:from-amber-100 hover:to-yellow-100"
            >
              <span className="text-xl">💰</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-content">주간 수입</span>
                <span className="text-[11px] font-bold text-amber-600">
                  {weeklyIncome.entries.length === 0
                    ? "프리 플레이 스킬 · 우상 환전소"
                    : `받을 수 있는 항목 ${weeklyIncome.entries.filter((e) => !e.claimed).length}건`}
                </span>
              </span>
              {weeklyIncome.entries.some((e) => !e.claimed) && (
                <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-black text-white">
                  {weeklyIncome.entries
                    .filter((e) => !e.claimed)
                    .reduce((sum, e) => sum + e.amount, 0)
                    .toLocaleString()}
                  G
                </span>
              )}
            </button>
          )}
          {canHousing &&
            productionFacilities.map((kind) => {
              const meta = productionMeta(kind);
              const data = housing.production[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setProductionOpen(kind)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-100"
                >
                  <span className="text-xl">{data.facilityEmoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-content">
                      {data.facilityName}
                    </span>
                    <span className="text-[11px] font-bold text-brand-600">
                      {meta.pointName} {data.points.toLocaleString()}P · 매일 +{data.dailyPoints.toLocaleString()}P
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-black text-brand-600">
                    {data.slots.length}/{Math.max(data.capacity, data.slots.length)}
                  </span>
                </button>
              );
            })}
          {canHousing &&
            dailyFacilities.map((item) => {
              const usedToday = housing.furnitureUsedToday[item.id] ?? false;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDailyFurnitureOpen(item.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="text-xl">{item.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold text-content">{item.name}</span>
                    <span className="text-[11px] text-faint">
                      {usedToday ? "오늘 사용 완료" : `${item.interactLabel} 가능`}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${
                      usedToday ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {usedToday ? "완료" : "사용"}
                  </span>
                </button>
              );
            })}
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

      {trainingOpen && canGuildBackyard && (
        <TrainingYard
          training={guild.training}
          ap={craftAp}
          onClose={() => setTrainingOpen(false)}
        />
      )}

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

      {alchemyBookOpen && (
        <AlchemyBookShop
          gold={blackMarket.gold}
          books={blackMarket.books}
          onClose={() => setAlchemyBookOpen(false)}
        />
      )}

      {blackDealerOpen && (
        <BlackMarketDealer
          blackMarket={blackMarket}
          onClose={() => setBlackDealerOpen(false)}
        />
      )}
      {wanderingMerchantOpen && (
        <WanderingMerchantModal
          merchant={wanderingMerchant}
          nowMs={nowMs}
          onClose={() => setWanderingMerchantOpen(false)}
        />
      )}

      {cookingOpen && (
        <CookingKitchen
          cooking={cooking}
          inventoryItems={inventoryItems}
          lifeStorageItems={lifeStorageItems}
          storageItems={storage.items}
          onClose={() => setCookingOpen(false)}
        />
      )}

      {alchemyOpen && (
        <AlchemyLab
          alchemy={alchemy}
          inventoryItems={inventoryItems}
          lifeItems={lifeStorageItems}
          storageItems={storage.items}
          onClose={() => setAlchemyOpen(false)}
        />
      )}

      {gachaOpen && <RecipeGacha gold={lifeShop.gold} onClose={() => setGachaOpen(false)} />}

      {innOpen && <InnRest inn={inn} onClose={() => setInnOpen(false)} />}

      {housingOpen && <HousingPanel housing={housing} onClose={() => setHousingOpen(false)} />}

      {incomeOpen && weeklyIncome && (
        <WeeklyIncomePanel income={weeklyIncome} onClose={() => setIncomeOpen(false)} />
      )}

      {productionOpen && (
        <HousingProductionFacility
          kind={productionOpen}
          housing={housing}
          onClose={() => setProductionOpen(null)}
        />
      )}

      {dailyFurnitureOpen && (
        <DailyFurnitureFacility
          itemId={dailyFurnitureOpen}
          housing={housing}
          onClose={() => setDailyFurnitureOpen(null)}
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
