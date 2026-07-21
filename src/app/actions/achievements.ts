"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant, markStat } from "@/lib/achievements";
import { parseHousingState } from "@/lib/housing";
import { parseFeaturedAchievementIds, uniqueFeaturedAchievementIds } from "@/lib/profile";

// 달성한 업적의 칭호·배지를 대표로 장착
export async function equipAchievement(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const achId = String(formData.get("achId") ?? "").trim();
  if (!achId) return;
  const slotRaw = Number.parseInt(String(formData.get("slot") ?? "0"), 10);
  const slot = Number.isFinite(slotRaw) ? Math.min(2, Math.max(0, slotRaw)) : 0;

  const earned = await prisma.userAchievement.findUnique({
    where: { userId_achId: { userId: user.id, achId } },
  });
  if (!earned) return;
  const ach = await prisma.achievement.findUnique({
    where: { id: achId },
    select: { rewardTitle: true, badge: true },
  });
  if (!ach) return;

  const current = parseFeaturedAchievementIds(user.featuredAchievementsJson);
  const withoutDuplicate = current.filter((id) => id !== achId);
  withoutDuplicate[slot] = achId;
  const nextFeatured = uniqueFeaturedAchievementIds(withoutDuplicate);
  const mainAch =
    nextFeatured[0] === achId
      ? ach
      : nextFeatured.length > 0
        ? await prisma.achievement.findUnique({
            where: { id: nextFeatured[0] },
            select: { rewardTitle: true, badge: true },
          })
        : null;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      featuredAchievementsJson: JSON.stringify(nextFeatured),
      equippedTitle: mainAch?.rewardTitle ?? null,
      equippedBadge: mainAch?.badge ?? null,
    },
  });
  // '대표 배지 n개' 업적용 — 장착해 본 배지를 업적 단위로 누적 기록.
  // 집 보유자라면 '전시횟수'도 함께 — 배지·칭호를 내걸어 집에 전시한 것으로 인정.
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { achStatsJson: true, housingJson: true, houseTier: true },
  });
  if (sheet) {
    let achStats = sheet.achStatsJson;
    if (ach.badge) achStats = markStat(achStats, `배지장착:${achId}`);
    const housing = parseHousingState(sheet.housingJson, sheet.houseTier);
    if (housing.owned.length > 0 && (ach.badge || ach.rewardTitle)) {
      achStats = bumpStat(achStats, "전시횟수");
    }
    if (achStats !== sheet.achStatsJson) {
      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { achStatsJson: achStats },
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
    data: { featuredAchievementsJson: JSON.stringify([]), equippedTitle: null, equippedBadge: null },
  });
  revalidatePath("/profile");
  revalidatePath(`/u/${encodeURIComponent(user.username)}`);
}
