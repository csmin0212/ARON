import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { MatchState } from "@/lib/mahjong";
import { buildMahjongSnapshot } from "@/lib/mahjongSnapshot";
import MahjongRoom from "@/components/MahjongRoom";

export const metadata: Metadata = { title: "마작 · 아리안로드 온라인 갤러리" };

export default async function MahjongTablePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const { id } = await params;
  const table = await prisma.mahjongTable.findUnique({ where: { id }, include: { seats: true } });
  if (!table) notFound();
  const isParticipant = table.seats.some((s) => s.userId === me.id);
  // 대기실은 참가자만, 진행 중/종료된 판은 관전 허용
  if (!isParticipant && table.status === "waiting") notFound();

  const match: MatchState | null = table.matchStateJson ? (JSON.parse(table.matchStateJson) as MatchState) : null;
  const userIds = table.seats.map((s) => s.userId).filter((v): v is string => !!v);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } });
  const nicknames = new Map(users.map((u) => [u.id, u.nickname]));

  const snapshot = buildMahjongSnapshot(table, match, nicknames, me.id);

  return <MahjongRoom tableId={table.id} currentUserId={me.id} isHost={table.hostUserId === me.id} initialSnapshot={snapshot} />;
}
