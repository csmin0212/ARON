"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseLifeState } from "@/lib/lifeSkillPerks";

export type LifeActionState = { error?: string; ok?: string } | undefined;

// 레벨업 특성 선택 — 대기열의 첫 선택지에서 optionIndex 를 고른다
export async function chooseLifePerk(
  _prev: LifeActionState,
  formData: FormData,
): Promise<LifeActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const optionIndex = Number(formData.get("option"));
  if (!Number.isInteger(optionIndex) || optionIndex < 0)
    return { error: "잘못된 선택이에요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet) return { error: "캐릭터 시트를 먼저 연동해주세요." };

  const life = parseLifeState(sheet.lifeJson);
  const choice = life.pending[0];
  if (!choice) return { error: "선택할 특성이 없어요." };

  const picked = choice.options[optionIndex];
  if (!picked) return { error: "잘못된 선택이에요." };

  life.pending.shift();
  life.perks.push({ ...picked, kind: choice.kind });

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { lifeJson: JSON.stringify(life) },
  });

  revalidatePath(`/u/${user.username}`);
  return { ok: `[${picked.rarity}] ${picked.name} 특성을 익혔다!` };
}
