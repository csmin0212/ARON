"use client";

import { useActionState, useMemo, useState } from "react";
import { useCookingItem, type CookingState } from "@/app/actions/services";
import { useSkillBook, type SkillBookState } from "@/app/actions/skills";
import type { SheetInventoryItem } from "@/lib/googleSheets";
import { ALCHEMY_CUSTOM_POTION_MARKER, customPotionSellPrice } from "@/lib/alchemy";
import { isEquipmentLikeInventoryItem } from "@/lib/itemUse";

export type LifeBagPocket = {
  name: string;
  emoji: string;
  weight: string;
  items: SheetInventoryItem[];
};

type Props = {
  gold: string;
  weight: string | null;
  items: SheetInventoryItem[];
  lifeBags?: LifeBagPocket[];
  skillBooks?: string[]; // 스킬북 아이템 이름 목록 (사용 시 전투스킬 습득)
  tagDict?: Record<string, string>; // 장비 [태그] 룰 사전 — 상세에서 설명 표시
};

function mergeItems(items: SheetInventoryItem[]): SheetInventoryItem[] {
  const byName = new Map<string, SheetInventoryItem>();
  for (const item of items) {
    if (item.qty <= 0) continue;
    const key = item.name.trim();
    const existing = byName.get(key);
    if (existing) {
      existing.qty += item.qty;
      existing.effect ||= item.effect;
      existing.weight ??= item.weight;
    } else {
      byName.set(key, { ...item, name: key });
    }
  }
  return [...byName.values()];
}

function weightText(item: SheetInventoryItem): string {
  if (item.weight == null) return "-";
  const total = item.weight * item.qty;
  return item.qty > 1 ? `${item.weight} / 합계 ${total}` : String(item.weight);
}

function normalizedItemName(name: string): string {
  return name.normalize("NFKC").replace(/[\s\u200B-\u200D\uFEFF]+/g, "").trim();
}

function canUseItem(item: SheetInventoryItem): boolean {
  const compactName = normalizedItemName(item.name);
  if (compactName === "의문의양피지") return true;
  if (compactName === "종이가든병") return true;
  if (compactName === "랜덤박스") return true;
  if (compactName === "망각의물약" || compactName === "변화의물약" || compactName === "망각의축복") {
    return true;
  }
  const effect = item.effect ?? "";
  if (effect.includes("아무도 없는 곳에서 열어보자")) return true;
  if (isEquipmentLikeInventoryItem(item)) return false;
  const isCustomAlchemyPotion = customPotionSellPrice(effect) != null;
  if (isCustomAlchemyPotion) {
    const hasDuration = /\d+\s*분/.test(effect);
    const hasLifeLuck = /(?:낚시·채집·채광|낚시·채집|낚시|채집|채광)\s*행운\s*\+\d+/.test(effect);
    const effectWithoutLifeLuck = effect.replace(
      /(?:낚시·채집·채광|낚시·채집|낚시|채집|채광)\s*행운\s*\+\d+(?:\s*(?:증가|버프))?/g,
      "",
    );
    const hasStatBuff =
      /(근력|재주|민첩|지력|감지|정신|행운|명중|회피|공격력|마력|물리\s*공격력|마법\s*공격력|마법\s*공격|무기\s*공격력|원하는\s*능력|모든\s*능력)\s*(?:판정\s*)?\+\d+(?:\s*(?:증가|버프))?/.test(effectWithoutLifeLuck);
    const hasApRecovery =
      /(?:피로도|스태미나|AP)\s*(?:를|을)?\s*(?:\[\d+\s*D\]|\d+\s*D|\d+)\s*점?\s*(?:회복|충전)/i.test(effect);
    const hasRecovery =
      /\b(?:HP|MP)\s*(?:를|을)?\s*(?:\[\d+\s*D\]|\d+\s*D|\d+|\d+\s*%(?:\s*\([^)]*\))?)\s*점?\s*회복/i.test(effect);
    const hasFateRecovery =
      /페이트\s*(?:를|을)?\s*(?:회복\s*)?\+?\s*\d+\s*(?:점)?\s*(?:회복|충전)?/i.test(effect);
    return hasApRecovery || hasRecovery || hasFateRecovery || (hasDuration && (hasLifeLuck || hasStatBuff));
  }
  // 행운·판정(월드 30분 버프)·세션 버프·HP/MP 회복·피로도 회복·던전 횟수 회복
  // useCookingItem이 처리하는 효과들.
  return /(?:낚시·채집·채광|낚시·채집|낚시|채집|채광)\s*행운\s*\+\d+|(?:낚시|채집|채광)\s*숙련도(?:를|을)?\s*\d+\s*(?:상승|증가|획득|올린다|올려준다)|(?:근력|재주|민첩|지력|감지|정신|행운|명중|회피|공격력|마력|물리\s*공격력|마법\s*공격력|마법\s*공격|무기\s*공격력|원하는\s*능력|모든\s*능력)\s*(?:판정\s*)?\+\d+(?:\s*(?:증가|버프))?|세션\s*버프|(?:시나리오|장면)\s*종료\s*시?\s*까지\s*지속|\d+\s*분\s*지속|(HP|MP)[^\n]*회복|피로도\s*(?:를|을)?\s*(?:\[\d+\s*D\]|\d+\s*D|\d+)[^\n]*회복|페이트[^\n]*회복|던전\s*(?:클리어|도전)?\s*횟수[^\n]*(?:회복|초기화)/.test(effect);
}

