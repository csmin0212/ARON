"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { fetchAndParseSheet, isGoogleSheetUrl } from "@/lib/charsheet";

export type SheetState = { error?: string; ok?: boolean } | undefined;

export async function syncSheet(_prev: SheetState, formData: FormData): Promise<SheetState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const url = String(formData.get("sheetUrl") ?? "").trim();
  if (!isGoogleSheetUrl(url))
    return { error: "구글 스프레드시트 주소(https://docs.google.com/spreadsheets/...)를 입력해주세요." };

  let parsed;
  try {
    parsed = await fetchAndParseSheet(url);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "시트를 불러오지 못했어요." };
  }

  const data = {
    sheetUrl: url,
    charName: parsed.charName,
    charClass: parsed.charClass,
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
