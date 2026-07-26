"use client";

// 연금술 공방 — 재료의 연금 포인트로 포션 효과를 설계하는 집 가구 시설.

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import {
  cancelBrew,
  collectBrew,
  startBrew,
  type AlchemyState,
} from "@/app/actions/services";
import {
  ALCHEMY_OPTION_LIMIT,
  BREW_AP_COST,
  alchemyLabSlotLimit,
  alchemyMaterialPointsForItem,
  parsePotionName,
} from "@/lib/alchemy";
import type { SheetInventoryItem } from "@/lib/googleSheets";
import IngredientPicker, { type PickerSource } from "@/components/IngredientPicker";

export type AlchemyRecipeView = {
  id: string;
  name: string;
  rank: string;
  category: string;
  ingredients: string;
  ingredientList: { name: string; qty: number }[];
  resultName: string;
  sellPrice: number;
  effect: string | null;
  duration: string | null;
  skillExp: number;
  tags: string | null;
  mastered: boolean; // 완벽 제조 경험 — 최적시간·완벽효과 공개
  masteryExp: number;
  masteryRank: "기본" | "숙련" | "장인";
  nextMastery: number | null;
  bestMinutes: number | null; // mastered 일 때만 값이 있음
  perfectEffect: string | null; // mastered 일 때만 값이 있음
  adeptPerfectEffect: string | null;
  masterPerfectEffect: string | null;
  pointCost: number;
  requiredMaterials: { name: string; qty: number }[];
  optionPrice: number;
  repeatable: boolean;
  repeatPointStep: number;
};

export type AlchemyBrewingView = {
  recipeId: string;
  recipeName: string;
  minutes: number;
  startedAt: number;
  readyAt: number;
};

export type AlchemyPotionView = {
  name: string;
  qty: number;
  unitPrice: number;
  effect: string | null;
};

export type AlchemyAcceleratorView = {
  name: string;
  qty: number;
  minutes: number;
};

export type AlchemyView = {
  enabled: boolean;
  labName: string;
  labEmoji: string;
  labTier: number;
  tolerance: number; // 공방 확장 보너스 — 완벽 판정 ±N분
  ap: number;
  gold: number;
  level: number;
  exp: number;
  nextExp: number;
  masterCount: number;
  recipeCount: number;
  maxIngredients: number;
  recipes: AlchemyRecipeView[];
  brewing: AlchemyBrewingView | null;
  potions: AlchemyPotionView[];
  accelerators: AlchemyAcceleratorView[];
};

type LifeItemLike = { name: string; qty: number; rank?: number; sourceKind?: "낚시" | "채집" | "채광" };
type PotEntry = { name: string; qty: number };

function rankFromNote(note: string | null | undefined): number | null {
  const match = (note ?? "").match(/R\s*(\d+)/i);
  if (!match) return null;
  const rank = Number(match[1]);
  return Number.isFinite(rank) ? rank : null;
}

