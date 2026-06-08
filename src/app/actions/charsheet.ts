"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { fetchSheetByTab, isValidTabName } from "@/lib/charsheet";
import { parseGoldToInt } from "@/lib/dice";

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

  // 기존 라이브 상태 보존 여부 확인 (첫 연동이면 시트값으로 초기화)
  const existing = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { curHp: true },
  });
  const live =
    existing && existing.curHp != null
      ? {} // 이미 진행 중 → 현재 HP/골드 유지
      : { curHp: parsed.hp, curMp: parsed.mp, curGold: parseGoldToInt(parsed.gold) };

  const data = {
    sheetTab: tab,
    charClass: parsed.charClass,
    race: parsed.race,
    attribute: parsed.attribute,
    level: parsed.level,
    hp: parsed.hp, // 최대치 기준값
    mp: parsed.mp,
    fate: parsed.fate,
    gold: parsed.gold,
    statsJson: JSON.stringify(parsed.stats),
    syncedAt: new Date(),
    ...live,
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
