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

  // 폴링 엔드포인트 — user 정보만 쓰므로 무거운 시트 JSON 컬럼은 가져오지 않는다 (egress 절감)
  const rows = await prisma.characterSheet.findMany({
    where: { locationId: sheet.locationId },
    select: { userId: true, user: { select: { username: true, nickname: true, avatar: true } } },
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
