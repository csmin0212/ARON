"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import { CARD_STYLE_MAP, parseOwnedSkins, type ProfileCardStyle } from "@/lib/profileCard";

export type SkinPurchaseState =
  | { ok: true; skin: ProfileCardStyle; gold: number; owned: ProfileCardStyle[] }
  | { error: string }
  | undefined;

// 카드 스킨 구매 — 골드 8000 차감 후 소유(ownedCardSkinsJson)에 추가.
export async function purchaseCardSkin(skin: string): Promise<SkinPurchaseState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const meta = CARD_STYLE_MAP[skin as ProfileCardStyle];
  if (!meta) return { error: "존재하지 않는 스킨이에요." };
  if (meta.acquire !== "purchase") {
    return { error: meta.acquire === "reward" ? "보상으로만 얻을 수 있어요." : "구매할 수 없는 스킨이에요." };
  }

  const owned = parseOwnedSkins(user.ownedCardSkinsJson);
  if (owned.includes(meta.key)) return { error: "이미 보유한 스킨이에요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { sheetTab: true, curGold: true, invJson: true },
  });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };
  const gold = sheet.curGold ?? 0;
  if (gold < meta.price) {
    return {
      error: `골드가 부족해요. (보유 ${gold.toLocaleString()} / 필요 ${meta.price.toLocaleString()}G)`,
    };
  }

  const nextGold = gold - meta.price;
  let invJson = sheet.invJson;
  try {
    if (invJson) {
      const inv = JSON.parse(invJson) as { gold?: string };
      inv.gold = `${nextGold}G`;
      invJson = JSON.stringify(inv);
    }
  } catch {
    /* invJson 손상 시 골드 미러만 건너뜀 */
  }

  const nextOwned = [...owned, meta.key];
  await prisma.$transaction([
    prisma.characterSheet.update({
      where: { userId: user.id },
      data: { curGold: nextGold, gold: `${nextGold}G`, ...(invJson ? { invJson } : {}) },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { ownedCardSkinsJson: JSON.stringify(nextOwned) },
    }),
  ]);
  void enqueueSheetGoldSync(user.id);

  revalidatePath("/profile");
  return { ok: true, skin: meta.key, gold: nextGold, owned: nextOwned };
}
