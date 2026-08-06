import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { pump, type MatchState } from "@/lib/mahjong";
import { buildMahjongSnapshot } from "@/lib/mahjongSnapshot";
import { finishAndSettle, parseMatchState } from "@/lib/mahjongSettle";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const table = await prisma.mahjongTable.findUnique({ where: { id }, include: { seats: true } });
  if (!table) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isParticipant = table.seats.some((s) => s.userId === me.id);
  // 대기실은 참가자만, 진행 중/종료된 판은 관전 허용(손패는 buildMahjongSnapshot이 항상 마스킹)
  if (!isParticipant && table.status === "waiting") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let match: MatchState | null = null;
  if (table.status === "playing") {
    match = parseMatchState(table.matchStateJson);
    if (match) {
      const before = table.matchStateJson;
      pump(match);
      if (match.finished) {
        // 대국이 여기서 끝나는 경우가 대부분이다(AI 가 마지막 판을 마무리하거나 시간초과).
        // 예전엔 status 만 바꾸고 정산을 안 해서 입장료만 내고 아무것도 못 받았다.
        await finishAndSettle(
          {
            id: table.id,
            tier: table.tier,
            playerCount: table.playerCount,
            seats: table.seats.map((s) => ({
              seatIndex: s.seatIndex,
              userId: s.userId,
              isAi: s.isAi,
              entryGold: s.entryGold,
            })),
          },
          match,
        );
      } else {
        const after = JSON.stringify(match);
        if (after !== before) {
          await prisma.mahjongTable.update({
            where: { id: table.id },
            data: { matchStateJson: after },
          });
        }
      }
    }
  } else if (table.status === "finished") {
    match = parseMatchState(table.matchStateJson);
  }

  const userIds = table.seats.map((s) => s.userId).filter((v): v is string => !!v);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } });
  const nicknames = new Map(users.map((u) => [u.id, u.nickname]));

  return NextResponse.json(buildMahjongSnapshot(table, match, nicknames, me.id));
}
