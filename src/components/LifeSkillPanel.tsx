"use client";

import { useActionState, useMemo, useState } from "react";
import { allocateLifeNode, resetLifeTree, type LifeActionState } from "@/app/actions/life";
import {
  computeMods,
  expForNext,
  lifeBagLimit,
  lifeBagWeight,
  RARITY_COLORS,
  type LifeState,
  type LifeBag,
  type PerkRarity,
} from "@/lib/lifeSkillPerks";

export type LifeTreeNodeView = {
  id: string;
  job: "낚시" | "채집" | "요리";
  name: string;
  rarity: string | null;
  cost: number;
  prereq: string[];
  row: number;
  col: number;
  description: string | null;
};
import { collectionItems, lifeSkillMarketPrice } from "@/lib/lifeSkillData";
import CollectionRankBook, { type CollectionBookEntry } from "@/components/CollectionRankBook";

function CollectionBook({
  life,
  cookingRecipes,
}: {
  life: LifeState;
  cookingRecipes: CollectionBookEntry[];
}) {
  const all = collectionItems(false); // 바다 어종은 아직 도감에 미포함 (상위 층 해금 예정)
  const entries: CollectionBookEntry[] = [
    ...all.map(({ kind, item }) => ({
      kind,
      name: item.name,
      rank: item.rank,
      rarity: item.rarity,
      price: lifeSkillMarketPrice(kind, item),
      weight: item.weight,
      text: item.text,
      discovered: life.collection[kind].includes(item.name),
      count: life.catchCounts[kind][item.name] ?? 0,
    })),
    ...cookingRecipes,
  ];

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-extrabold text-content">📖 도감</h2>
      <p className="mb-4 text-xs text-faint">한 번이라도 획득하면 등록돼요.</p>
      <CollectionRankBook entries={entries} />
    </div>
  );
}

const KIND_META: { kind: "낚시" | "채집"; emoji: string; key: "fishing" | "plant" }[] = [
  { kind: "낚시", emoji: "🎣", key: "fishing" },
  { kind: "채집", emoji: "🌿", key: "plant" },
];

const SKILL_META: { kind: "낚시" | "채집" | "요리"; emoji: string; key: "fishing" | "plant" | "cooking" }[] = [
  ...KIND_META,
  { kind: "요리", emoji: "🍳", key: "cooking" },
];

function LifeBagModal({
  bag,
  emoji,
  weight,
  onClose,
}: {
  bag: LifeBag;
  emoji: string;
  weight: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${bag.name} 내용물`}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-faint">Life Bag</p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-xl font-extrabold text-content">
            <span>
              {emoji} {bag.name}
            </span>
            <span className="text-sm font-bold text-muted">{weight}</span>
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {bag.items.length === 0 ? (
            <p className="rounded-2xl bg-subtle px-4 py-8 text-center text-sm text-faint">
              아직 비어 있어요.
            </p>
          ) : (
            <ul className="space-y-2">
              {bag.items.map((item) => (
                <li key={item.name} className="rounded-2xl bg-subtle px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-content">{item.name}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">
                        R{item.rank} · {item.text}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs font-bold text-muted">
                      <p>중량 {item.weight}</p>
                      <p className="text-brand-600">x{item.qty}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
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

function LifeGearPanel({ life }: { life: LifeState }) {
  const [openedKind, setOpenedKind] = useState<"낚시" | "채집" | null>(null);
  const bagWeights = useMemo(
    () =>
      Object.fromEntries(
        KIND_META.map(({ kind }) => {
          const bag = life.bags[kind];
          const mods = computeMods(life, kind);
          const max = lifeBagLimit(life, kind, mods.weightBonus);
          return [kind, { weight: lifeBagWeight(bag), max, mods }];
        }),
      ) as Record<"낚시" | "채집", { weight: number; max: number; mods: ReturnType<typeof computeMods> }>,
    [life],
  );

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">생활 프로필</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {KIND_META.map(({ kind, emoji }) => {
          const bag = life.bags[kind];
          const { weight, max, mods } = bagWeights[kind];
          const pct = Math.min(100, Math.round((weight / max) * 100));
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setOpenedKind(kind)}
              className="rounded-2xl border border-line bg-subtle/45 p-4 text-left transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-content">
                    {emoji} {kind}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-faint">
                    {life.tools[kind]}
                  </p>
                </div>
                <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-black text-brand-600">
                  기본
                </span>
              </div>
              <div className="rounded-2xl bg-surface p-3">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-muted">{bag.name}</span>
                  <span className="font-extrabold text-content">
                    {weight} / {max}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-subtle-hover">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-faint">
                  보관 중 {bag.items.reduce((sum, item) => sum + item.qty, 0)}개
                  {mods.weightBonus > 0 && ` · 특성 보너스 +${mods.weightBonus}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {openedKind && (
        <LifeBagModal
          bag={life.bags[openedKind]}
          emoji={openedKind === "낚시" ? "🎣" : "🌿"}
          weight={`${bagWeights[openedKind].weight} / ${bagWeights[openedKind].max}`}
          onClose={() => setOpenedKind(null)}
        />
      )}
    </div>
  );
}

