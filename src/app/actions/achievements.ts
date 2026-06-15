"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// 달성한 업적의 칭호·배지를 대표로 장착
export async function equipAchievement(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const achId = String(formData.get("achId") ?? "").trim();
  if (!achId) return;

  const earned = await prisma.userAchievement.findUnique({
    where: { userId_achId: { userId: user.id, achId } },
  });
  if (!earned) return;
  const ach = await prisma.achievement.findUnique({
    where: { id: achId },
    select: { rewardTitle: true, badge: true },
  });
  if (!ach) return;

  await prisma.user.update({
    where: { id: user.id },
    data: { equippedTitle: ach.rewardTitle ?? null, equippedBadge: ach.badge ?? null },
  });
  revalidatePath("/profile");
  revalidatePath(`/u/${encodeURIComponent(user.username)}`);
}

// 대표 칭호·배지 해제
export async function unequipAchievement(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: { equippedTitle: null, equippedBadge: null },
  });
  revalidatePath("/profile");
  revalidatePath(`/u/${encodeURIComponent(user.username)}`);
}
