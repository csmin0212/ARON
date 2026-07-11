"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkAndGrant, markStat } from "@/lib/achievements";

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
  // '대표 배지 n개' 업적용 — 장착해 본 배지를 업적 단위로 누적 기록
  if (ach.badge) {
    const sheet = await prisma.characterSheet.findUnique({
      where: { userId: user.id },
      select: { achStatsJson: true },
    });
    if (sheet) {
      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { achStatsJson: markStat(sheet.achStatsJson, `배지장착:${achId}`) },
      });
    }
  }
  void checkAndGrant(user.id);
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
