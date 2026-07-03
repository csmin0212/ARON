"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { craftEquipment, type CraftResult } from "@/app/actions/craft";
import {
  computeCraft,
  CRAFT_CATEGORIES,
  MAX_MAJORS,
  MAX_MINORS,
  type CraftGroup,
} from "@/lib/weaponCraft";
import type { LifeSkillItem } from "@/lib/lifeSkillData";

export type CraftMineralView = {
  def: LifeSkillItem;
  have: number;
  used: boolean; // 제작에 써본 적 있는 광물만 효과 공개 — 발견의 재미
};

const RANK_TONE = [
  "text-slate-400",
  "text-slate-600",
  "text-emerald-600",
  "text-sky-600",
  "text-violet-600",
  "text-amber-500",
];

function ResultModal({ result, onClose }: { result: CraftResult; onClose: () => void }) {
  const ok = !("error" in result);
  const grade = ok ? result.grade : null;
  const golden = grade === "장인" || grade === "명품";
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="제작 결과"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm overflow-hidden rounded-3xl border text-center shadow-2xl ${
          golden
            ? "border-amber-400 bg-gradient-to-b from-amber-950 to-stone-950 text-amber-50"
            : "border-line bg-surface text-content"
        }`}
      >
        <div className="px-6 py-8">
          {!ok ? (
            <p className="text-sm font-bold text-rose-500">{result.error}</p>
          ) : (
            <>
              <div className={`mb-3 text-6xl ${golden ? "animate-bounce" : ""}`}>
                {grade === "장인" ? "🌟" : grade === "명품" ? "✨" : "⚒️"}
              </div>
              {grade && (
                <p className={`mb-1 text-xs font-black uppercase tracking-[0.3em] ${golden ? "text-amber-400" : "text-emerald-500"}`}>
                  ✦ {grade === "장인" ? "장인작" : grade} ✦
                </p>
              )}
              <p className={`text-lg font-black ${golden ? "text-amber-200" : "text-content"}`}>{result.name}</p>
              <p className={`mt-2 whitespace-pre-line text-xs leading-relaxed ${golden ? "text-amber-200/80" : "text-muted"}`}>
                {result.effectText}
              </p>
              <p className={`mt-2 text-[11px] ${golden ? "text-amber-300/70" : "text-faint"}`}>
                수수료 -{result.fee.toLocaleString()}G · 가방에 담겼어요
              </p>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`mt-5 w-full rounded-xl py-2.5 text-sm font-bold transition ${
              golden ? "bg-amber-500 text-stone-950 hover:bg-amber-400" : "bg-brand-500 text-white hover:bg-brand-600"
            }`}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CraftingForge({
  minerals,
  gold,
  isBlacksmith,
  onClose,
}: {
  minerals: CraftMineralView[];
  gold: number;
  isBlacksmith: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [group, setGroup] = useState<CraftGroup>("무기");
  const [category, setCategory] = useState<string>("장검");
  const [majorQty, setMajorQty] = useState<Record<string, number>>({});
  const [minorSel, setMinorSel] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CraftResult | null>(null);

  const majorsOwned = minerals.filter((m) => m.def.craftRole === "메이저" && m.have > 0);
  const minorsOwned = minerals.filter((m) => m.def.craftRole === "마이너" && m.have > 0);
  const defs = useMemo(() => new Map(minerals.map((m) => [m.def.name, m])), [minerals]);

  const totalMajors = Object.values(majorQty).reduce((s, n) => s + n, 0);

  const preview = useMemo(() => {
    // 새로고침으로 광물 목록이 바뀌었을 수 있으니 목록에 없는 선택은 무시
    const majors = Object.entries(majorQty)
      .filter(([name, qty]) => qty > 0 && defs.has(name))
      .map(([name, qty]) => ({ item: defs.get(name)!.def, qty }));
    const minors = minorSel.filter((name) => defs.has(name)).map((name) => defs.get(name)!.def);
    if (majors.length === 0) return null;
    return computeCraft({ category, majors, minors });
  }, [category, majorQty, minorSel, defs]);

  const fee =
    preview && !("error" in preview)
      ? isBlacksmith
        ? Math.max(10, Math.round(preview.fee / 2))
        : preview.fee
      : 0;

  function bumpMajor(name: string, delta: number) {
    setMajorQty((prev) => {
      const have = defs.get(name)?.have ?? 0;
      const cur = prev[name] ?? 0;
      const othersTotal = Object.entries(prev).reduce((s, [k, v]) => (k === name ? s : s + v), 0);
      const next = Math.max(0, Math.min(cur + delta, have, MAX_MAJORS - othersTotal));
      return { ...prev, [name]: next };
    });
  }

  function toggleMinor(name: string) {
    setMinorSel((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : prev.length < MAX_MINORS ? [...prev, name] : prev,
    );
  }

  async function craft() {
    if (busy || !preview || "error" in preview) return;
    setBusy(true);
    const form = new FormData();
    form.set("category", category);
    form.set("customName", customName);
    form.set(
      "majors",
      JSON.stringify(
        Object.fromEntries(Object.entries(majorQty).filter(([name, q]) => q > 0 && defs.has(name))),
      ),
    );
    form.set("minors", JSON.stringify(minorSel.filter((name) => defs.has(name))));
    // 담금질 연출 — 잠깐 뜸을 들인 뒤 결과 공개
    const [res] = await Promise.all([
      craftEquipment(form),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]);
    setBusy(false);
    setResult(res);
    if (!("error" in res)) {
      setMajorQty({});
      setMinorSel([]);
      setCustomName("");
    }
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="무기 제작"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-subtle px-5 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-faint">Blacksmith Crafting</p>
          <h3 className="mt-1 flex items-center justify-between gap-3 text-2xl font-extrabold text-content">
            <span>⚒️ 장비 제작</span>
            <span className="text-sm font-bold text-amber-600">{gold.toLocaleString()}G</span>
          </h3>
          <p className="mt-1 text-xs text-faint">
            광석을 녹여 장비를 벼린다.
            {isBlacksmith && <span className="ml-1 font-bold text-emerald-600">🔥 블랙스미스의 화로</span>}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 무기/방어구 토글 + 종별 */}
          <section>
            <div className="mb-2 grid grid-cols-2 gap-2 rounded-2xl bg-subtle p-1.5">
              {(["무기", "방어구"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGroup(g);
                    const first = CRAFT_CATEGORIES.find((c) => c.group === g);
                    if (first) setCategory(first.key);
                  }}
                  className={`rounded-xl py-2 text-sm font-extrabold transition ${
                    group === g ? "bg-surface text-brand-600 shadow-sm" : "text-muted hover:text-content"
                  }`}
                >
                  {g === "무기" ? "⚔️ 무기" : "🛡️ 방어구"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CRAFT_CATEGORIES.filter((c) => c.group === group).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    category === c.key
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-subtle text-muted hover:text-content"
                  }`}
                >
                  {c.emoji} {c.key}
                </button>
              ))}
            </div>
          </section>

          {/* 메이저 광물 */}
          <section className="rounded-2xl border border-line bg-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-content">⛏️ 메이저 광물</h4>
              <span className="text-xs font-black text-brand-600">
                {totalMajors}/{MAX_MAJORS} → Lv{Math.max(1, totalMajors)}
              </span>
            </div>
            {majorsOwned.length === 0 ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-faint">
                가진 메이저 광물이 없다. 광맥부터 찾아보자.
              </p>
            ) : (
              <div className="space-y-1.5">
                {majorsOwned.map(({ def, have, used }) => {
                  const qty = majorQty[def.name] ?? 0;
                  return (
                    <div key={def.name} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-content">
                          {def.name}{" "}
                          <span className={`text-[10px] font-bold ${RANK_TONE[def.rank] ?? "text-muted"}`}>{def.rarity}</span>
                        </p>
                        <p className="text-[10px] text-faint">
                          보유 {have} · {used ? (def.craftEffect ?? "-") : "???"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={() => bumpMajor(def.name, -1)} disabled={qty <= 0}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-sm font-black text-muted transition hover:text-content disabled:opacity-30">−</button>
                        <span className="w-6 text-center text-sm font-black text-content">{qty}</span>
                        <button type="button" onClick={() => bumpMajor(def.name, 1)}
                          disabled={qty >= have || totalMajors >= MAX_MAJORS}
                          className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-sm font-black text-muted transition hover:text-content disabled:opacity-30">＋</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 마이너 광물 */}
          <section className="rounded-2xl border border-line bg-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-content">💎 마이너 광물</h4>
              <span className="text-xs font-black text-violet-600">{minorSel.length}/{MAX_MINORS}</span>
            </div>
            {minorsOwned.length === 0 ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-faint">가진 마이너 광물이 없다.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {minorsOwned.map(({ def, have, used }) => {
                  const active = minorSel.includes(def.name);
                  return (
                    <button
                      key={def.name}
                      type="button"
                      onClick={() => toggleMinor(def.name)}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        active ? "border-violet-400 bg-violet-50" : "border-line bg-surface hover:border-violet-200"
                      }`}
                    >
                      <p className="truncate text-xs font-extrabold text-content">
                        {def.name}{" "}
                        <span className={`text-[10px] font-bold ${RANK_TONE[def.rank] ?? "text-muted"}`}>{def.rarity}</span>
                      </p>
                      <p className="text-[10px] text-faint">
                        보유 {have} · {used ? (def.craftEffect ?? "-") : "???"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* 미리보기 */}
          <section className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4">
            <h4 className="mb-2 text-sm font-extrabold text-content">🔍 미리보기</h4>
            {!preview ? (
              <p className="text-xs text-faint">메이저 광물을 올려보자.</p>
            ) : "error" in preview ? (
              <p className="text-xs font-bold text-rose-500">{preview.error}</p>
            ) : (
              (() => {
                const autoName = preview.repName.includes(preview.majorRep)
                  ? preview.repName
                  : `${preview.majorRep} ${preview.repName}`;
                return (
                  <div>
                    <p className="text-sm font-black text-content">
                      {customName.trim() || autoName}
                      <span className="ml-1.5 text-[11px] font-bold text-faint">
                        Lv{preview.level} {preview.category} · {preview.part}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted">{preview.effectText}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        maxLength={20}
                        placeholder={autoName}
                        className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-surface px-3 py-2 text-xs font-bold outline-none transition placeholder:font-normal placeholder:text-faint focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
                      />
                      <span className="shrink-0 text-[11px] font-bold text-faint">✏️ 이름 짓기</span>
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-faint">수수료 {fee.toLocaleString()}G</p>
                  </div>
                );
              })()
            )}
          </section>
        </div>

        <div className="border-t border-line px-5 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-muted transition hover:text-content"
            >
              닫기
            </button>
            <button
              type="button"
              disabled={busy || !preview || "error" in preview || fee > gold}
              onClick={() => void craft()}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-black text-white transition hover:from-amber-600 hover:to-orange-600 disabled:from-subtle-hover disabled:to-subtle-hover disabled:text-faint"
            >
              {busy ? "🔥 담금질 중…" : fee > gold ? "골드 부족" : "⚒️ 제작하기"}
            </button>
          </div>
        </div>
      </div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}
