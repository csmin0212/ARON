"use client";

import { useState } from "react";
import {
  ADVENTURER_RANK_PERKS,
  adventurerRankGoal,
  nextAdventurerRank,
  normalizeAdventurerRank,
  rankAtLeast,
} from "@/lib/adventurerRank";

type Props = { rank: string | null | undefined; fame: number };

// 모험가 길드 장소 사진 우상단의 랭크 특혜 팝업.
// 특혜는 누적이라 내 랭크 이하는 전부 적용 중 — 표시도 그렇게 나눈다.
export default function GuildRankPerks({ rank, fame }: Props) {
  const [open, setOpen] = useState(false);
  const current = normalizeAdventurerRank(rank);
  const next = nextAdventurerRank(current);
  const goal = adventurerRankGoal(current);
  // 위에서부터 S → D. 목표 등급이 먼저 눈에 들어오는 편이 읽기 좋다.
  const rows = [...ADVENTURER_RANK_PERKS].reverse();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-extrabold text-white backdrop-blur transition hover:bg-black/70"
      >
        🎖️ 길드 등급 {current}
      </button>

      {open && (
        <div className="absolute right-3 top-12 z-20 w-72 rounded-2xl border border-line bg-surface p-3 shadow-lg sm:w-80">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-extrabold text-content">🎖️ 등급 특혜</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold text-faint hover:text-content"
            >
              닫기
            </button>
          </div>

          <p className="mb-2.5 rounded-xl bg-subtle px-2.5 py-1.5 text-[11px] font-bold text-muted">
            내 등급 <span className="font-extrabold text-brand-600">{current}</span> · 명성{" "}
            {fame.toLocaleString()}
            {next &&
              (fame >= goal ? (
                // 승급은 길드에서 직접 신청해야 오른다 — 명성이 찼는데 등급이 그대로일 수 있다
                <span className="font-extrabold text-emerald-600"> · {next} 승급 가능</span>
              ) : (
                <> · {next}까지 {(goal - fame).toLocaleString()}</>
              ))}
          </p>

          <ul className="space-y-1.5">
            {rows.map((row) => {
              const isCurrent = row.rank === current;
              const unlocked = rankAtLeast(current, row.rank);
              return (
                <li
                  key={row.rank}
                  className={`rounded-xl border px-2.5 py-2 ${
                    isCurrent
                      ? "border-brand-400 bg-brand-50"
                      : unlocked
                        ? "border-line bg-surface"
                        : "border-line bg-surface opacity-50"
                  }`}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold">
                    <span className={isCurrent ? "text-brand-700" : "text-content"}>{row.rank}</span>
                    <span className="font-bold text-faint">명성 {row.fame}</span>
                    {isCurrent && (
                      <span className="rounded bg-brand-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                        현재
                      </span>
                    )}
                    {!unlocked && <span className="text-[10px] font-bold text-faint">잠김</span>}
                  </p>
                  <p className="text-[11px] leading-snug text-muted">{row.perks.join(" · ")}</p>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 text-[10px] font-bold text-faint">아래 등급 특혜는 계속 적용</p>
        </div>
      )}
    </>
  );
}
