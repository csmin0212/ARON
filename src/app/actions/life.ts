"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseLifeState, perkIdentityKey } from "@/lib/lifeSkillPerks";

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
  if (life.perks.some((perk) => perkIdentityKey(perk) === perkIdentityKey(picked))) {
    return { error: `[${picked.rarity}] ${picked.name} 특성은 이미 익혔어요.` };
  }

  life.pending.shift();
  life.perks.push({ ...picked, kind: choice.kind });

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { lifeJson: JSON.stringify(life) },
  });

  revalidatePath(`/u/${user.username}`);
  return { ok: `[${picked.rarity}] ${picked.name} 특성을 익혔다!` };
}

// 세션 버프 지우기 — "시나리오 종료 시까지 지속" 요리는 만료 시각이 없어서
// 한 번 먹으면 영구히 남는다. 세션이 끝났는지는 시스템이 알 수 없으니
// 플레이어가 직접 내리게 한다. usedAt + source 로 그 한 줄만 찾는다.
export async function clearSessionBuff(
  _prev: LifeActionState,
  formData: FormData,
): Promise<LifeActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const usedAt = String(formData.get("usedAt") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  if (!usedAt) return { error: "지울 버프를 찾지 못했어요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet) return { error: "캐릭터 시트를 먼저 연동해주세요." };

  const life = parseLifeState(sheet.lifeJson);
  const before = life.cookingBuffs.session.length;
  let removed = false;
  life.cookingBuffs.session = life.cookingBuffs.session.filter((buff) => {
    if (removed) return true; // 같은 요리를 두 번 먹었어도 한 줄만 지운다
    const hit = buff.usedAt === usedAt && (!source || buff.source === source);
    if (hit) removed = true;
    return !hit;
  });
  if (life.cookingBuffs.session.length === before) return { error: "이미 지워진 버프예요." };

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { lifeJson: JSON.stringify(life) },
  });
  revalidatePath("/profile");
  revalidatePath("/world");
  return { ok: `${source || "세션 버프"}를 내렸어요.` };
}