function displayEffect(effect: string | null | undefined): string {
  const text = (effect ?? "").trim();
  if (!text) return "아직 등록된 효과가 없어요.";
  const visible = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        line !== ALCHEMY_CUSTOM_POTION_MARKER &&
        !/^판매가\s*[\d,]+\s*G$/i.test(line) &&
        !/^연금 포인트\b/.test(line) &&
        !/^재료\s/.test(line) &&
        !/^숙련 보너스\b/.test(line),
    )
    .join("\n")
    .trim();
  return visible || "아직 등록된 효과가 없어요.";
}

function isLifeResetBlessing(item: SheetInventoryItem): boolean {
  return normalizedItemName(item.name) === "망각의축복";
}

function CookingStateLine({ state }: { state: CookingState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      className={`rounded-2xl px-3 py-2 text-sm font-semibold ${
        state.error ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export default function BagInventory({ gold, weight, items, lifeBags = [], skillBooks = [], tagDict = {} }: Props) {
  const [selected, setSelected] = useState<SheetInventoryItem | null>(null);
  const [activeTab, setActiveTab] = useState<string>("기본");
  const [useStateResult, useAction, usePending] = useActionState<CookingState, FormData>(
    useCookingItem,
    undefined,
  );
  const [skillResult, skillAction, skillPending] = useActionState<SkillBookState, FormData>(
    useSkillBook,
    undefined,
  );
  const skillBookSet = useMemo(() => new Set(skillBooks), [skillBooks]);
  const isSkillBook = (item: SheetInventoryItem) => skillBookSet.has(item.name.trim());

  // 가방 하나에 탭으로 통합 — 기본 + 생활 가방(낚시/채집/채광)
  const tabs = useMemo(
    () => [
      { key: "기본", emoji: "🎒", weight: weight ?? "-", items },
      ...lifeBags.map((bag) => ({ key: bag.name, emoji: bag.emoji, weight: bag.weight, items: bag.items })),
    ],
    [weight, items, lifeBags],
  );
  const active = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const mergedItems = useMemo(() => mergeItems(active.items), [active]);

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-extrabold text-content">
        <span>🎒 가방</span>
        <span className="text-xs font-bold text-emerald-500">{gold}</span>
      </h2>
      {tabs.length > 1 && (
        <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-subtle p-1">
          {tabs.map((tab) => {
            const isActive = active.key === tab.key;
            // 구매 가방의 "N칸" 접미사와 "꾼 가방"을 떼어 짧게 (낚시꾼 가방 20칸 → 낚시, 광부 가방 30칸 → 광부)
            const label =
              tab.key === "기본"
                ? "기본"
                : tab.key.replace(/\s*\d+\s*칸$/, "").replace(/꾼?\s*가방$/, "").trim() || "가방";
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-1 py-1.5 text-center text-[11px] font-extrabold transition ${
                  isActive ? "bg-surface text-brand-600 shadow-sm" : "text-muted hover:text-content"
                }`}
              >
                {tab.emoji} {label}
              </button>
            );
          })}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-subtle px-3 py-2 text-xs">
        <span className="font-semibold text-muted">중량</span>
        <span className="font-extrabold text-content">{active.weight}</span>
      </div>

      {mergedItems.length === 0 ? (
        <p className="px-1 text-xs text-faint">
          {active.key === "기본"
            ? "아직 비어 있어요. 시트에서 소지품을 추가한 뒤 프로필에서 가방만 다시 동기화해보세요."
            : "아직 비어 있어요."}
        </p>
      ) : (
        <ul className="space-y-2">
          {mergedItems.map((item, i) => (
            <li key={`${item.name}-${i}`}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="w-full rounded-2xl bg-subtle px-3 py-2 text-left transition hover:bg-subtle-hover focus:outline-none focus:ring-2 focus:ring-brand-200"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-content">{item.name}</p>
                    {item.effect && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-faint">
                        {displayEffect(item.effect)}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-bold text-muted">
                    <p>중량 {item.weight ?? "-"}</p>
                    <p className="text-brand-600">x{item.qty}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
          role="presentation"
          onClick={() => setSelected(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} 상세 정보`}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line bg-subtle px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-faint">
                Item Detail
              </p>
              <h3 className="mt-1 text-xl font-extrabold text-content">{selected.name}</h3>
            </div>
            <div className="space-y-3 px-5 py-4">
              <CookingStateLine state={useStateResult} />
              <CookingStateLine state={skillResult} />
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-subtle px-3 py-2">
                  <p className="text-[11px] font-bold text-faint">갯수</p>
                  <p className="text-lg font-extrabold text-brand-600">x{selected.qty}</p>
                </div>
                <div className="rounded-2xl bg-subtle px-3 py-2">
                  <p className="text-[11px] font-bold text-faint">중량</p>
                  <p className="text-lg font-extrabold text-content">{weightText(selected)}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-line px-3 py-3">
                <p className="mb-1 text-[11px] font-bold text-faint">상세 효과</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-content">
                  {displayEffect(selected.effect)}
                </p>
                {(() => {
                  // 효과문 속 [태그] → 룰 사전 설명
                  const tags = [...new Set([...(selected.effect ?? "").matchAll(/\[([^\]\n]+)\]/g)].map((m) => m[1]))]
                    .filter((tag) => tagDict[tag]);
                  if (tags.length === 0) return null;
                  return (
                    <div className="mt-2 space-y-1 border-t border-line pt-2">
                      {tags.map((tag) => (
                        <p key={tag} className="text-xs leading-relaxed text-violet-700">
                          <b>[{tag}]</b> {tagDict[tag]}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {canUseItem(selected) && (
                <form action={useAction} className="space-y-2">
                  <input type="hidden" name="itemName" value={selected.name} />
                  {isLifeResetBlessing(selected) && (
                    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-subtle p-1">
                      {(["낚시", "채집", "채광"] as const).map((kind, index) => (
                        <label
                          key={kind}
                          className="flex cursor-pointer items-center justify-center rounded-xl px-2 py-2 text-xs font-extrabold text-muted has-[:checked]:bg-surface has-[:checked]:text-brand-600 has-[:checked]:shadow-sm"
                        >
                          <input
                            type="radio"
                            name="lifeKind"
                            value={kind}
                            defaultChecked={index === 0}
                            className="sr-only"
                          />
                          {kind}
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={usePending}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {usePending ? "사용 중..." : "사용하기"}
                  </button>
                </form>
              )}
              {isSkillBook(selected) && (
                <form action={skillAction}>
                  <input type="hidden" name="itemName" value={selected.name} />
                  <button
                    type="submit"
                    disabled={skillPending}
                    className="w-full rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-violet-600 disabled:opacity-50"
                  >
                    {skillPending ? "습득 중..." : "📖 스킬 습득"}
                  </button>
                </form>
              )}
            </div>
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
