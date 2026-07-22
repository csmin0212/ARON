"use client";

import { useMemo, useState } from "react";
import { equipAchievement, unequipAchievement } from "@/app/actions/achievements";

export type AchView = {
  id: string;
  category: string;
  name: string;
  desc: string | null;
  badge: string | null;
  secret: boolean;
  rewardTitle: string | null;
  earned: boolean;
};

export default function AchievementBook({
  achievements,
  isOwn,
  equippedTitle,
  equippedBadge,
  selectedAchievementIds = [],
}: {
  achievements: AchView[];
  isOwn: boolean;
  equippedTitle: string | null;
  equippedBadge: string | null;
  selectedAchievementIds?: string[];
}) {
  // 대표로 장착한 항목 식별 — 칭호·배지 둘 다 일치해야 함.
  // (칭호 없이 배지만 있는 업적도 정상 인식되도록 양쪽을 본다.)
  const hasEquipped = equippedTitle != null || equippedBadge != null;
  const earnedCount = achievements.filter((a) => a.earned).length;
  const total = achievements.length;
  const earnedPercent = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  // 분류별로 묶기 (정의 순서 유지)
  const groups = useMemo(() => {
    const out: { category: string; items: AchView[] }[] = [];
    for (const a of achievements) {
      let g = out.find((x) => x.category === a.category);
      if (!g) {
        g = { category: a.category, items: [] };
        out.push(g);
      }
      g.items.push(a);
    }
    return out;
  }, [achievements]);
  const [activeCategory, setActiveCategory] = useState<string>(() => groups[0]?.category ?? "all");
  const activeGroup =
    activeCategory === "all" ? null : groups.find((g) => g.category === activeCategory) ?? null;
  const visibleGroups = activeGroup ? [activeGroup] : groups;

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-extrabold text-content">🏅 업적</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-600">
          {earnedCount} / {total} · {earnedPercent}%
        </span>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-sm text-faint">
          아직 업적이 없어요. GM이 ‘업적’ 탭을 동기화하면 나타나요.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-subtle p-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                activeCategory === "all"
                  ? "bg-surface text-brand-600 shadow-sm"
                  : "text-muted hover:text-content"
              }`}
            >
              전체 {earnedCount}/{total}
            </button>
            {groups.map((g) => {
              const groupEarned = g.items.filter((i) => i.earned).length;
              return (
                <button
                  key={g.category}
                  type="button"
                  onClick={() => setActiveCategory(g.category)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-black transition ${
                    activeCategory === g.category
                      ? "bg-surface text-brand-600 shadow-sm"
                      : "text-muted hover:text-content"
                  }`}
                >
                  {g.category} {groupEarned}/{g.items.length}
                </button>
              );
            })}
          </div>

          {visibleGroups.map((g) => (
            <div key={g.category}>
              <p className="mb-2 px-1 text-xs font-bold text-faint">
                {g.category}{" "}
                <span className="text-faint2">
                  {g.items.filter((i) => i.earned).length}/{g.items.length}
                </span>
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {g.items.map((a) => {
                  // HIDDEN 업적은 달성 전까지 누구에게도 내용을 보이지 않음
                  const hidden = a.secret && !a.earned;
                  const equipped =
                    a.earned &&
                    (selectedAchievementIds.includes(a.id) ||
                      (hasEquipped &&
                        (a.rewardTitle ?? null) === equippedTitle &&
                        (a.badge ?? null) === equippedBadge));
                  const equippedSlot = selectedAchievementIds.findIndex((id) => id === a.id);
                  return (
                    <div
                      key={a.id}
                      className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 transition ${
                        a.earned
                          ? "border-brand-200 bg-brand-50/40"
                          : "border-line bg-subtle opacity-70"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
                          a.earned ? "bg-surface shadow-sm" : "bg-subtle-hover grayscale"
                        }`}
                      >
                        {hidden ? "❔" : a.badge ?? "🏅"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-content">
                          {hidden ? "숨겨진 업적입니다!" : a.name}
                          {equipped && (
                            <span className="rounded bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                              {equippedSlot <= 0 ? "대표" : `서브${equippedSlot}`}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {hidden ? "아직 내용을 확인할 수 없어요." : a.desc ?? ""}
                        </p>
                        {a.earned && a.rewardTitle && (
                          <p className="mt-0.5 text-[11px] font-semibold text-brand-600">
                            칭호 「{a.rewardTitle}」
                          </p>
                        )}
                      </div>
                      {isOwn && a.earned && (a.rewardTitle || a.badge) && (
                        <div className="grid shrink-0 gap-1 self-center">
                          {["대표", "서브1", "서브2"].map((label, slot) => (
                            <form key={label} action={equipAchievement}>
                              <input type="hidden" name="achId" value={a.id} />
                              <input type="hidden" name="slot" value={slot} />
                              <button
                                type="submit"
                                disabled={equippedSlot === slot}
                                className="rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-muted transition hover:bg-subtle disabled:bg-brand-50 disabled:text-brand-600"
                              >
                                {label}
                              </button>
                            </form>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {isOwn && hasEquipped && (
        <form action={unequipAchievement} className="mt-4">
          <button
            type="submit"
            className="text-xs font-semibold text-faint transition hover:text-rose-500"
          >
            대표 해제
          </button>
        </form>
      )}
    </div>
  );
}
