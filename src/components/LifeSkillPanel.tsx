"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { chooseLifePerk, type LifeActionState } from "@/app/actions/life";
import {
  computeMods,
  expForNext,
  lifeBagLimit,
  lifeBagWeight,
  PERK_EVERY,
  RARITY_COLORS,
  type LifeState,
  type LifeBag,
  type PerkRarity,
} from "@/lib/lifeSkillPerks";
import type { LifeSkillKind } from "@/lib/lifeSkillData";
import { formatTime } from "@/lib/format";

const KIND_EMOJI: Record<LifeSkillKind, string> = { 낚시: "🎣", 채집: "🌿", 채광: "⛏️" };

const KIND_META: { kind: LifeSkillKind; emoji: string; key: "fishing" | "plant" | "mining" }[] = [
  { kind: "낚시", emoji: "🎣", key: "fishing" },
  { kind: "채집", emoji: "🌿", key: "plant" },
  { kind: "채광", emoji: "⛏️", key: "mining" },
];

const SKILL_META: {
  kind: LifeSkillKind | "요리" | "제작" | "연금술";
  emoji: string;
  key: "fishing" | "plant" | "mining" | "cooking" | "smithing" | "alchemy";
}[] = [
  ...KIND_META,
  { kind: "요리", emoji: "🍳", key: "cooking" },
  { kind: "제작", emoji: "⚒️", key: "smithing" },
  { kind: "연금술", emoji: "⚗️", key: "alchemy" },
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
  const [openedKind, setOpenedKind] = useState<LifeSkillKind | null>(null);
  const bagWeights = useMemo(
    () =>
      Object.fromEntries(
        KIND_META.map(({ kind }) => {
          const bag = life.bags[kind];
          const mods = computeMods(life, kind);
          const max = lifeBagLimit(life, kind);
          return [kind, { weight: lifeBagWeight(bag), max, mods }];
        }),
      ) as Record<LifeSkillKind, { weight: number; max: number; mods: ReturnType<typeof computeMods> }>,
    [life],
  );

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">생활 프로필</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                  {mods.apCostDown > 0 && ` · 피로도 절약 -${mods.apCostDown}`}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {openedKind && (
        <LifeBagModal
          bag={life.bags[openedKind]}
          emoji={KIND_EMOJI[openedKind]}
          weight={`${bagWeights[openedKind].weight} / ${bagWeights[openedKind].max}`}
          onClose={() => setOpenedKind(null)}
        />
      )}
    </div>
  );
}

