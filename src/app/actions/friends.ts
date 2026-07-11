"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import {
  hasFurnitureEffect,
  homeLocationId,
  homeOwnerFromLocationId,
  houseOption,
  isHomeLocationId,
  parseHousingState,
} from "@/lib/housing";
import { postSystem } from "@/lib/play";

export type FriendState = { error?: string; ok?: string } | undefined;

// 양방향 친구 여부 (accepted)
async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { userId: a, friendId: b },
        { userId: b, friendId: a },
      ],
    },
    select: { id: true },
  });
  return !!row;
}

// ── 친구 요청 — 닉네임 또는 아이디로 ──
export async function sendFriendRequest(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "닉네임 또는 아이디를 입력해주세요." };

  const target = await prisma.user.findFirst({
    where: { OR: [{ username: name }, { nickname: name }] },
    select: { id: true, nickname: true },
  });
  if (!target) return { error: `'${name}' 님을 찾지 못했어요.` };
  if (target.id === user.id) return { error: "자기 자신은 친구로 추가할 수 없어요." };

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: user.id, friendId: target.id },
        { userId: target.id, friendId: user.id },
      ],
    },
  });
  if (existing?.status === "accepted") return { error: `${target.nickname}님과는 이미 친구예요.` };
  if (existing && existing.userId === user.id) {
    return { error: `${target.nickname}님에게 이미 친구 요청을 보냈어요.` };
  }
  if (existing) {
    // 상대가 먼저 보낸 요청이 있으면 서로 원한 것 — 바로 수락
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted" } });
    revalidatePath("/world");
    return { ok: `${target.nickname}님과 친구가 되었어요! 🎉` };
  }

  await prisma.friendship.create({ data: { userId: user.id, friendId: target.id } });
  revalidatePath("/world");
  return { ok: `${target.nickname}님에게 친구 요청을 보냈어요.` };
}

// ── 친구 요청 수락/거절 ──
export async function respondFriendRequest(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const id = String(formData.get("id") ?? "").trim();
  const accept = String(formData.get("accept") ?? "") === "1";
  const request = await prisma.friendship.findUnique({
    where: { id },
    include: { user: { select: { nickname: true } } },
  });
  if (!request || request.friendId !== user.id || request.status !== "pending") {
    return { error: "요청을 찾지 못했어요." };
  }

  if (accept) {
    await prisma.friendship.update({ where: { id }, data: { status: "accepted" } });
    revalidatePath("/world");
    return { ok: `${request.user.nickname}님과 친구가 되었어요! 🎉` };
  }
  await prisma.friendship.delete({ where: { id } });
  revalidatePath("/world");
  return { ok: "요청을 거절했어요." };
}

// ── 친구 삭제 — 서로의 목록에서 제거, 걸려 있던 집 초대도 정리 ──
export async function removeFriend(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const friendId = String(formData.get("friendId") ?? "").trim();
  if (!friendId) return { error: "대상을 찾지 못했어요." };

  await prisma.$transaction([
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: user.id, friendId },
          { userId: friendId, friendId: user.id },
        ],
      },
    }),
    prisma.houseInvite.deleteMany({
      where: {
        OR: [
          { fromId: user.id, toId: friendId },
          { fromId: friendId, toId: user.id },
        ],
      },
    }),
  ]);
  revalidatePath("/world");
  return { ok: "친구를 삭제했어요." };
}

// ── 집 초대 — 친구만 집에 초대할 수 있어요! ──
export async function inviteToHouse(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const toId = String(formData.get("friendId") ?? "").trim();
  if (!toId) return { error: "초대할 친구를 찾지 못했어요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { houseTier: true, housingJson: true },
  });
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  if (housing.owned.length === 0) return { error: "초대할 집이 없어요. 먼저 집을 구매해주세요." };

  if (!(await areFriends(user.id, toId))) {
    return { error: "친구만 집에 초대할 수 있어요!" };
  }

  const friend = await prisma.user.findUnique({ where: { id: toId }, select: { nickname: true } });
  if (!friend) return { error: "초대할 친구를 찾지 못했어요." };

  await prisma.houseInvite.upsert({
    where: { fromId_toId: { fromId: user.id, toId } },
    create: { fromId: user.id, toId },
    update: { createdAt: new Date() },
  });
  revalidatePath("/world");
  return { ok: `${friend.nickname}님을 집으로 초대했어요. 상대가 수락하면 놀러 옵니다.` };
}

