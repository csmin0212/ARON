"use client";

import { useActionState, useMemo, useState } from "react";
import { chooseLifePerk, type LifeActionState } from "@/app/actions/life";
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
import { collectionItems, lifeSkillMarketPrice } from "@/lib/lifeSkillData";
import CollectionRankBook, { type CollectionBookEntry } from "@/components/CollectionRankBook";

function CollectionBook({ life }: { life: LifeState }) {
  const all = collectionItems(false); // 바다 어종은 아직 도감에 미포함 (상위 층 해금 예정)
  const entries: CollectionBookEntry[] = all.map(({ kind, item }) => ({
    kind,
    name: item.name,
    rank: item.rank,
    rarity: item.rarity,
    price: lifeSkillMarketPrice(kind, item),
    weight: item.weight,
    text: item.text,
    discovered: life.collection[kind].includes(item.name),
    count: life.catchCounts[kind][item.name] ?? 0,
  }));

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

function RarityBadge({ rarity }: { rarity: PerkRarity }) {
  return (
    <span className={`rounded bg-subtle px-1.5 py-0.5 text-[11px] font-bold ${RARITY_COLORS[rarity]}`}>
      {rarity}
    </span>
  );
}

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

export default function LifeSkillPanel({
  life,
  isOwn,
}: {
  life: LifeState;
  isOwn: boolean;
}) {
  const [state, formAction, pending] = useActionState<LifeActionState, FormData>(
    chooseLifePerk,
    undefined,
  );

  const choice = life.pending[0];

  return (
    <div className="space-y-5">
      {/* 레벨/경험치 */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-extrabold text-content">생활 스킬</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {KIND_META.map(({ kind, emoji, key }) => {
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

      <LifeGearPanel life={life} />

      {/* 레벨업 특성 선택 (본인만) */}
      {isOwn && choice && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/60 p-6 shadow-sm">
          <h2 className="text-lg font-extrabold text-content">
            🆙 {choice.kind} Lv.{choice.level} 달성 — 특성을 선택하세요!
          </h2>
          <p className="mb-4 mt-1 text-xs text-muted">
            {life.pending.length > 1 && `대기 중인 선택 ${life.pending.length}개 · `}
            하나를 고르면 즉시 적용돼요.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {choice.options.map((opt, i) => (
              <form key={i} action={formAction}>
                <input type="hidden" name="option" value={i} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-full w-full flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-md disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <RarityBadge rarity={opt.rarity} />
                    <span className="text-sm font-extrabold text-content">{opt.name}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{opt.text}</p>
                </button>
              </form>
            ))}
          </div>
          {state?.error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
              ✨ {state.ok}
            </p>
          )}
        </div>
      )}

      {/* 도감 */}
      <CollectionBook life={life} />

      {/* 보유 특성 */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-extrabold text-content">보유 특성</h2>
        {life.perks.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">
            아직 익힌 특성이 없어요. 특성은 5레벨마다 선택할 수 있어요!
          </p>
        ) : (
          <ul className="space-y-2">
            {life.perks.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-xl bg-subtle/60 px-3.5 py-2.5">
                <span className="mt-0.5 shrink-0 text-sm">{p.kind === "낚시" ? "🎣" : "🌿"}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-content">{p.name}</span>
                    <RarityBadge rarity={p.rarity} />
                  </div>
                  <p className="text-xs text-muted">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
