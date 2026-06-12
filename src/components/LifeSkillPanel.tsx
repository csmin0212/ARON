"use client";

import { useActionState } from "react";
import { chooseLifePerk, type LifeActionState } from "@/app/actions/life";
import {
  expForNext,
  RARITY_COLORS,
  type LifeState,
  type PerkRarity,
} from "@/lib/lifeSkillPerks";
import { collectionItems, type LifeSkillKind } from "@/lib/lifeSkillData";

// 등급별 칩 색 (0성~5성)
const RANK_TONE = [
  "text-faint",
  "text-content",
  "text-emerald-600",
  "text-sky-600",
  "text-violet-600",
  "text-amber-500",
];

function CollectionBook({ life }: { life: LifeState }) {
  const all = collectionItems(false); // 바다 어종은 아직 도감에 미포함 (상위 층 해금 예정)
  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-extrabold text-content">📖 도감</h2>
      <p className="mb-4 text-xs text-faint">한 번이라도 획득하면 등록돼요.</p>
      <div className="space-y-3">
        {(["낚시", "채집"] as LifeSkillKind[]).map((kind) => {
          const items = all
            .filter((e) => e.kind === kind)
            .map((e) => e.item)
            .sort((a, b) => a.rank - b.rank || a.no - b.no);
          const caught = new Set(life.collection[kind]);
          const count = items.filter((it) => caught.has(it.name)).length;
          const pct = items.length > 0 ? Math.round((count / items.length) * 100) : 0;
          return (
            <details key={kind} className="group rounded-2xl border border-line bg-subtle/40">
              <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 transition hover:bg-subtle">
                <span className="text-sm font-extrabold text-content">
                  {kind === "낚시" ? "🎣" : "🌿"} {kind} 도감
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-brand-600">
                    {count} / {items.length}
                  </span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">
                    {pct}%
                  </span>
                  <span className="text-faint2 transition group-open:rotate-180">▾</span>
                </span>
              </summary>
              <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                {items.map((it) => {
                  const got = caught.has(it.name);
                  return (
                    <span
                      key={`${it.rank}-${it.no}`}
                      title={got ? `${it.rarity} · ${it.text}` : `${it.rarity} · 미발견`}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                        got
                          ? `border-line bg-surface ${RANK_TONE[it.rank] ?? "text-content"}`
                          : "border-dashed border-line bg-transparent text-faint2"
                      }`}
                    >
                      {got ? it.name : "???"}
                    </span>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
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