// ── 집 초대 수락/거절 — 수락하면 친구 집으로 이동 ──
export async function respondHouseInvite(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const id = String(formData.get("id") ?? "").trim();
  const accept = String(formData.get("accept") ?? "") === "1";
  const invite = await prisma.houseInvite.findUnique({
    where: { id },
    include: { from: { select: { id: true, nickname: true } } },
  });
  if (!invite || invite.toId !== user.id) return { error: "초대를 찾지 못했어요." };

  if (!accept) {
    await prisma.houseInvite.delete({ where: { id } });
    revalidatePath("/world");
    return { ok: "초대를 거절했어요." };
  }

  // 초대한 쪽이 여전히 친구이고 집을 보유 중인지 확인
  if (!(await areFriends(user.id, invite.fromId))) {
    await prisma.houseInvite.delete({ where: { id } });
    return { error: "친구만 집에 초대할 수 있어요! (친구 관계가 아니에요)" };
  }
  const ownerSheet = await prisma.characterSheet.findUnique({
    where: { userId: invite.fromId },
    select: { houseTier: true, housingJson: true },
  });
  const ownerHousing = parseHousingState(ownerSheet?.housingJson, ownerSheet?.houseTier);
  const tier = houseOption(ownerHousing.owned[0])?.tier ?? null;
  if (!tier) {
    await prisma.houseInvite.delete({ where: { id } });
    return { error: "초대한 친구가 지금은 집을 보유하고 있지 않아요." };
  }

  const mySheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });
  if (!mySheet?.locationId) return { error: "월드에 입장한 뒤 수락할 수 있어요." };

  const dest = homeLocationId(invite.fromId, tier);
  await prisma.$transaction([
    prisma.characterSheet.update({
      where: { userId: user.id },
      data: { locationId: dest, enteredAt: new Date() },
    }),
    prisma.houseInvite.delete({ where: { id } }),
    prisma.riftMember.deleteMany({ where: { userId: user.id } }),
  ]);
  if (!isHomeLocationId(mySheet.locationId)) {
    await postSystem(mySheet.locationId, `📤 ${user.nickname}님이 자리를 떠났습니다.`);
  }
  await postSystem(dest, `📥 ${user.nickname}님이 놀러 왔습니다!`);
  revalidatePath("/world");
  return { ok: `${invite.from.nickname}님의 집에 놀러 왔어요!` };
}

// ── 방명록 — 친구 집에 방문 중일 때 글 남기기 (주인이 방명록대를 둔 경우) ──
export async function writeGuestbook(
  _prev: FriendState,
  formData: FormData,
): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const content = String(formData.get("content") ?? "").trim();
  if (!content) return { error: "내용을 입력해주세요." };
  if (content.length > 200) return { error: "방명록은 200자 이내로 남겨주세요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true },
  });
  const ownerId = homeOwnerFromLocationId(sheet?.locationId);
  if (!ownerId) return { error: "집에 방문 중일 때만 방명록을 남길 수 있어요." };
  if (ownerId === user.id) return { error: "본인 집 방명록에는 글을 남길 수 없어요." };

  const ownerSheet = await prisma.characterSheet.findUnique({
    where: { userId: ownerId },
    select: { houseTier: true, housingJson: true, achStatsJson: true },
  });
  const ownerHousing = parseHousingState(ownerSheet?.housingJson, ownerSheet?.houseTier);
  if (!hasFurnitureEffect(ownerHousing, "guestbook")) {
    return { error: "이 집에는 방명록대가 없어요." };
  }

  // 하루 1회 (같은 집, KST 기준)
  const kstDayStart = new Date();
  kstDayStart.setTime(kstDayStart.getTime() + 9 * 3600_000);
  kstDayStart.setUTCHours(0, 0, 0, 0);
  kstDayStart.setTime(kstDayStart.getTime() - 9 * 3600_000);
  const already = await prisma.houseGuestbook.findFirst({
    where: { ownerId, authorId: user.id, createdAt: { gte: kstDayStart } },
    select: { id: true },
  });
  if (already) return { error: "오늘은 이미 이 집 방명록을 남겼어요." };

  await prisma.$transaction([
    prisma.houseGuestbook.create({ data: { ownerId, authorId: user.id, content } }),
    prisma.characterSheet.updateMany({
      where: { userId: ownerId },
      data: { achStatsJson: bumpStat(ownerSheet?.achStatsJson, "방문록수") },
    }),
  ]);
  void checkAndGrant(ownerId);
  revalidatePath("/world");
  return { ok: "📖 방명록에 글을 남겼어요!" };
}
