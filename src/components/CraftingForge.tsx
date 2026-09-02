"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { craftEquipment, type CraftResult } from "@/app/actions/craft";
import {
  computeCraft,
  craftApCost,
  craftFee,
  craftSellPrice,
  CRAFT_CATEGORIES,
  MAX_MAJORS,
  MAX_MINORS,
  MAX_MOON_FRAGMENTS,
  MOON_FRAGMENT,
  MOON_TIER_BASE,
  craftCategoryLabel,
  isCraftMinorMaterial,
  isMoonFragment,
  minorSlotsFor,
  minorSlotsForEquipLevel,
  MINOR_SLOT_LEVEL_REQ,
  type CraftHand,
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

// 메이저 광물 한 줄 — 일반 광물과 특수 광물이 같은 모양을 쓴다.
// atCap 은 '그 분류의 상한에 닿았나'(일반 5개=Lv5, 달의 파편 1개)로 서로 따로 센다.
function MajorRow({
  entry,
  qty,
  atCap,
  onBump,
  tone,
}: {
  entry: CraftMineralView;
  qty: number;
  atCap: boolean;
  onBump: (name: string, delta: number) => void;
  tone?: "amber";
}) {
  const { def, have, used } = entry;
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
        tone === "amber" ? "bg-amber-50 ring-1 ring-amber-200" : "bg-surface"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-xs font-extrabold text-content">
          {def.name}{" "}
          <span className={`text-[10px] font-bold ${RANK_TONE[def.rank] ?? "text-muted"}`}>
            {def.rarity}
          </span>
        </p>
        <p className="text-[10px] text-faint">
          보유 {have} · {used ? (def.craftEffect ?? "-") : "???"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onBump(def.name, -1)}
          disabled={qty <= 0}
          className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-sm font-black text-muted transition hover:text-content disabled:opacity-30"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-black text-content">{qty}</span>
        <button
          type="button"
          onClick={() => onBump(def.name, 1)}
          disabled={qty >= have || (qty > 0 && atCap)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-subtle text-sm font-black text-muted transition hover:text-content disabled:opacity-30"
        >
          ＋
        </button>
      </div>
    </div>
  );
}

function ResultModal({ result, onClose }: { result: CraftResult; onClose: () => void }) {
  const ok = !("error" in result);
  const grade = ok ? result.grade : null;
  const golden = grade === "장인" || grade === "명품";
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4" role="presentation" onClick={onClose}>
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
                수수료 -{result.fee.toLocaleString()}G · 피로도 -{result.apCost} · 대장 숙련 +{result.smithExp}
                {result.smithLevelUps.length > 0 && ` · 🆙 Lv.${result.smithLevelUps[result.smithLevelUps.length - 1]}!`}
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
  smithLevel,
  ap,
  tags = {},
  tagSlots = {},
  onClose,
}: {
  minerals: CraftMineralView[];
  gold: number;
  isBlacksmith: boolean;
  smithLevel: number;
  ap: number;
  tags?: Record<string, string>; // [태그] 룰 사전 — 클릭 시 설명
  tagSlots?: Record<string, string>; // 태그명 → 무기/방어구/공용 슬롯
  onClose: () => void;
}) {
  const router = useRouter();
  const [group, setGroup] = useState<CraftGroup>("무기");
  const [category, setCategory] = useState<string>("장검");
  const [handFilter, setHandFilter] = useState<CraftHand | "전체">("전체");
  const [majorQty, setMajorQty] = useState<Record<string, number>>({});
  const [minorSel, setMinorSel] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CraftResult | null>(null);
  const [openTag, setOpenTag] = useState<string | null>(null);
  const smithMinors = minorSlotsFor(smithLevel);
  const categoryOptions = useMemo(
    () =>
      CRAFT_CATEGORIES.filter(
        (c) => c.group === group && (group !== "무기" || handFilter === "전체" || c.hand === handFilter),
      ),
    [group, handFilter],
  );

  function firstCategoryFor(nextGroup: CraftGroup, nextHand: CraftHand | "전체"): string {
    return (
      CRAFT_CATEGORIES.find(
        (c) => c.group === nextGroup && (nextGroup !== "무기" || nextHand === "전체" || c.hand === nextHand),
      )?.key ?? ""
    );
  }

  // 메이저를 둘로 나눈다 — 일반 광물(Lv1~5)과 상위 티어를 여는 특수 광물(Lv6~10).
  const majors = minerals.filter((m) => m.def.craftRole === "메이저");
  const oresOwned = majors.filter((m) => !isMoonFragment(m.def.name) && m.have > 0);
  // 특수 광물은 안 갖고 있어도 줄을 남긴다 — "어디에 넣는 건지" 보이게 하려는 것.
  const uniqueRows = majors.filter((m) => isMoonFragment(m.def.name));
  const hasUnique = uniqueRows.some((m) => m.have > 0);
  const minorsOwned = minerals.filter((m) => m.def.craftRole === "마이너" && m.have > 0);
  const defs = useMemo(() => new Map(minerals.map((m) => [m.def.name, m])), [minerals]);

  // 달의 파편은 눈금을 Lv6~10 으로 옮기는 스위치다 — 상한도 따로 센다.
  const moonQty = Object.entries(majorQty)
    .filter(([name]) => isMoonFragment(name))
    .reduce((s, [, n]) => s + n, 0);
  const oreQty = Object.entries(majorQty)
    .filter(([name]) => !isMoonFragment(name))
    .reduce((s, [, n]) => s + n, 0);
  const craftLevel = moonQty > 0 ? MOON_TIER_BASE + Math.max(1, oreQty) : Math.max(1, oreQty);
  // 마이너 슬롯은 대장 숙련과 장비 레벨 둘 다 만족해야 열린다 (3칸 Lv5 / 4칸 Lv10).
  const maxMinors = Math.min(smithMinors, minorSlotsForEquipLevel(craftLevel));
  // 광물을 빼서 장비 레벨이 내려가면 넘치는 마이너를 자동으로 떨어뜨린다.
  useEffect(() => {
    setMinorSel((prev) => (prev.length > maxMinors ? prev.slice(0, maxMinors) : prev));
  }, [maxMinors]);

  const preview = useMemo(() => {
    // 새로고침으로 광물 목록이 바뀌었을 수 있으니 목록에 없는 선택은 무시
    const majors = Object.entries(majorQty)
      .filter(([name, qty]) => qty > 0 && defs.has(name))
      .map(([name, qty]) => ({ item: defs.get(name)!.def, qty }));
    const minors = minorSel.filter((name) => defs.has(name)).map((name) => defs.get(name)!.def);
    if (majors.length === 0) return null;
    return computeCraft({
      category,
      majors,
      minors,
      maxMinors,
      tagSlotOf: (t) => tagSlots[t] ?? "공용",
    });
  }, [category, majorQty, minorSel, defs, maxMinors, tagSlots]);

  // 세공비는 등급과 무관하게 확정값 — 팔 때 판매가에 얹혀 돌아온다.
  const requiredFee = preview && !("error" in preview) ? craftFee(preview.fee, isBlacksmith) : 0;
  const feeText = requiredFee.toLocaleString();
  const expectedSellPrice =
    preview && !("error" in preview) ? craftSellPrice(preview.materialValue, requiredFee, null) : 0;

  function bumpMajor(name: string, delta: number) {
    const moon = isMoonFragment(name);
    setMajorQty((prev) => {
      const have = defs.get(name)?.have ?? 0;
      const cur = prev[name] ?? 0;
      const cap = moon ? MAX_MOON_FRAGMENTS : MAX_MAJORS;
      // 광물은 여전히 한 종류만 — 다른 광물을 올리면 기존 광물은 비운다.
      // 특수 광물은 티어 재료라 광물과 공존한다(둘 다 남긴다).
      if (delta > 0 && cur <= 0 && !moon) {
        const kept = Object.fromEntries(
          Object.entries(prev).filter(([k, v]) => v > 0 && isMoonFragment(k)),
        );
        return { ...kept, [name]: Math.min(1, have, cap) };
      }
      const next = Math.max(0, Math.min(cur + delta, have, cap));
      const draft = { ...prev };
      if (next <= 0) delete draft[name];
      else draft[name] = next;
      // 파편은 광물 개수와 무관하게 남는다 — 광물 1~4개에도 Lv6~9 로 성립하고,
      // 파편을 먼저 올려두고 광물을 채워도 된다.
      return draft;
    });
  }

  function toggleMinor(name: string) {
    setMinorSel((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      const item = defs.get(name)?.def;
      if (!item || prev.length >= maxMinors) return prev;
      if (prev.length >= MAX_MINORS && !isCraftMinorMaterial(item)) return prev;
      return [...prev, name];
    });
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
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-4 py-6" role="presentation" onClick={onClose}>
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
            광석을 녹여 장비를 벼린다. <span className="font-bold text-content">⚒️ 대장 Lv.{smithLevel}</span>
            <span className="ml-1">· 피로도 {ap}</span>
            {isBlacksmith && <span className="ml-1 font-bold text-emerald-600">· 🔥 블랙스미스의 화로</span>}
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
                    const nextHand = g === "무기" ? handFilter : "전체";
                    if (g !== "무기") setHandFilter("전체");
                    setCategory(firstCategoryFor(g, nextHand));
                  }}
                  className={`rounded-xl py-2 text-sm font-extrabold transition ${
                    group === g ? "bg-surface text-brand-600 shadow-sm" : "text-muted hover:text-content"
                  }`}
                >
                  {g === "무기" ? "⚔️ 무기" : "🛡️ 방어구"}
                </button>
              ))}
            </div>
            {group === "무기" && (
              <div className="mb-2 grid grid-cols-3 gap-1.5 rounded-2xl bg-canvas p-1">
                {(["전체", "한손", "양손"] as const).map((hand) => (
                  <button
                    key={hand}
                    type="button"
                    onClick={() => {
                      setHandFilter(hand);
                      setCategory(firstCategoryFor("무기", hand));
                    }}
                    className={`rounded-xl py-1.5 text-xs font-extrabold transition ${
                      handFilter === hand ? "bg-surface text-brand-600 shadow-sm" : "text-muted hover:text-content"
                    }`}
                  >
                    {hand}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map((c) => (
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
                  {c.emoji} {craftCategoryLabel(c)}
                  {handFilter === "전체" && c.hand ? ` · ${c.hand}` : ""}
                </button>
              ))}
            </div>
          </section>

          {/* 메이저 광물 */}
          <section className="rounded-2xl border border-line bg-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-content">⛏️ 메이저 광물</h4>
              <span className="text-xs font-black text-brand-600">
                {moonQty > 0 ? `광물 ${oreQty}/${MAX_MAJORS} · ${MOON_FRAGMENT} ${moonQty}` : `${oreQty}/${MAX_MAJORS}`}{" "}
                → Lv{craftLevel}
              </span>
            </div>
            {/* 일반 광물 — 한 종류만, 개수가 곧 Lv1~5 */}
            <p className="mb-1.5 text-[11px] font-bold text-faint">일반 광물</p>
            {oresOwned.length === 0 ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-faint">
                가진 광물이 없다. 광맥부터 찾아보자.
              </p>
            ) : (
              <div className="space-y-1.5">
                {oresOwned.map((entry) => (
                  <MajorRow
                    key={entry.def.name}
                    entry={entry}
                    qty={majorQty[entry.def.name] ?? 0}
                    atCap={oreQty >= MAX_MAJORS}
                    onBump={bumpMajor}
                  />
                ))}
              </div>
            )}

            {/* 특수 광물 — 상위 티어를 여는 재료. 없어도 자리를 보여준다(어디 넣는지 알 수 있게). */}
            <p className="mb-1.5 mt-3 text-[11px] font-bold text-amber-600">특수 광물</p>
            <div className="space-y-1.5">
              {uniqueRows.map((entry) => (
                <MajorRow
                  key={entry.def.name}
                  entry={entry}
                  qty={majorQty[entry.def.name] ?? 0}
                  atCap={moonQty >= MAX_MOON_FRAGMENTS}
                  onBump={bumpMajor}
                  tone="amber"
                />
              ))}
            </div>
            {!hasUnique ? (
              <p className="mt-1.5 text-center text-[11px] text-faint">보유 없음</p>
            ) : (
              <p className="mt-1.5 text-center text-[11px] font-bold text-amber-600">
                1개만 넣으면 Lv6~10 으로 확장
              </p>
            )}
          </section>

          {/* 마이너 재료 */}
          <section className="rounded-2xl border border-line bg-subtle p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-content">💎 마이너 재료</h4>
              <span className="text-xs font-black text-violet-600">{minorSel.length}/{maxMinors}</span>
            </div>
            <p className="mb-2 text-[11px] font-bold text-violet-600">
              마이너 재료를 넣으면 결과가 매직 아이템으로 표기된다.
            </p>
            {maxMinors < smithMinors && (
              <p className="mb-2 text-[11px] font-bold text-faint">
                {maxMinors + 1}칸째는 장비 레벨 {MINOR_SLOT_LEVEL_REQ[maxMinors + 1]} 이상 · 현재 Lv{craftLevel}
              </p>
            )}
            {minorsOwned.length === 0 ? (
              <p className="rounded-xl bg-surface px-3 py-4 text-center text-xs text-faint">가진 마이너 재료가 없다.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {minorsOwned.map(({ def, have, used }) => {
                  const active = minorSel.includes(def.name);
                  const lockedByExtraSlot =
                    !active && minorSel.length >= MAX_MINORS && !isCraftMinorMaterial(def);
                  const lockedByFull = !active && minorSel.length >= maxMinors;
                  const disabled = lockedByExtraSlot || lockedByFull;
                  return (
                    <button
                      key={def.name}
                      type="button"
                      onClick={() => toggleMinor(def.name)}
                      disabled={disabled}
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        active
                          ? "border-violet-400 bg-violet-50"
                          : disabled
                            ? "border-line bg-surface opacity-45"
                            : "border-line bg-surface hover:border-violet-200"
                      }`}
                    >
                      <p className="truncate text-xs font-extrabold text-content">
                        {def.name}{" "}
                        <span className={`text-[10px] font-bold ${RANK_TONE[def.rank] ?? "text-muted"}`}>{def.rarity}</span>
                      </p>
                      <p className="text-[10px] text-faint">
                        보유 {have} · {lockedByExtraSlot ? "확장 슬롯은 특수 재료만" : used ? (def.craftEffect ?? "-") : "???"}
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-black text-content">{customName.trim() || autoName}</p>
                      <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-bold text-faint">
                        Lv{preview.level} {preview.category} · {preview.part}
                      </span>
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-black text-amber-700">
                        중량 {preview.weight}
                      </span>
                      {preview.isMagic && (
                        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-black text-violet-700">
                          매직 아이템
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted">{preview.effectText}</p>
                    {preview.tags.length > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1.5">
                          {preview.tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setOpenTag(openTag === tag ? null : tag)}
                              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                                openTag === tag
                                  ? "bg-violet-500 text-white"
                                  : "bg-violet-100 text-violet-700 hover:bg-violet-200"
                              }`}
                            >
                              [{tag}]
                            </button>
                          ))}
                        </div>
                        {openTag && (
                          <p className="mt-1.5 rounded-xl bg-violet-50 px-3 py-2 text-[11px] leading-relaxed text-violet-800">
                            <b>[{openTag}]</b> {tags[openTag] ?? "아직 기록되지 않은 특성이다. (제작특성 탭에 룰을 적어두면 여기 표시돼요)"}
                          </p>
                        )}
                      </div>
                    )}
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
                    <p className="mt-2 text-[11px] font-bold text-faint">
                      수수료 {feeText}G · 피로도 {craftApCost(preview.level)} · 중량 {preview.weight}
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-faint">
                      재료값 {preview.materialValue.toLocaleString()}G · 매입가{" "}
                      {expectedSellPrice.toLocaleString()}G~
                    </p>
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
              disabled={
                busy ||
                !preview ||
                "error" in preview ||
                requiredFee > gold ||
                (!!preview && !("error" in preview) && craftApCost(preview.level) > ap)
              }
              onClick={() => void craft()}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 py-2.5 text-sm font-black text-white transition hover:from-amber-600 hover:to-orange-600 disabled:from-subtle-hover disabled:to-subtle-hover disabled:text-faint"
            >
              {busy
                ? "🔥 담금질 중…"
                : requiredFee > gold
                  ? "골드 부족"
                  : preview && !("error" in preview) && craftApCost(preview.level) > ap
                    ? "피로도 부족"
                    : "⚒️ 제작하기"}
            </button>
          </div>
        </div>
      </div>

      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}
