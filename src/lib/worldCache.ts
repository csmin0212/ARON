import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { activeDisplayPersona } from "./gmNpc";

// 월드 폴링(채팅·접속자·균열) 전용 캐시 계층.
//
// 폴링은 초당 수십 번 도는데 대부분 "바뀐 게 없는" 조회다. 그래서 TTL 을 길게 두고
// 실제로 바뀌는 순간(메시지 작성·이동·균열 입퇴장)에 태그로 무효화한다.
// → 평상시 폴링이 DB 를 전혀 치지 않아 Neon egress 가 사실상 0 이 된다.
//
// 캐시는 JSON 직렬화되므로 Date 를 그대로 담지 않는다(문자열/숫자로 고정).

export const worldUserTag = (uid: string) => `world-user:${uid}`;
// 메시지와 접속자는 바뀌는 시점이 다르므로 태그를 분리한다.
// (같이 묶으면 채팅 한 줄마다 접속자 캐시까지 날아가 폴링이 계속 DB를 친다)
export const worldMsgTag = (locationId: string) => `world-msg:${locationId}`;
export const worldPeopleTag = (locationId: string) => `world-people:${locationId}`;
export const WORLD_RIFT_TAG = "world-rifts";

export type CachedMessage = {
  id: number;
  content: string;
  createdAt: string; // ISO
  createdAtMs: number;
  system: boolean;
  user: { username: string; nickname: string; avatar: string | null } | null;
};

export type CachedPerson = {
  userId: string;
  username: string;
  nickname: string;
  avatar: string | null;
};

const USER_TTL = 300; // 이동 시 즉시 무효화되므로 길게
const MSG_TTL = 60; // 메시지 작성 시 즉시 무효화
const PEOPLE_TTL = 120; // 이동 시 즉시 무효화
const RIFT_TTL = 60;

// 내 위치·입장시각 (이동 시 invalidateWorldUser 로 갱신)
export function getUserWorldState(uid: string) {
  return unstable_cache(
    async () => {
      const row = await prisma.characterSheet.findUnique({
        where: { userId: uid },
        select: { locationId: true, enteredAt: true },
      });
      return {
        locationId: row?.locationId ?? null,
        enteredAtMs: row?.enteredAt ? row.enteredAt.getTime() : 0,
      };
    },
    ["world:user-state", uid],
    { revalidate: USER_TTL, tags: [worldUserTag(uid)] },
  )();
}

// 장소의 최근 메시지 — 같은 장소 인원 전체가 이 캐시 하나를 공유한다.
// 유저별 필터(입장 이후 / lastId 이후)는 캐시 밖에서 JS 로 처리.
export function getRecentMessages(locationId: string) {
  return unstable_cache(
    async (): Promise<CachedMessage[]> => {
      const rows = await prisma.worldMessage.findMany({
        where: { locationId },
        orderBy: { id: "desc" },
        take: 60,
        select: {
          id: true,
          content: true,
          createdAt: true,
          system: true,
          authorName: true,
          authorAvatar: true,
          user: { select: { username: true, nickname: true, avatar: true } },
        },
      });
      return rows.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        createdAtMs: m.createdAt.getTime(),
        system: m.system,
        user: m.user
          ? {
              username: m.user.username,
              nickname: m.authorName ?? m.user.nickname,
              avatar: m.authorAvatar ?? m.user.avatar,
            }
          : null,
      }));
    },
    ["world:messages", locationId],
    { revalidate: MSG_TTL, tags: [worldMsgTag(locationId)] },
  )();
}

