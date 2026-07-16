"use client";

// 연금술 공방 — 집 가구(연금술 공방)로 해금되는 타이머 제조 시설.
// 가마 탭: 요리처럼 재료를 칸에 넣고 시간을 정해 실험 (조합의 수수께끼가 아니라 '시간'의 수수께끼).
// 레시피 탭: 완벽 제조로 최적 시간을 익힌 포션을 그 시간으로 바로 가마에 올린다.

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import {
  cancelBrew,
  collectBrew,
  sellPotion,
  startBrew,
  type AlchemyState,
} from "@/app/actions/services";
import {
  BREW_AP_COST,
  BREW_MAX_MINUTES,
  BREW_MIN_MINUTES,
  parsePotionName,
} from "@/lib/alchemy";
import type { SheetInventoryItem } from "@/lib/googleSheets";

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

export type AlchemyView = {
  enabled: boolean;
  labName: string;
  labEmoji: string;
  labTier: number;
  tolerance: number; // 공방 확장 보너스 — 완벽 판정 ±N분
  ap: number;
  gold: number;
  level: number;
  masterCount: number;
  recipeCount: number;
  recipes: AlchemyRecipeView[];
  brewing: AlchemyBrewingView | null;
  potions: AlchemyPotionView[];
};

type LifeItemLike = { name: string; qty: number };
type PotEntry = { name: string; qty: number };

const POT_TYPE_MAX = 5; // 재료 종류 칸 수 — 모든 레시피가 5종 이하

const RANK_STYLE: Record<string, { chip: string; ring: string; label: string }> = {
  R1: { chip: "bg-emerald-50 text-emerald-600", ring: "border-emerald-200", label: "★☆☆" },
  R2: { chip: "bg-sky-50 text-sky-600", ring: "border-sky-200", label: "★★☆" },
  R3: { chip: "bg-violet-50 text-violet-600", ring: "border-violet-200", label: "★★★" },
};