function CookingBuffPanel({ life }: { life: LifeState }) {
  // 만료된 행운 버프는 표시하지 않는다 — 열어둔 화면에서도 30초마다 갱신해 지운다.
  // (상태 정리는 다음 저장 때 parseLifeState가 처리)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const activeLuck =
    now == null
      ? life.cookingBuffs.lifeLuck
      : life.cookingBuffs.lifeLuck.filter((buff) => Date.parse(buff.until) > now);
  // 같은 요리에서 나온 낚시·채집 버프(출처·수치·만료 동일)는 한 줄로 합쳐 보여준다.
  const luckRows: { source: string; amount: number; until: string; kinds: string[] }[] = [];
  for (const buff of activeLuck) {
    const kinds =
      buff.kind === "all"
        ? ["낚시", "채집", "채광"]
        : buff.kind === "both"
          ? ["낚시", "채집"]
          : [buff.kind];
    const found = luckRows.find(
      (row) => row.source === buff.source && row.amount === buff.amount && row.until === buff.until,
    );
    if (found) found.kinds.push(...kinds.filter((k) => !found.kinds.includes(k)));
    else luckRows.push({ source: buff.source, amount: buff.amount, until: buff.until, kinds });
  }
  const activePotionLuck =
    now == null
      ? life.cookingBuffs.potionLifeLuck
      : life.cookingBuffs.potionLifeLuck.filter((buff) => Date.parse(buff.until) > now);
  const potionLuckRows: { source: string; amount: number; until: string; kinds: string[] }[] = [];
  for (const buff of activePotionLuck) {
    const kinds =
      buff.kind === "all"
        ? ["낚시", "채집", "채광"]
        : buff.kind === "both"
          ? ["낚시", "채집"]
          : [buff.kind];
    const found = potionLuckRows.find(
      (row) => row.source === buff.source && row.amount === buff.amount && row.until === buff.until,
    );
    if (found) found.kinds.push(...kinds.filter((k) => !found.kinds.includes(k)));
    else potionLuckRows.push({ source: buff.source, amount: buff.amount, until: buff.until, kinds });
  }
  const statBuffs =
    now == null
      ? life.cookingBuffs.stat
      : life.cookingBuffs.stat.filter((buff) => Date.parse(buff.until) > now);
  const potionStatBuffs =
    now == null
      ? life.cookingBuffs.potionStat
      : life.cookingBuffs.potionStat.filter((buff) => Date.parse(buff.until) > now);
  const sessions = life.cookingBuffs.session;
  if (
    luckRows.length === 0 &&
    potionLuckRows.length === 0 &&
    statBuffs.length === 0 &&
    potionStatBuffs.length === 0 &&
    sessions.length === 0
  )
    return null;

  const timeOf = (iso: string) => formatTime(iso);

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-extrabold text-content">🍲 요리·포션 효과</h2>
      <div className="space-y-2">
        {luckRows.map((row, i) => (
          <div key={`${row.source}-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{row.source}</p>
            <p className="mt-0.5 text-xs font-bold text-emerald-600">
              {row.kinds.join("·")} 행운 +{row.amount} · {timeOf(row.until)}까지
            </p>
          </div>
        ))}
        {statBuffs.map((buff, i) => (
          <div key={`${buff.source}-stat-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{buff.source}</p>
            <p className="mt-0.5 text-xs font-bold text-sky-600">
              {buff.label === "모든" ? "모든 능력" : buff.label} 판정 +{buff.amount} ·{" "}
              {timeOf(buff.until)}까지
            </p>
          </div>
        ))}
        {potionLuckRows.map((row, i) => (
          <div key={`${row.source}-potion-luck-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{row.source}</p>
            <p className="mt-0.5 text-xs font-bold text-violet-600">
              포션: {row.kinds.join("·")} 행운 +{row.amount} · {timeOf(row.until)}까지
            </p>
          </div>
        ))}
        {potionStatBuffs.map((buff, i) => (
          <div key={`${buff.source}-potion-stat-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{buff.source}</p>
            <p className="mt-0.5 text-xs font-bold text-violet-600">
              포션: {buff.label === "모든" ? "모든 능력" : buff.label} +{buff.amount} ·{" "}
              {timeOf(buff.until)}까지
            </p>
          </div>
        ))}
        {sessions.map((buff, i) => (
          <div key={`${buff.source}-${buff.usedAt}-${i}`} className="rounded-2xl bg-subtle px-4 py-3">
            <p className="text-sm font-extrabold text-content">{buff.source}</p>
            <p className="mt-0.5 text-xs font-bold text-brand-600">
              세션 버프: {buff.effect}
              <span className="ml-1 font-semibold text-faint">— {timeOf(buff.usedAt)} 사용</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LifeSkillPanel({
  life,
  isOwn,
  canViewProfile = true,
  canViewSkills = true,
}: {
  life: LifeState;
  isOwn: boolean;
  canViewProfile?: boolean;
  canViewSkills?: boolean;
}) {
  const [state, formAction, pending] = useActionState<LifeActionState, FormData>(
    chooseLifePerk,
    undefined,
  );

  const choice = life.pending[0];
  const [view, setView] = useState<"profile" | "skill">("profile");
  const [perkKind, setPerkKind] = useState<LifeSkillKind>("낚시");
  const kindPerks = life.perks.filter((p) => p.kind === perkKind);

  // 레벨/숙련도 카드
  const levelCard = (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">생활 스킬</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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

  // 특성 선택(본인·대기 중) + 보유 특성
  const skillSection = (
    <div className="space-y-5">
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

      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-content">보유 특성</h2>
          <div className="flex gap-1.5">
            {KIND_META.map(({ kind, emoji }) => {
              const active = perkKind === kind;
              const n = life.perks.filter((p) => p.kind === kind).length;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setPerkKind(kind)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-subtle text-muted hover:text-content"
                  }`}
                >
                  {emoji} {kind} {n > 0 && <span className="opacity-80">{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {kindPerks.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">
            {perkKind} 특성이 아직 없어요. 특성은 Lv4부터 {PERK_EVERY}레벨마다 선택할 수 있어요!
          </p>
        ) : (
          <ul className="space-y-2">
            {kindPerks.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 rounded-xl bg-subtle/60 px-3.5 py-2.5">
                <span className="mt-0.5 shrink-0 text-sm">{KIND_EMOJI[p.kind] ?? "✨"}</span>
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

  const TABS: { key: "profile" | "skill"; label: string; badge?: number }[] = [
    { key: "profile", label: "🧺 프로필" },
    { key: "skill", label: "✨ 스킬", badge: isOwn ? life.pending.length : 0 },
  ];

  const privateNotice = (
    <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
      <p className="text-sm font-bold text-muted">비공개 상태입니다.</p>
    </div>
  );

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

      {view === "profile" && canViewProfile && (
        <div className="space-y-5">
          {levelCard}
          <CookingBuffPanel life={life} />
          <LifeGearPanel life={life} />
        </div>
      )}
      {view === "profile" && !canViewProfile && privateNotice}
      {view === "skill" && canViewSkills && skillSection}
      {view === "skill" && !canViewSkills && privateNotice}
    </div>
  );
}