// 장소의 접속자 — 같은 장소 인원이 공유
export function getLocationPeople(locationId: string) {
  return unstable_cache(
    async (): Promise<CachedPerson[]> => {
      const rows = await prisma.characterSheet.findMany({
        where: { locationId },
        select: {
          userId: true,
          user: {
            select: {
              username: true,
              nickname: true,
              avatar: true,
              gmNpcPersonasJson: true,
              activeNpcPersonaKey: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      return rows.map((r) => {
        const persona = activeDisplayPersona(r.user);
        return {
          userId: r.userId,
          username: r.user.username,
          nickname: persona.name,
          avatar: persona.avatar,
        };
      });
    },
    ["world:people", locationId],
    { revalidate: PEOPLE_TTL, tags: [worldPeopleTag(locationId)] },
  )();
}

// 내 균열 멤버십 (입퇴장 시 invalidateWorldUser)
export function getRiftMembership(uid: string) {
  return unstable_cache(
    async () => {
      const row = await prisma.riftMember.findFirst({
        where: { userId: uid },
        select: { riftId: true, rift: { select: { type: true } } },
      });
      return row ? { riftId: row.riftId, type: row.rift.type } : null;
    },
    ["world:rift-membership", uid],
    { revalidate: RIFT_TTL, tags: [worldUserTag(uid)] },
  )();
}

// 열린 균열 목록 (전역 공유)
export const getOpenRifts = unstable_cache(
  () =>
    prisma.rift.findMany({
      where: { status: "open" },
      select: { id: true, originId: true, type: true, capacity: true },
      orderBy: { createdAt: "desc" },
    }),
  ["world:open-rifts"],
  { revalidate: RIFT_TTL, tags: [WORLD_RIFT_TAG] },
);

// 균열 참가자 (입퇴장 시 rift 태그 무효화). RiftMember 엔 user 관계가 없어 따로 조회한다.
export function getRiftMembers(riftId: string) {
  return unstable_cache(
    async (): Promise<CachedPerson[]> => {
      const rows = await prisma.riftMember.findMany({
        where: { riftId },
        orderBy: { joinedAt: "asc" },
        select: { userId: true },
      });
      const ids = rows.map((r) => r.userId);
      if (ids.length === 0) return [];
      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          username: true,
          nickname: true,
          avatar: true,
          gmNpcPersonasJson: true,
          activeNpcPersonaKey: true,
        },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return ids
        .map((id) => byId.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map((u) => {
          const persona = activeDisplayPersona(u);
          return {
            userId: u.id,
            username: u.username,
            nickname: persona.name,
            avatar: persona.avatar,
          };
        });
    },
    ["world:rift-members", riftId],
    { revalidate: RIFT_TTL, tags: [WORLD_RIFT_TAG] },
  )();
}

// ── 균열 컨텍스트 (rift 라우트 + 통합 sync 라우트 공용) ──
export type RiftPerson = { username: string; nickname: string; avatar: string | null };
export type RiftContext =
  | { mode: "none" }
  | { mode: "entry"; riftId: string; type: string; capacity: number; members: RiftPerson[]; joined: boolean; full: boolean }
  | { mode: "inside"; riftId: string; type: string; members: RiftPerson[] };

const strip = (p: CachedPerson): RiftPerson => ({
  username: p.username,
  nickname: p.nickname,
  avatar: p.avatar,
});

export async function resolveRiftContext(
  uid: string,
  locationId: string | null,
): Promise<RiftContext> {
  const membership = await getRiftMembership(uid);
  if (membership) {
    const members = await getRiftMembers(membership.riftId);
    return {
      mode: "inside",
      riftId: membership.riftId,
      type: membership.type,
      members: members.map(strip),
    };
  }

  // 열린 균열이 없으면(평상시) 더 볼 것도 없다
  const openRifts = await getOpenRifts();
  if (openRifts.length === 0) return { mode: "none" };

  const rift = locationId ? openRifts.find((r) => r.originId === locationId) : undefined;
  if (!rift) return { mode: "none" };

  const members = await getRiftMembers(rift.id);
  return {
    mode: "entry",
    riftId: rift.id,
    type: rift.type,
    capacity: rift.capacity,
    members: members.map(strip),
    joined: members.some((m) => m.userId === uid),
    full: members.length >= rift.capacity,
  };
}

// ── 무효화 ──
// Next 16 의 revalidateTag 는 만료 프로파일을 함께 받는다. expire:0 = 즉시 만료.
const PURGE = { expire: 0 } as const;

export function invalidateWorldUser(uid: string) {
  revalidateTag(worldUserTag(uid), PURGE);
}
/** 채팅·행동 로그가 생겼을 때 (메시지 캐시만) */
export function invalidateWorldMessages(locationId: string | null | undefined) {
  if (locationId) revalidateTag(worldMsgTag(locationId), PURGE);
}
/** 누군가 들어오거나 나갔을 때 (접속자 캐시만) */
export function invalidateLocationPeople(locationId: string | null | undefined) {
  if (locationId) revalidateTag(worldPeopleTag(locationId), PURGE);
}
/** 이동처럼 둘 다 바뀌는 경우 */
export function invalidateWorldLocation(locationId: string | null | undefined) {
  invalidateWorldMessages(locationId);
  invalidateLocationPeople(locationId);
}
export function invalidateRifts() {
  revalidateTag(WORLD_RIFT_TAG, PURGE);
}