function CookingBuffPanel({ life }: { life: LifeState }) {
  const activeLuck = life.cookingBuffs.lifeLuck;
  const sessions = life.cookingBuffs.session;
  if (activeLuck.length === 0 && sessions.length === 0) return null;

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold text-content">🍲 요리 효과</h2>
      <div className="space-y-2">
        {activeLuck.map((buff, i) => {
          const until = new Date(buff.until).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div key={`${buff.source}-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
              <p className="text-sm font-extrabold text-content">{buff.source}</p>
              <p className="mt-0.5 text-xs font-bold text-emerald-600">
                {buff.kind === "both" ? "낚시·채집" : buff.kind} 행운 +{buff.amount} · {until}까지
              </p>
            </div>
          );
        })}
        {sessions.map((buff, i) => (
          <div key={`${buff.source}-${buff.usedAt}-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{buff.source}</p>
            <p className="mt-0.5 text-xs font-bold text-brand-600">세션 버프: {buff.effect}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const JOB_META: { job: "낚시" | "채집" | "요리"; emoji: string; key: "fishing" | "plant" | "cooking" }[] = [
  { job: "낚시", emoji: "🎣", key: "fishing" },
  { job: "채집", emoji: "🌿", key: "plant" },
  { job: "요리", emoji: "🍳", key: "cooking" },
];

// 생활스킬 트리 — 레벨당 1포인트로 노드를 해금(직군별)
function SkillTreePanel({
  life,
  nodes,
  isOwn,
}: {
  life: LifeState;
  nodes: LifeTreeNodeView[];
  isOwn: boolean;
}) {
  const [job, setJob] = useState<"낚시" | "채집" | "요리">("낚시");
  const [allocState, allocAction, allocPending] = useActionState<LifeActionState, FormData>(
    allocateLifeNode,
    undefined,
  );
  const [resetState, resetAction, resetPending] = useActionState<LifeActionState, FormData>(
    resetLifeTree,
    undefined,
  );

  const owned = useMemo(() => new Set(life.treeNodes), [life.treeNodes]);
  const jobNodes = useMemo(() => nodes.filter((n) => n.job === job), [nodes, job]);

  const meta = JOB_META.find((m) => m.job === job)!;
  const level = life[meta.key].level;
  const spent = jobNodes.filter((n) => owned.has(n.id)).reduce((s, n) => s + n.cost, 0);
  const available = level - spent;
  const maxRow = Math.max(1, ...jobNodes.map((n) => n.row));
  const maxCol = Math.max(1, ...jobNodes.map((n) => n.col));

  const canUnlock = (n: LifeTreeNodeView) =>
    isOwn &&
    !owned.has(n.id) &&
    (n.prereq.length === 0 || n.prereq.some((p) => owned.has(p))) &&
    available >= n.cost;

  const msg = allocState?.error ?? resetState?.error ?? allocState?.ok ?? resetState?.ok;
  const msgError = !!(allocState?.error ?? resetState?.error);

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {JOB_META.map((m) => (
            <button
              key={m.job}
              type="button"
              onClick={() => setJob(m.job)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                job === m.job ? "bg-brand-500 text-white shadow-sm" : "bg-subtle text-muted hover:text-content"
              }`}
            >
              {m.emoji} {m.job}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-700">
          남은 포인트 {Math.max(0, available)}
        </span>
      </div>

      {msg && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-xs font-semibold ${
            msgError ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {msg}
        </p>
      )}

      {jobNodes.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">
          아직 트리가 없어요. GM이 ‘생활트리’ 탭을 동기화하면 나타나요.
        </p>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${maxCol}, minmax(76px, 1fr))`,
              gridTemplateRows: `repeat(${maxRow}, auto)`,
            }}
          >
            {jobNodes.map((n) => {
              const isOwned = owned.has(n.id);
              const unlockable = canUnlock(n);
              const cell = (
                <div
                  className={`flex h-full flex-col gap-0.5 rounded-2xl border p-2 text-center transition ${
                    isOwned
                      ? "border-brand-400 bg-brand-50"
                      : unlockable
                        ? "border-amber-300 bg-amber-50/50 hover:border-amber-400"
                        : "border-line bg-subtle/40 opacity-60"
                  }`}
                >
                  <span
                    className={`truncate text-[11px] font-bold ${RARITY_COLORS[(n.rarity as PerkRarity) || "일반"]}`}
                  >
                    {n.name}
                  </span>
                  <span className="text-[10px] font-semibold text-faint">
                    {isOwned ? "보유" : `${n.cost}P`}
                  </span>
                </div>
              );
              return (
                <div
                  key={n.id}
                  style={{ gridColumn: n.col, gridRow: n.row }}
                  title={n.description ?? n.name}
                >
                  {unlockable ? (
                    <form action={allocAction}>
                      <input type="hidden" name="nodeId" value={n.id} />
                      <button type="submit" disabled={allocPending} className="block w-full disabled:opacity-50">
                        {cell}
                      </button>
                    </form>
                  ) : (
                    cell
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isOwn && (
        <form action={resetAction} className="mt-3 text-right">
          <input type="hidden" name="job" value={job} />
          <button
            type="submit"
            disabled={resetPending}
            className="text-[11px] font-semibold text-faint transition hover:text-rose-500"
          >
            {job} 특성 초기화(리스펙)
          </button>
        </form>
      )}
    </div>
  );
}

export default function LifeSkillPanel({
  life,
  isOwn,
  cookingRecipes = [],
  treeNodes = [],
}: {
  life: LifeState;
  isOwn: boolean;
  cookingRecipes?: CollectionBookEntry[];
  treeNodes?: LifeTreeNodeView[];
}) {
  const [view, setView] = useState<"profile" | "book" | "skill">("profile");

  const ownedSet = useMemo(() => new Set(life.treeNodes), [life.treeNodes]);
  const availablePoints = useMemo(() => {
    const byJob: Record<string, { level: number; spent: number }> = {
      낚시: { level: life.fishing.level, spent: 0 },
      채집: { level: life.plant.level, spent: 0 },
      요리: { level: life.cooking.level, spent: 0 },
    };
    for (const n of treeNodes) if (ownedSet.has(n.id) && byJob[n.job]) byJob[n.job].spent += n.cost;
    return Object.values(byJob).reduce((s, j) => s + Math.max(0, j.level - j.spent), 0);
  }, [treeNodes, ownedSet, life.fishing.level, life.plant.level, life.cooking.level]);

  // 레벨/숙련도 카드
  const levelCard = (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">생활 스킬</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SKILL_META.map(({ kind, emoji, key }) => {
          const prog = life[key];
          const need = expForNext(prog.level);
          const pct = Math.min(100, Math.round((prog.exp / need) * 100));
          return (
            <div key={kind} className="rounded-2xl border border-line bg-subtle/50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-extrabold text-content">
                  {emoji} {kind}
                </span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm font-extrabold text-brand-600">
                  Lv.{prog.level}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-subtle-hover">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-right text-[11px] font-semibold text-faint">
                숙련도 {prog.exp} / {need}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  const TABS: { key: "profile" | "book" | "skill"; label: string; badge?: number }[] = [
    { key: "profile", label: "🧺 프로필" },
    { key: "book", label: "📖 도감" },
    { key: "skill", label: "🌳 트리", badge: isOwn ? availablePoints : 0 },
  ];

  return (
    <div className="space-y-5">
      {/* 서브 토글 버튼 */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = view === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setView(t.key)}
              className={`relative rounded-full px-4 py-2 text-sm font-bold transition ${
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "bg-surface text-muted ring-1 ring-line hover:bg-subtle hover:text-content"
              }`}
            >
              {t.label}
              {!!t.badge && t.badge > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-white">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {view === "profile" && (
        <div className="space-y-5">
          {levelCard}
          <CookingBuffPanel life={life} />
          <LifeGearPanel life={life} />
        </div>
      )}
      {view === "book" && (
        <CollectionBook life={life} cookingRecipes={cookingRecipes} />
      )}
      {view === "skill" && <SkillTreePanel life={life} nodes={treeNodes} isOwn={isOwn} />}
    </div>
  );
}
