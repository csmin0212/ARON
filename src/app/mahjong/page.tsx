import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RANK_TIERS, computeStats, nextTierFor, tierProgress } from "@/lib/mahjong";
import MahjongRankBadge from "@/components/MahjongRankBadge";

export const metadata: Metadata = { title: "마작 전적 · 아리안로드 온라인 갤러리" };

export default async function MahjongHistoryPage() {
  const me = await getCurrentUser();

  const records = await prisma.mahjongRecord.findMany({
    where: { userId: { not: null } },
    select: {
      userId: true,
      placement: true,
      goldDelta: true,
      finalScore: true,
      createdAt: true,
      table: { select: { playerCount: true, tier: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const byUser = new Map<string, typeof records>();
  for (const r of records) {
    if (!r.userId) continue;
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  const userIds = [...byUser.keys()];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } });
  const nicknameMap = new Map(users.map((u) => [u.id, u.nickname]));

  const leaderboard = userIds
    .map((uid) => {
      const list = byUser.get(uid)!;
      const stats = computeStats(
        list.map((r) => ({ placement: r.placement, goldDelta: r.goldDelta, playerCount: r.table.playerCount })),
      );
      return { userId: uid, nickname: nicknameMap.get(uid) ?? "???", stats };
    })
    .filter((row) => row.stats.gamesPlayed > 0)
    .sort((a, b) => b.stats.rankPoints - a.stats.rankPoints)
    .slice(0, 10);

  const myRecords = me ? (byUser.get(me.id) ?? []) : [];
  const myStats = computeStats(
    myRecords.map((r) => ({ placement: r.placement, goldDelta: r.goldDelta, playerCount: r.table.playerCount })),
  );
  const myNext = nextTierFor(myStats.rankPoints);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MAHJONG</p>
        <h1 className="mt-1 text-2xl font-black text-content">🀄 마작 전적</h1>
      </header>

      {me && (
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
          {myStats.gamesPlayed === 0 ? (
            <p className="text-center text-sm text-faint">아직 대국 기록이 없어요. 분수광장에서 첫 판을 시작해보세요.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <MahjongRankBadge tier={myStats.tier} size="lg" />
                  <p className="mt-2 text-2xl font-black text-content">{myStats.rankPoints}점</p>
                  {myNext ? (
                    <p className="mt-1 text-xs text-faint">
                      다음 등급 {myNext.tier.label}까지 {myNext.remaining}점
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-bold text-amber-600">최고 등급 달성</p>
                  )}
                </div>
                <div className="text-right text-sm text-muted">
                  <p>{myStats.gamesPlayed}판</p>
                  <p>1위율 {(myStats.winRate * 100).toFixed(0)}%</p>
                  <p>평균 {myStats.avgPlacement.toFixed(2)}위</p>
                  <p className={myStats.totalGoldDelta >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>
                    {myStats.totalGoldDelta >= 0 ? "+" : ""}
                    {myStats.totalGoldDelta.toLocaleString()}G
                  </p>
                  <p className="text-[10px] text-faint">입장료 뺀 순손익</p>
                </div>
              </div>

              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-canvas">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width]"
                  style={{ width: `${Math.round(tierProgress(myStats.rankPoints) * 100)}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                {myStats.placementCounts.map((count, i) => (
                  <div key={i} className="rounded-xl bg-canvas py-2">
                    <p className="font-black text-content">{count}</p>
                    <p className="text-faint">{i + 1}위</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-xs font-extrabold text-faint">최근 전적</p>
                {myRecords.slice(0, 10).map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-canvas px-3 py-1.5 text-xs">
                    <span className="font-bold text-content">
                      {r.placement}위 · {r.table.playerCount}인
                      {r.table.tier === "free" && (
                        <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] font-black text-emerald-600">
                          무료
                        </span>
                      )}
                    </span>
                    <span className="text-faint">{r.finalScore.toLocaleString()}점</span>
                    {r.table.tier === "free" ? (
                      <span className="font-bold text-faint">—</span>
                    ) : (
                      <span className={r.goldDelta >= 0 ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>
                        {r.goldDelta >= 0 ? "+" : ""}
                        {r.goldDelta}G
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-extrabold text-faint">리더보드</p>
        {leaderboard.length === 0 ? (
          <p className="mt-3 text-center text-sm text-faint">아직 기록이 없어요.</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {leaderboard.map((row, i) => (
              <li key={row.userId} className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2">
                <span className="w-5 shrink-0 text-center text-xs font-black text-faint">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-content">{row.nickname}</span>
                <MahjongRankBadge tier={row.stats.tier} size="sm" showHanja={false} />
                <span className="shrink-0 text-sm font-black text-brand-600">{row.stats.rankPoints}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-extrabold text-faint">등급표</p>
        <div className="mt-3 space-y-2">
          {RANK_TIERS.map((t) => {
            const mine = me && myStats.gamesPlayed > 0 && myStats.tier.key === t.key;
            return (
              <div
                key={t.key}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                  mine ? "bg-brand-50 ring-1 ring-brand-300" : "bg-canvas"
                }`}
              >
                <MahjongRankBadge tier={t} size="md" />
                <span className="flex-1 text-xs text-faint">{t.minPoints}점 이상</span>
                {mine && <span className="text-[10px] font-black text-brand-600">현재</span>}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          4인전 +30 / +10 / −10 / −30 · 3인전 +30 / 0 / −30 · 무료방 포함 · 최저 0점
        </p>
      </section>

      <Link
        href="/world"
        className="block w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-extrabold text-white transition hover:bg-brand-700"
      >
        분수광장으로
      </Link>
    </div>
  );
}