function rankStyle(rank: string) {
  return RANK_STYLE[rank] ?? RANK_STYLE.R1;
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

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 서버 ingredientKey 와 동일한 정규화 — 조합 일치 미리보기용
function potKey(entries: PotEntry[]): string {
  return entries
    .filter((entry) => entry.qty > 0)
    .map((entry) => ({ name: entry.name.trim(), qty: entry.qty }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"))
    .map((entry) => `${entry.name}x${entry.qty}`)
    .join("|");
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
  onClose,
}: {
  alchemy: AlchemyView;
  inventoryItems: SheetInventoryItem[];
  lifeItems: LifeItemLike[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"brew" | "book" | "sell">("brew");
  const [pot, setPot] = useState<PotEntry[]>([]);
  const [minutes, setMinutes] = useState(7);
  const [now, setNow] = useState(() => Date.now());

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
  const [sellState, sellAction, sellPending] = useActionState<AlchemyState, FormData>(
    sellPotion,
    undefined,
  );

  // 1초 시계 — 끓는 동안 카운트다운
  useEffect(() => {
    if (!alchemy.brewing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [alchemy.brewing]);

  // 재료 보유량 — 시트 가방(등급 붙은 포션도 기본 이름으로 인정) + 생활 가방
  const haveOf = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (name: string, qty: number) => {
      if (qty <= 0) return;
      counts.set(name, (counts.get(name) ?? 0) + qty);
    };
    for (const item of inventoryItems) {
      const raw = item.name.trim();
      add(raw, item.qty);
      const { base } = parsePotionName(raw);
      if (base !== raw) add(base, item.qty);
    }
    for (const item of lifeItems) add(item.name.trim(), item.qty);
    return (name: string) => counts.get(name.trim()) ?? 0;
  }, [inventoryItems, lifeItems]);

  // 재료 서랍 — 레시피에 등장하는 재료만 후보로
  const drawerNames = useMemo(() => {
    const names = new Set<string>();
    for (const recipe of alchemy.recipes) {
      for (const ingredient of recipe.ingredientList) names.add(ingredient.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, "ko"));
  }, [alchemy.recipes]);

  const potQtyOf = (name: string) => pot.find((entry) => entry.name === name)?.qty ?? 0;
  const addToPot = (name: string) => {
    setPot((prev) => {
      const existing = prev.find((entry) => entry.name === name);
      if (existing) {
        if (existing.qty >= haveOf(name)) return prev;
        return prev.map((entry) =>
          entry.name === name ? { ...entry, qty: entry.qty + 1 } : entry,
        );
      }
      if (prev.length >= POT_TYPE_MAX || haveOf(name) <= 0) return prev;
      return [...prev, { name, qty: 1 }];
    });
  };
  const takeFromPot = (name: string) => {
    setPot((prev) =>
      prev
        .map((entry) => (entry.name === name ? { ...entry, qty: entry.qty - 1 } : entry))
        .filter((entry) => entry.qty > 0),
    );
  };

  // 현재 조합과 일치하는 레시피 미리보기
  const matched = useMemo(() => {
    if (pot.length === 0) return null;
    const key = potKey(pot);
    return alchemy.recipes.find((recipe) => potKey(recipe.ingredientList) === key) ?? null;
  }, [pot, alchemy.recipes]);

  const canAfford = (recipe: AlchemyRecipeView) =>
    recipe.ingredientList.every((ingredient) => haveOf(ingredient.name) >= ingredient.qty);

  const masteredRecipes = useMemo(
    () => alchemy.recipes.filter((recipe) => recipe.mastered && recipe.bestMinutes != null),
    [alchemy.recipes],
  );

  const potUnits = pot.flatMap((entry) => Array.from({ length: entry.qty }, () => entry.name));
  const potSlots = Array.from({ length: POT_TYPE_MAX }, (_, i) => pot[i] ?? null);

  const brewing = alchemy.brewing;
  const remainMs = brewing ? brewing.readyAt - now : 0;
  const ready = brewing ? remainMs <= 0 : false;
  const totalMs = brewing ? Math.max(1, brewing.readyAt - brewing.startedAt) : 1;
  const progress = brewing ? Math.min(100, Math.max(0, ((totalMs - remainMs) / totalMs) * 100)) : 0;

  const TABS = [
    { key: "brew" as const, label: "🔥 실험 가마" },
    { key: "book" as const, label: `📖 확정 레시피 (${masteredRecipes.length})` },
    { key: "sell" as const, label: `💰 판매 (${alchemy.potions.length})` },
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
              🧫 연금술 Lv.{alchemy.level} · 장인 {alchemy.masterCount}/{alchemy.recipeCount}
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">
              🎯 완벽 판정 ±{alchemy.tolerance}분
            </span>
            <span className="rounded-full bg-white/15 px-2.5 py-1">
              ⚡ {alchemy.ap} · 제조 -{BREW_AP_COST}
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-t-xl px-4 py-2 text-sm font-extrabold transition ${
                  tab === t.key
                    ? "bg-surface text-content shadow-sm"
                    : "text-violet-100 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-3">
          <StateLine state={startState} />
          <StateLine state={collectState} />
          <StateLine state={cancelState} />
          <StateLine state={sellState} />

          {/* ── 가마: 끓는 중 ── */}
          {tab === "brew" && brewing && (
            <section className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50 to-fuchsia-50 p-5 text-center dark:from-violet-950/40 dark:to-fuchsia-950/30">
              <Cauldron boiling={!ready} />
              <p className="mt-2 text-lg font-extrabold text-content">
                {ready ? "✨ 완성! 가마를 열어보세요" : `${brewing.recipeName} 끓는 중…`}
              </p>
              <p className="mt-1 text-xs font-bold text-muted">설정한 시간 {brewing.minutes}분</p>
              <p
                className={`mt-3 font-mono text-4xl font-black tabular-nums ${
                  ready ? "text-emerald-500" : "text-violet-600 dark:text-violet-300"
                }`}
              >
                {ready ? "00:00" : formatClock(remainMs)}
              </p>
              <div className="mx-auto mt-3 h-2.5 max-w-sm overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-4 flex items-center justify-center gap-2">
                <form action={collectAction}>
                  <button
                    type="submit"
                    disabled={!ready || collectPending}
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
              {!ready && (
                <p className="mt-3 text-[11px] text-faint">
                  기다리는 동안 다른 일을 해도 좋아요. 시간이 되면 돌아와서 가마를 열면 됩니다.
                </p>
              )}
            </section>
          )}

          {/* ── 가마: 조합 + 시간 (한 화면) ── */}
          {tab === "brew" && !brewing && (
            <>
              <section className="rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-50/60 to-transparent p-3 dark:from-violet-950/30">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-extrabold text-faint">
                    🫧 가마 ({pot.length}/{POT_TYPE_MAX}종)
                  </p>
                  {pot.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPot([])}
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
                        <span className="text-xs font-black text-violet-500">x{entry.qty}</span>
                      </button>
                    ) : (
                      <div
                        key={`empty-${i}`}
                        className="grid place-items-center rounded-xl border border-dashed border-line py-2 text-lg text-faint2"
                      >
                        +
                      </div>
                    ),
                  )}
                </div>
                <p
                  className={`mt-2 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                    matched
                      ? "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"
                      : "bg-subtle text-faint"
                  }`}
                >
                  {matched
                    ? `🧪 이 조합: ${matched.name} (판매가 ${matched.sellPrice.toLocaleString()}G)`
                    : pot.length > 0
                      ? "아직 아무것도 떠오르지 않는 조합…"
                      : "아래 서랍에서 재료를 눌러 가마에 넣어보세요."}
                </p>
              </section>

              <section>
                <p className="mb-1.5 text-xs font-extrabold text-faint">🗄️ 재료 서랍</p>
                <div className="flex max-h-24 flex-wrap content-start gap-1.5 overflow-y-auto rounded-2xl border border-line bg-subtle p-2">
                  {drawerNames.map((name) => {
                    const have = haveOf(name);
                    const used = potQtyOf(name);
                    const disabled =
                      have <= used || (used === 0 && pot.length >= POT_TYPE_MAX);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => addToPot(name)}
                        disabled={disabled}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                          have <= 0
                            ? "bg-surface text-faint2"
                            : used > 0
                              ? "bg-violet-100 text-violet-600 hover:bg-violet-200 dark:bg-violet-950/50 dark:text-violet-300"
                              : "bg-surface text-content hover:bg-violet-50"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {name} {used > 0 ? `${used}/` : ""}
                        {have}
                      </button>
                    );
                  })}
                  {drawerNames.length === 0 && (
                    <p className="px-1 py-2 text-[11px] font-bold text-faint">
                      포션 레시피가 아직 동기화되지 않았어요.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMinutes((m) => Math.max(BREW_MIN_MINUTES, m - 1))}
                    className="h-9 w-9 shrink-0 rounded-full border border-line bg-subtle text-lg font-black text-content transition hover:bg-surface"
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={BREW_MIN_MINUTES}
                    max={BREW_MAX_MINUTES}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                    className="min-w-0 flex-1 accent-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setMinutes((m) => Math.min(BREW_MAX_MINUTES, m + 1))}
                    className="h-9 w-9 shrink-0 rounded-full border border-line bg-subtle text-lg font-black text-content transition hover:bg-surface"
                  >
                    +
                  </button>
                  <p className="w-16 shrink-0 text-right font-mono text-2xl font-black tabular-nums text-violet-600 dark:text-violet-300">
                    {minutes}
                    <span className="text-sm text-faint">분</span>
                  </p>
                </div>
                <form action={startAction} className="mt-2.5">
                  {potUnits.map((name, i) => (
                    <input key={`${name}-${i}`} type="hidden" name="ingredient" value={name} />
                  ))}
                  <input type="hidden" name="minutes" value={minutes} />
                  <button
                    type="submit"
                    disabled={startPending || pot.length === 0 || alchemy.ap < BREW_AP_COST}
                    className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:opacity-90 disabled:opacity-40"
                  >
                    {startPending
                      ? "가마에 올리는 중…"
                      : `🔥 ${minutes}분 동안 달이기 (피로도 -${BREW_AP_COST})`}
                  </button>
                </form>
                <p className="mt-1.5 text-center text-[10px] text-faint">
                  재료마다 <b>최적의 시간</b>이 있어요 — 정확히 맞추면{" "}
                  <b className="text-violet-500">완벽한</b>, 크게 벗어나면{" "}
                  <b className="text-red-400">약한</b> 포션이 됩니다.
                </p>
              </section>
            </>
          )}

          {/* ── 레시피 — 익힌 최적 시간으로 바로 달이기 ── */}
          {tab === "book" && (
            <div className="space-y-2">
              {masteredRecipes.map((recipe) => {
                const style = rankStyle(recipe.rank);
                const affordable = canAfford(recipe);
                return (
                  <div key={recipe.id} className={`rounded-2xl border ${style.ring} bg-subtle p-3.5`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-extrabold text-content">
                        🧪 {recipe.name}
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-black ${style.chip}`}
                        >
                          {recipe.rank} {style.label}
                        </span>
                      </p>
                      <span className="shrink-0 text-xs font-black text-amber-600">
                        {recipe.sellPrice.toLocaleString()}G
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] font-bold text-muted">
                      재료: {recipe.ingredients}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-faint">
                      숙련: {recipe.masteryRank} · {recipe.masteryExp}
                      {recipe.nextMastery ? `/${recipe.nextMastery}` : ""}
                    </p>
                    {recipe.effect && (
                      <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-faint">
                        {recipe.effect}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {recipe.perfectEffect && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                          ✨완벽 — {recipe.perfectEffect}
                        </span>
                      )}
                      {recipe.masteryRank !== "기본" && recipe.adeptPerfectEffect && (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">
                          고급 — {recipe.adeptPerfectEffect}
                        </span>
                      )}
                      {recipe.masteryRank === "장인" && recipe.masterPerfectEffect && (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                          명품 — {recipe.masterPerfectEffect}
                        </span>
                      )}
                      <form action={startAction} className="ml-auto">
                        <input type="hidden" name="recipeId" value={recipe.id} />
                        <button
                          type="submit"
                          disabled={
                            startPending ||
                            !affordable ||
                            !!alchemy.brewing ||
                            alchemy.ap < BREW_AP_COST
                          }
                          className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
                        >
                          ⏱ {recipe.bestMinutes}분 · 바로 달이기
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
              {masteredRecipes.length === 0 && (
                <p className="rounded-xl bg-subtle px-3 py-6 text-center text-xs font-bold text-faint">
                  아직 최적 시간을 익힌 포션이 없어요. 실험 가마에서 완벽 제조를 해보세요.
                </p>
              )}
            </div>
          )}

          {/* ── 판매 ── */}
          {tab === "sell" && (
            <div className="space-y-2">
              {alchemy.potions.map((potion) => (
                <div
                  key={potion.name}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-subtle px-3.5 py-3"
                >
                  <span className="text-xl">⚗️</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-content">
                      {potion.name}{" "}
                      <span className="text-xs font-bold text-faint">x{potion.qty}</span>
                    </p>
                    <p className="text-[11px] font-bold text-amber-600">
                      개당 {potion.unitPrice.toLocaleString()}G
                    </p>
                  </div>
                  <form action={sellAction}>
                    <input type="hidden" name="itemName" value={potion.name} />
                    <input type="hidden" name="qty" value={1} />
                    <button
                      type="submit"
                      disabled={sellPending}
                      className="rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-extrabold text-content transition hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                    >
                      1개 판매
                    </button>
                  </form>
                  {potion.qty > 1 && (
                    <form action={sellAction}>
                      <input type="hidden" name="itemName" value={potion.name} />
                      <input type="hidden" name="qty" value={potion.qty} />
                      <button
                        type="submit"
                        disabled={sellPending}
                        className="rounded-xl bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-40"
                      >
                        전부
                      </button>
                    </form>
                  )}
                </div>
              ))}
              {alchemy.potions.length === 0 && (
                <p className="rounded-xl bg-subtle px-3 py-6 text-center text-xs font-bold text-faint">
                  팔 수 있는 포션이 가방에 없어요. 가마에서 만들어보자!
                </p>
              )}
            </div>
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
    </div>
  );
}
