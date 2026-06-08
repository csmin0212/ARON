"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rollDice } from "@/lib/dice";
import type { StatEntry } from "@/lib/charsheet";

export type RollResult = {
  label: string;
  dice: number[];
  modifier: number;
  total: number;
  dc: number | null;
  success: boolean | null;
};

export type RollResponse = RollResult | { error: string };

// 능력치 기반 2D6 판정 (서버에서 굴림 → 로그 저장)
export async function rollStat(statKey: string, dc?: number | null): Promise<RollResponse> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { statsJson: true },
  });
  if (!sheet?.statsJson) return { error: "먼저 프로필에서 캐릭터 시트를 연동해주세요." };

  let stats: StatEntry[] = [];
  try {
    stats = JSON.parse(sheet.statsJson) as StatEntry[];
  } catch {
    return { error: "능력치 정보를 읽지 못했어요. 시트를 다시 동기화해주세요." };
  }

  const stat = stats.find((s) => s.key === statKey);
  if (!stat) return { error: "해당 능력치를 찾을 수 없어요." };

  const modifier = stat.mod ?? 0;
  const dice = rollDice(2);
  const total = dice[0] + dice[1] + modifier;
  const validDc = typeof dc === "number" && dc > 0 ? dc : null;
  const success = validDc != null ? total >= validDc : null;
  const label = `${stat.label} 판정`;

  await prisma.roll.create({
    data: {
      userId: user.id,
      label,
      dice: JSON.stringify(dice),
      modifier,
      total,
      dc: validDc,
      success,
    },
  });

  revalidatePath(`/u/${user.username}`);
  return { label, dice, modifier, total, dc: validDc, success };
}
