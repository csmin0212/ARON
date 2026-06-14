import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export type PresencePerson = {
  username: string;
  nickname: string;
  avatar: string | null;
  isMe: boolean;
};

// 현재 위치에 있는 모험가 목록 (실시간 폴링용)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ people: [] });

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });
  if (!sheet?.locationId) return Response.json({ people: [] });

  const rows = await prisma.characterSheet.findMany({
    where: { locationId: sheet.locationId },
    include: { user: { select: { username: true, nickname: true, avatar: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const people: PresencePerson[] = rows.map((r) => ({
    username: r.user.username,
    nickname: r.user.nickname,
    avatar: r.user.avatar,
    isMe: r.userId === user.id,
  }));

  return Response.json({ people });
}
