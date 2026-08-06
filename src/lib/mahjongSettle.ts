import { prisma } from "@/lib/prisma";
import { kstDayKey } from "@/lib/world";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import {
  TIERS_3P,
  TIERS_4P,
  pointsToGold,
  settleAiCappedGold,
  type MatchState,
  type Tier,
} from "@/lib/mahjong";

export { parseMatchState } from "@/lib/mahjong";

export function tierConfigOf(playerCount: 3 | 4, tierKey: string) {
  const tiers = playerCount === 3 ? TIERS_3P : TIERS_4P;
  return tiers[(tierKey as Tier) in tiers ? (tierKey as Tier) : "low"];
}

type SeatRow = { seatIndex: number; userId: string | null; isAi: boolean; entryGold: number };

/**
 * 대국을 끝내고 골드를 정산한다.
 *
 * 폴링(GET)에서 끝날 수도 있고 플레이어 액션에서 끝날 수도 있어서, 두 경로가 모두 이걸 부른다.
 * 중복 지급을 막으려고 status: "playing" → "finished" 로 바꾸는 데 성공한 호출만 정산한다
 * (updateMany 의 count 로 판별 — 동시에 들어와도 한 번만 통과한다).
 */
export async function finishAndSettle(
  table: { id: string; tier: string; playerCount: number; seats: SeatRow[] },
  match: MatchState,
): Promise<boolean> {
  const claimed = await prisma.mahjongTable.updateMany({
    where: { id: table.id, status: "playing" },
    data: { status: "finished", matchStateJson: JSON.stringify(match) },
  });
  if (claimed.count === 0) return false; // 다른 요청이 이미 정산했다
  if (!match.finalResult) return true;

  const tierConfig = tierConfigOf(table.playerCount as 3 | 4, table.tier);
  const hasAi = table.seats.some((s) => s.isAi);
  const today = kstDayKey(new Date());

  for (const result of match.finalResult) {
    const seatRow = table.seats.find((s) => s.seatIndex === result.seat);
    const entryGold = seatRow?.entryGold ?? 0;
    let goldDelta = 0;

    if (result.userId) {
      const payoutGold = pointsToGold(result.finalPoints, tierConfig);
      const netGain = payoutGold - entryGold;

      if (hasAi) {
        const sheet = await prisma.characterSheet.findUnique({
          where: { userId: result.userId },
          select: { mahjongAiGoldJson: true },
        });
        let state = { day: today, earned: 0 };
        try {
          if (sheet?.mahjongAiGoldJson) state = JSON.parse(sheet.mahjongAiGoldJson) as typeof state;
        } catch {
          /* 깨져 있으면 새로 시작 */
        }
        const { state: nextState, payableGain } = settleAiCappedGold(state, today, netGain);
        goldDelta = entryGold + payableGain;
        await prisma.characterSheet.update({
          where: { userId: result.userId },
          data: { mahjongAiGoldJson: JSON.stringify(nextState) },
        });
      } else {
        goldDelta = entryGold + netGain;
      }

      if (goldDelta !== 0) {
        await prisma.characterSheet.update({
          where: { userId: result.userId },
          data: { curGold: { increment: goldDelta } },
        });
        void enqueueSheetGoldSync(result.userId);
      }
    }

    await prisma.mahjongRecord.create({
      data: {
        tableId: table.id,
        userId: result.userId,
        isAi: result.isAi,
        placement: result.placement,
        finalScore: result.finalPoints,
        goldDelta,
      },
    });
  }
  return true;
}
