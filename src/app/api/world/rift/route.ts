import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

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

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ mode: "none" } satisfies RiftContext);

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });

  // 내부에 있는지 먼저 확인
  const membership = await prisma.riftMember.findFirst({
    where: { userId: user.id },
    include: { rift: true },
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

  // 현재 장소에 열린 균열이 있는지
  if (sheet?.locationId) {
    const rift = await prisma.rift.findFirst({
      where: { originId: sheet.locationId, status: "open" },
      orderBy: { createdAt: "desc" },
    });
    if (rift) {
      const { list, ids } = await membersOf(rift.id);
      return Response.json({
        mode: "entry",
        riftId: rift.id,
        type: rift.type,
        capacity: rift.capacity,
        members: list,
        joined: ids.includes(user.id),
        full: ids.length >= rift.capacity,
      } satisfies RiftContext);
    }
  }

  return Response.json({ mode: "none" } satisfies RiftContext);
}
