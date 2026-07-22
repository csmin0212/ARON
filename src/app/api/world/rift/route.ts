import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/auth";

export type RiftPerson = { username: string; nickname: string; avatar: string | null };
export type RiftContext =
  | { mode: "none" }
  | { mode: "entry"; riftId: string; type: string; capacity: number; members: RiftPerson[]; joined: boolean; full: boolean }
  | { mode: "inside"; riftId: string; type: string; members: RiftPerson[] };

async function membersOf(riftId: string): Promise<{ list: RiftPerson[]; ids: string[] }> {
  const rows = await prisma.riftMember.findMany({
    where: { riftId },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  });
  const ids = rows.map((r) => r.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, username: true, nickname: true, avatar: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const list = ids
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({ username: u.username, nickname: u.nickname, avatar: u.avatar }));
  return { list, ids };
}

// 열린 균열 목록 — 전역 공용이라 10초 캐시로 폴링 인원 전체가 공유.
// 평상시(균열 없음)엔 이 캐시 덕에 폴링이 DB를 거의 안 친다.
const getOpenRifts = unstable_cache(
  () =>
    prisma.rift.findMany({
      where: { status: "open" },
      select: { id: true, originId: true, type: true, capacity: true },
      orderBy: { createdAt: "desc" },
    }),
  ["open-rifts"],
  { revalidate: 10 },
);

export async function GET(): Promise<Response> {
  // 폴링 핫패스 — JWT 검증만으로 인증 (유저 행 DB 조회 없음)
  const uid = await getSessionUid();
  if (!uid) return Response.json({ mode: "none" } satisfies RiftContext);

  // 내부에 있는지 먼저 확인 (보통 0행)
  const membership = await prisma.riftMember.findFirst({
    where: { userId: uid },
    select: { riftId: true, rift: { select: { type: true } } },
  });
  if (membership) {
    const { list } = await membersOf(membership.riftId);
    return Response.json({
      mode: "inside",
      riftId: membership.riftId,
      type: membership.rift.type,
      members: list,
    } satisfies RiftContext);
  }

  // 열린 균열이 하나도 없으면(평상시) 위치 조회조차 불필요
  const openRifts = await getOpenRifts();
  if (openRifts.length === 0) return Response.json({ mode: "none" } satisfies RiftContext);

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: uid },
    select: { locationId: true },
  });
  const rift = sheet?.locationId
    ? openRifts.find((r) => r.originId === sheet.locationId)
    : undefined;
  if (!rift) return Response.json({ mode: "none" } satisfies RiftContext);

  const { list, ids } = await membersOf(rift.id);
  return Response.json({
    mode: "entry",
    riftId: rift.id,
    type: rift.type,
    capacity: rift.capacity,
    members: list,
    joined: ids.includes(uid),
    full: ids.length >= rift.capacity,
  } satisfies RiftContext);
}
