import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/auth";

export type PresencePerson = {
  username: string;
  nickname: string;
  avatar: string | null;
  isMe: boolean;
};

// 같은 장소 사람들은 같은 목록을 보므로 장소별 10초 캐시로 폴링 인원 전체가 쿼리 1번을 공유.
// isMe 는 캐시 밖에서 uid 로 계산한다.
const peopleAt = unstable_cache(
  (locationId: string) =>
    prisma.characterSheet.findMany({
      where: { locationId },
      select: { userId: true, user: { select: { username: true, nickname: true, avatar: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ["presence-at"],
  { revalidate: 10 },
);

// 현재 위치에 있는 모험가 목록 (실시간 폴링용)
// 인증은 JWT 검증만(getSessionUid) — 폴링마다 유저 행을 DB에서 다시 읽지 않는다.
export async function GET() {
  const uid = await getSessionUid();
  if (!uid) return Response.json({ people: [] });

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: uid },
    select: { locationId: true },
  });
  if (!sheet?.locationId) return Response.json({ people: [] });

  const rows = await peopleAt(sheet.locationId);

  const people: PresencePerson[] = rows.map((r) => ({
    username: r.user.username,
    nickname: r.user.nickname,
    avatar: r.user.avatar,
    isMe: r.userId === uid,
  }));

  return Response.json({ people });
}
