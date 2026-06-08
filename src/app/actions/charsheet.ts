"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { fetchSheetByTab, isValidTabName } from "@/lib/charsheet";

export type SheetState = { error?: string; ok?: boolean } | undefined;

export async function syncSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const tab = String(formData.get("sheetTab") ?? "").trim();
  if (!isValidTabName(tab)) return { error: "캐릭터 탭 이름을 입력해주세요. (예: 실로)" };

  let parsed;
  try {
    parsed = await fetchSheetByTab(tab);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "시트를 불러오지 못했어요." };
  }

  const data = {
    sheetTab: tab,
    charClass: parsed.charClass,
    race: parsed.race,
    attribute: parsed.attribute,
    level: parsed.level,
    hp: parsed.hp,
    mp: parsed.mp,
    fate: parsed.fate,
    gold: parsed.gold,
    statsJson: JSON.stringify(parsed.stats),
    syncedAt: new Date(),
  };

  await prisma.characterSheet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  revalidatePath("/profile");
  return { ok: true };
}

export async function unlinkSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.characterSheet.deleteMany({ where: { userId: user.id } });
  revalidatePath("/profile");
}
