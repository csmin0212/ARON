import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { pump, type MatchState } from "@/lib/mahjong";
import { buildMahjongSnapshot } from "@/lib/mahjongSnapshot";

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
  if (table.status === "playing" && table.matchStateJson) {
    match = JSON.parse(table.matchStateJson) as MatchState;
    const before = table.matchStateJson;
    pump(match);
    const after = JSON.stringify(match);
    if (after !== before) {
      await prisma.mahjongTable.update({
        where: { id: table.id },
        data: { matchStateJson: after, status: match.finished ? "finished" : "playing" },
      });
    }
  } else if (table.status === "finished" && table.matchStateJson) {
    match = JSON.parse(table.matchStateJson) as MatchState;
  }

  const userIds = table.seats.map((s) => s.userId).filter((v): v is string => !!v);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } });
  const nicknames = new Map(users.map((u) => [u.id, u.nickname]));

  return NextResponse.json(buildMahjongSnapshot(table, match, nicknames, me.id));
}
