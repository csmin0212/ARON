"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";

function parseRecipeIngredients(value: string): { name: string; qty: number }[] {
  try {
    const arr = JSON.parse(value) as { name: string; qty: number }[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 레시피 가챠 — 골드로 랜덤 레시피를 뽑아 개인 발견(UserRecipe)에 추가.
// 별등급 확률: 1★ 50% / 2★ 35% / 3★ 15%. 중복은 그냥 아쉬움(지급 없음).
// 고급 가챠(4★+)는 현재 잠금. 풀 = 공개 아닌 수집형 레시피만(공개는 기본 제공).

const GACHA_COST_PER_DRAW = 50;

export type GachaDraw = {
  id: string;
  name: string;
  resultName: string;
  category: string;
  stars: number; // 1~3
  isNew: boolean; // false = 중복(아쉬움)
  ingredients: string | null; // 신규만 재료 공개(레시피를 배웠다)
};

export type GachaState =
  | { ok: true; draws: GachaDraw[]; spent: number; gold: number; newCount: number }
  | { error: string }
  | undefined;

const rankNum = (rank: string): number => {
  const m = String(rank).match(/R\s*(\d+)/i);
  return m ? Number.parseInt(m[1], 10) : 1;
};

// 1★ 50 / 2★ 35 / 3★ 15
function rollStar(): number {
  const r = Math.random() * 100;
  if (r < 50) return 1;
  if (r < 85) return 2;
  return 3;
}

export async function drawRecipeGacha(count: number): Promise<GachaState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const n = count === 10 ? 10 : 1;
  const cost = GACHA_COST_PER_DRAW * n;

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { sheetTab: true, curGold: true, invJson: true },
  });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };
  const gold = sheet.curGold ?? 0;
  if (gold < cost) {
    return { error: `골드가 부족해요. (보유 ${gold.toLocaleString()} / 필요 ${cost.toLocaleString()}G)` };
  }

  // 수집형 레시피 풀 (공개=기본 제공이라 제외). 1★=R0~1, 2★=R2, 3★=R3~
  const all = await prisma.cookingRecipe.findMany({
    where: { isPublic: false },
    select: { id: true, name: true, resultName: true, category: true, rank: true, ingredientsJson: true },
  });
  if (all.length === 0) return { error: "아직 뽑을 수 있는 레시피가 없어요. (수집형 레시피 미등록)" };
  const bucket = (star: number) =>
    all.filter((r) => {
      const rk = rankNum(r.rank);
      return star === 1 ? rk <= 1 : star === 2 ? rk === 2 : rk >= 3;
    });

  const owned = new Set(
    (await prisma.userRecipe.findMany({ where: { userId: user.id }, select: { recipeId: true } })).map(
      (u) => u.recipeId,
    ),
  );

  const draws: GachaDraw[] = [];
  const toGrant: string[] = [];
  for (let i = 0; i < n; i++) {
    let star = rollStar();
    let pool = bucket(star);
    while (pool.length === 0 && star > 1) {
      star -= 1;
      pool = bucket(star);
    }
    if (pool.length === 0) pool = all; // 극단 폴백
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const isNew = !owned.has(pick.id);
    if (isNew) {
      owned.add(pick.id);
      toGrant.push(pick.id);
    }
    const pickStar = rankNum(pick.rank) <= 1 ? 1 : rankNum(pick.rank) === 2 ? 2 : 3;
    draws.push({
      id: pick.id,
      name: pick.name,
      resultName: pick.resultName,
      category: pick.category,
      stars: pickStar,
      isNew,
      ingredients: isNew
        ? parseRecipeIngredients(pick.ingredientsJson)
            .map((ing) => `${ing.name}x${ing.qty}`)
            .join(", ")
        : null,
    });
  }

  if (toGrant.length > 0) {
    await prisma.userRecipe.createMany({
      data: toGrant.map((rid) => ({ userId: user.id, recipeId: rid })),
      skipDuplicates: true,
    });
  }

  const nextGold = gold - cost;
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
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { curGold: nextGold, gold: `${nextGold}G`, ...(invJson ? { invJson } : {}) },
  });
  void enqueueSheetGoldSync(user.id);

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: true, draws, spent: cost, gold: nextGold, newCount: toGrant.length };
}