function StateLine({ state }: { state: AlchemyState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      className={`animate-fadeup rounded-xl px-3 py-2 text-xs font-bold ${
        state.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

// 끓는 가마 — CSS 애니메이션 연출
function Cauldron({ boiling }: { boiling: boolean }) {
  return (
    <div className="relative mx-auto h-36 w-40">
      {boiling && (
        <>
          <span className="alch-steam absolute left-10 top-2 text-lg opacity-0">💨</span>
          <span
            className="alch-steam absolute left-20 top-0 text-xl opacity-0"
            style={{ animationDelay: "1.1s" }}
          >
            💨
          </span>
          <span
            className="alch-steam absolute left-28 top-3 text-base opacity-0"
            style={{ animationDelay: "2s" }}
          >
            💨
          </span>
        </>
      )}
      {boiling && (
        <div className="absolute left-1/2 top-10 -translate-x-1/2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="alch-bubble absolute h-2.5 w-2.5 rounded-full bg-fuchsia-300/80"
              style={{ left: `${(i - 2) * 13}px`, animationDelay: `${i * 0.45}s` }}
            />
          ))}
        </div>
      )}
      <div className={`absolute inset-x-2 bottom-4 top-12 ${boiling ? "alch-shake" : ""}`}>
        <div className="relative h-full w-full rounded-b-[3rem] rounded-t-xl bg-gradient-to-b from-slate-600 to-slate-800 shadow-inner">
          <div
            className={`absolute inset-x-2 top-1 h-4 rounded-full ${
              boiling
                ? "bg-gradient-to-r from-fuchsia-400 via-violet-400 to-fuchsia-400"
                : "bg-slate-500"
            }`}
          />
        </div>
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-2xl">
        {boiling ? <span className="alch-glow inline-block">🔥</span> : <span className="opacity-40">🪵</span>}
      </div>
    </div>
  );
}

export default function AlchemyLab({
  alchemy,
  inventoryItems,
  lifeItems,
  storageItems,
  onClose,
}: {
  alchemy: AlchemyView;
  inventoryItems: SheetInventoryItem[];
  lifeItems: LifeItemLike[];
  storageItems?: (SheetInventoryItem & { sourceKind?: string })[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<"materials" | "effects">("materials");
  const [pot, setPot] = useState<PotEntry[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [startState, startAction, startPending] = useActionState<AlchemyState, FormData>(
    startBrew,
    undefined,
  );
  const [collectState, collectAction, collectPending] = useActionState<AlchemyState, FormData>(
    collectBrew,
    undefined,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState<AlchemyState, FormData>(
    cancelBrew,
    undefined,
  );

  useEffect(() => {
    if (pot.length === 0) {
      setStep("materials");
      setSelectedOptionIds([]);
    }
  }, [pot.length]);

  const materialRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const item of lifeItems) {
      if (item.sourceKind !== "채집") continue;
      const rank = item.rank ?? rankFromNote(null);
      if (rank != null) ranks.set(item.name.trim(), rank);
    }
    for (const item of storageItems ?? []) {
      if (item.sourceKind !== "채집") continue;
      const rank = rankFromNote(item.effect);
      if (rank != null) ranks.set(item.name.trim(), rank);
    }
    return ranks;
  }, [lifeItems, storageItems]);

  const materialPointOf = (name: string) =>
    alchemyMaterialPointsForItem(name, materialRanks.get(name.trim()) ?? 0);

  // 재료 후보 — 연금 포인트가 붙는 생활 재료만
  const drawerNames = useMemo(() => {
    const names = new Set<string>();
    for (const [name, rank] of materialRanks) {
      if (alchemyMaterialPointsForItem(name, rank) > 0) names.add(name);
    }
    return names;
  }, [materialRanks]);

  // 재료 팝업 소스 — 가방별 탭 (휴대품은 등급 붙은 포션도 기본 이름으로 합산)
  const pickerSources = useMemo<PickerSource[]>(() => {
    const bag = new Map<string, number>();
    for (const item of inventoryItems) {
      if (item.qty <= 0) continue;
      const raw = item.name.trim();
      const base = parsePotionName(raw).base;
      const key = drawerNames.has(raw) ? raw : drawerNames.has(base) ? base : null;
      if (key) bag.set(key, (bag.get(key) ?? 0) + item.qty);
    }
    const bagItems = [...bag.entries()]
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    const stored = new Map<string, number>();
    for (const item of storageItems ?? []) {
      if (item.qty <= 0) continue;
      const raw = item.name.trim();
      const base = parsePotionName(raw).base;
      const key = drawerNames.has(raw) ? raw : drawerNames.has(base) ? base : null;
      if (key) stored.set(key, (stored.get(key) ?? 0) + item.qty);
    }
    const storedItems = [...stored.entries()]
      .map(([name, qty]) => ({
        name,
        qty,
        note: `R${materialRanks.get(name) ?? 0} · ${materialPointOf(name)}pt`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));

    const byKind = (kind: "채집") => {
      const merged = new Map<string, number>();
      for (const item of lifeItems) {
        if (item.sourceKind !== kind || item.qty <= 0) continue;
        const name = item.name.trim();
        if (!drawerNames.has(name)) continue;
        merged.set(name, (merged.get(name) ?? 0) + item.qty);
      }
      return [...merged.entries()]
        .map(([name, qty]) => ({
          name,
          qty,
          note: `R${materialRanks.get(name) ?? 0} · ${materialPointOf(name)}pt`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    };

    return [
      { key: "inv", label: "휴대품", emoji: "🎒", items: bagItems },
      { key: "storage", label: "창고", emoji: "📦", items: storedItems },
      { key: "gather", label: "채집", emoji: "🌿", items: byKind("채집") },
    ];
  }, [inventoryItems, lifeItems, storageItems, drawerNames, materialRanks]);

  const takeFromPot = (name: string) => {
    setPot((prev) =>
      prev
        .map((entry) => (entry.name === name ? { ...entry, qty: entry.qty - 1 } : entry))
        .filter((entry) => entry.qty > 0),
    );
  };

  const optionById = useMemo(
    () => new Map(alchemy.recipes.map((option) => [option.id, option])),
    [alchemy.recipes],
  );
  const selectedOptions = useMemo(
    () =>
      selectedOptionIds
        .map((id) => optionById.get(id))
        .filter((option): option is AlchemyRecipeView => !!option),
    [optionById, selectedOptionIds],
  );
  const selectedOptionCopyIndexes = useMemo(() => {
    const counts = new Map<string, number>();
    return selectedOptions.map((option) => {
      const index = counts.get(option.id) ?? 0;
      counts.set(option.id, index + 1);
      return index;
    });
  }, [selectedOptions]);
  const selectedCountOf = (id: string) => selectedOptionIds.filter((selected) => selected === id).length;
  const selectedOptionTypeCount = useMemo(
    () => new Set(selectedOptionIds).size,
    [selectedOptionIds],
  );
  const optionCopyCost = (option: AlchemyRecipeView, copyIndex: number): number => {
    if (copyIndex <= 0) return option.pointCost;
    if (!option.repeatable) return Number.POSITIVE_INFINITY;
    return option.pointCost + option.repeatPointStep * copyIndex;
  };
  const availablePoints = pot.reduce((sum, entry) => sum + materialPointOf(entry.name), 0);
  const spentPoints = selectedOptions.reduce(
    (sum, option, index) => sum + optionCopyCost(option, selectedOptionCopyIndexes[index]),
    0,
  );
  const remainingPoints = availablePoints - spentPoints;
  const potNames = useMemo(() => new Set(pot.map((entry) => entry.name)), [pot]);
  const optionUnlocked = (option: AlchemyRecipeView) =>
    option.requiredMaterials.every((ingredient) => potNames.has(ingredient.name));
  const addOption = (option: AlchemyRecipeView) => {
    const count = selectedCountOf(option.id);
    if (count === 0 && selectedOptionTypeCount >= ALCHEMY_OPTION_LIMIT) return;
    if (count > 0 && !option.repeatable) return;
    const nextCost = optionCopyCost(option, count);
    if (spentPoints + nextCost > availablePoints) return;
    setSelectedOptionIds((prev) => [...prev, option.id]);
  };
  const removeOption = (id: string) => {
    setSelectedOptionIds((prev) => {
      const index = prev.lastIndexOf(id);
      if (index < 0) return prev;
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  };
  const potUnits = pot.map((entry) => entry.name);
  const maxIngredients = alchemy.maxIngredients ?? alchemyLabSlotLimit(alchemy.labTier);
  const potSlots = Array.from({ length: maxIngredients }, (_, i) => pot[i] ?? null);

  const brewing = alchemy.brewing;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="연금술 공방"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 — 보랏빛 연금술 무드 */}
        <div className="border-b border-line bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 px-5 pt-4 text-white">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-200">
            Alchemy Lab
          </p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold">
            <span>
              {alchemy.labEmoji} {alchemy.labName}
              <span className="ml-2 align-middle text-xs font-black text-violet-200">
                {"●".repeat(alchemy.labTier)}
                {"○".repeat(Math.max(0, 3 - alchemy.labTier))}
              </span>
            </span>
            <span className="text-sm font-bold text-amber-200">
              {alchemy.gold.toLocaleString()}G
            </span>
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
            <span className="rounded-full bg-white/15 px-2.5 py-1">
              🧫 연금술 Lv.{alchemy.level}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">
              ⚗️ 숙련도 {alchemy.exp}/{alchemy.nextExp}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">
              ⚡ {alchemy.ap} · 제조 -{BREW_AP_COST}
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            {[
              { key: "materials" as const, label: "🔥 실험 테이블" },
              { key: "effects" as const, label: "🧪 효과 지정" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === "effects" && pot.length === 0) return;
                  setStep(item.key);
                }}
                disabled={item.key === "effects" && pot.length === 0}
                className={`rounded-t-xl px-4 py-2 text-sm font-extrabold transition ${
                  step === item.key
                    ? "bg-surface text-content shadow-sm"
                    : "text-violet-100 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-3">
          <StateLine state={startState} />
          <StateLine state={collectState} />
          <StateLine state={cancelState} />

          {/* ── 가마: 완성 ── */}
          {brewing && (
            <section className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-fuchsia-50 p-5 text-center dark:from-violet-950/40 dark:to-fuchsia-950/30">
              <Cauldron boiling={false} />
              <p className="mt-2 text-lg font-extrabold text-content">
                ✨ {brewing.recipeName} 완성!
              </p>
              <p className="mt-1 text-sm font-bold text-violet-600 dark:text-violet-300">
                가마를 열어 수령하세요.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <form action={collectAction}>
                  <button
                    type="submit"
                    disabled={collectPending}
                    className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:opacity-90 disabled:opacity-40"
                  >
                    {collectPending ? "여는 중…" : "⚗️ 가마 열기"}
                  </button>
                </form>
                <form
                  action={cancelAction}
                  onSubmit={(e) => {
                    if (!confirm("가마를 비우면 재료와 피로도는 돌아오지 않아요. 비울까요?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  <button
                    type="submit"
                    disabled={cancelPending}
                    className="rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm font-bold text-muted transition hover:text-red-500 disabled:opacity-40"
                  >
                    비우기
                  </button>
                </form>
              </div>
            </section>
          )}

          {/* ── 가마: 조합 ── */}
          {!brewing && step === "materials" && (
            <>
              <section className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50/60 to-transparent p-3 dark:from-violet-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-extrabold text-faint">
                    🫧 연금술 테이블 ({pot.length}/{maxIngredients}칸)
                  </p>
                  {pot.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPot([]);
                        setSelectedOptionIds([]);
                      }}
                      className="text-[11px] font-bold text-faint transition hover:text-red-500"
                    >
                      전부 빼기
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {potSlots.map((entry, i) =>
                    entry ? (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => takeFromPot(entry.name)}
                        title="누르면 1개 빼기"
                        className="rounded-xl border border-violet-300 bg-surface px-1.5 py-2 text-center transition hover:border-red-300"
                      >
                        <span className="block truncate text-[11px] font-extrabold text-content">
                          {entry.name}
                        </span>
                        <span className="text-xs font-black text-violet-500">
                          {materialPointOf(entry.name)}pt
                        </span>
                      </button>
                    ) : (
                      <button
                        key={`empty-${i}`}
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        title="재료 넣기"
                        className="grid place-items-center rounded-xl border border-dashed border-line py-2 text-lg text-faint2 transition hover:border-violet-300 hover:text-violet-400"
                      >
                        +
                      </button>
                    ),
                  )}
                </div>
                <p
                  className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                    selectedOptions.length > 0 && spentPoints <= availablePoints
                      ? "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
                      : "bg-subtle text-faint"
                  }`}
                >
                  {selectedOptions.length > 0
                    ? `선택 옵션 ${selectedOptionTypeCount}/${ALCHEMY_OPTION_LIMIT}종 · 누적 ${selectedOptions.length}회 · 포인트 ${spentPoints}/${availablePoints}`
                    : pot.length > 0
                      ? `사용 가능 포인트 ${availablePoints} · 다음 단계에서 효과를 지정하세요.`
                      : "재료를 넣으면 연금 포인트가 생깁니다."}
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="mt-2 w-full rounded-xl border border-violet-200 bg-surface px-3 py-2 text-sm font-extrabold text-violet-600 transition hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
                >
                  🗄️ 재료 넣기 — 가방에서 골라 담기
                </button>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-3">
                <button
                  type="button"
                  disabled={pot.length === 0 || availablePoints <= 0}
                  onClick={() => setStep("effects")}
                  className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:opacity-90 disabled:opacity-40"
                >
                  🧪 포션 효과 지정
                </button>
              </section>
            </>
          )}

          {!brewing && step === "effects" && (
            <>
              <section className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50/60 to-transparent p-3 dark:from-violet-950/30">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-surface px-3 py-2">
                    <p className="text-[10px] font-bold text-faint">사용 가능</p>
                    <p className="text-lg font-black text-violet-600">{availablePoints}pt</p>
                  </div>
                  <div className="rounded-xl bg-surface px-3 py-2">
                    <p className="text-[10px] font-bold text-faint">사용함</p>
                    <p className="text-lg font-black text-content">{spentPoints}pt</p>
                  </div>
                  <div className="rounded-xl bg-surface px-3 py-2">
                    <p className="text-[10px] font-bold text-faint">남은 포인트</p>
                    <p className={`text-lg font-black ${remainingPoints < 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {remainingPoints}pt
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedOptions.length === 0 ? (
                    <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-bold text-faint">
                      선택한 효과 없음
                    </span>
                  ) : (
                    [...new Set(selectedOptionIds)].map((id) => {
                      const option = optionById.get(id);
                      if (!option) return null;
                      const count = selectedCountOf(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => removeOption(id)}
                          className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-black text-violet-700 transition hover:bg-violet-200"
                        >
                          {option.name}
                          {count > 1 ? ` x${count}` : ""} −
                        </button>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="space-y-2 rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-faint">효과 선택</p>
                  <p className="text-xs font-black text-violet-500">
                    {selectedOptionTypeCount}/{ALCHEMY_OPTION_LIMIT}종
                  </p>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {alchemy.recipes.map((option) => {
                    const pickedCount = selectedCountOf(option.id);
                    const picked = pickedCount > 0;
                    const unlocked = optionUnlocked(option);
                    const nextCost = optionCopyCost(option, pickedCount);
                    const affordable = spentPoints + nextCost <= availablePoints;
                    const newOptionType = pickedCount === 0;
                    const canAdd =
                      unlocked &&
                      affordable &&
                      (!newOptionType || selectedOptionTypeCount < ALCHEMY_OPTION_LIMIT) &&
                      (pickedCount === 0 || option.repeatable);
                    return (
                      <div
                        key={option.id}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          picked
                            ? "border-violet-400 bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200"
                            : "border-line bg-surface text-content hover:border-violet-300"
                        } ${!unlocked ? "opacity-40" : ""}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-extrabold">
                              {option.name}
                              {pickedCount > 0 ? ` x${pickedCount}` : ""}
                            </span>
                            {option.effect && (
                              <span className="mt-1 block line-clamp-2 text-[10px] leading-relaxed text-faint">
                                {option.effect}
                              </span>
                            )}
                            {option.requiredMaterials.length > 0 && (
                              <span className="mt-1 block text-[10px] font-bold text-amber-600">
                                필요: {option.requiredMaterials.map((item) => item.name).join(", ")}
                              </span>
                            )}
                          </span>
                          {pickedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => removeOption(option.id)}
                              className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-black text-content transition hover:bg-subtle"
                            >
                              −
                            </button>
                          )}
                        </span>
                        <button
                          type="button"
                          disabled={!canAdd}
                          onClick={() => addOption(option)}
                          className="mt-2 w-full rounded-lg bg-violet-600 px-2 py-1 text-[11px] font-black text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          추가 ({Number.isFinite(nextCost) ? `${nextCost}pt` : "-"})
                        </button>
                      </div>
                    );
                  })}
                </div>
                {alchemy.recipes.length === 0 && (
                  <p className="rounded-xl bg-subtle px-3 py-4 text-center text-xs font-bold text-faint">
                    포션 탭에 등록된 공개 연금 옵션이 없어요.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-surface p-3">
                <form action={startAction} className="space-y-2">
                  {potUnits.map((name, i) => (
                    <input key={`${name}-${i}`} type="hidden" name="ingredient" value={name} />
                  ))}
                  {selectedOptionIds.map((id, i) => (
                    <input key={`${id}-${i}`} type="hidden" name="optionId" value={id} />
                  ))}
                  <div className="flex items-center gap-2">
                    <input
                      name="customName"
                      value={customName}
                      onChange={(event) => setCustomName(event.target.value)}
                      maxLength={20}
                      placeholder="조제 포션"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-content outline-none transition placeholder:font-normal placeholder:text-faint focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                    />
                    <span className="shrink-0 text-[11px] font-bold text-faint">✏️ 이름 짓기</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("materials")}
                      className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-muted transition hover:text-content"
                    >
                      재료로
                    </button>
                    <button
                      type="submit"
                      disabled={
                        startPending ||
                        pot.length === 0 ||
                        selectedOptionIds.length === 0 ||
                        selectedOptionTypeCount > ALCHEMY_OPTION_LIMIT ||
                        spentPoints > availablePoints ||
                        alchemy.ap < BREW_AP_COST
                      }
                      className="min-w-0 flex-1 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:opacity-90 disabled:opacity-40"
                    >
                      {startPending ? "조제 중…" : `⚗️ 포션 완성 (피로도 -${BREW_AP_COST})`}
                    </button>
                  </div>
                </form>
              </section>
            </>
          )}
        </div>

        <div className="border-t border-line bg-subtle px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-bold text-muted transition hover:text-content"
          >
            닫기
          </button>
        </div>
      </div>

      {pickerOpen && (
        <IngredientPicker
          title="🫧 가마에 재료 담기"
          accent="violet"
          sources={pickerSources}
          initial={Object.fromEntries(pot.map((entry) => [entry.name, entry.qty]))}
          maxTypes={maxIngredients}
          maxUnits={maxIngredients}
          onConfirm={(draft) =>
            setPot(
              Object.entries(draft)
                .filter(([, qty]) => qty > 0)
                .map(([name]) => ({ name, qty: 1 })),
            )
          }
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
