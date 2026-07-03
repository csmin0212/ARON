import "server-only";

import { prisma } from "@/lib/prisma";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { normalizeAdventurerRank } from "@/lib/adventurerRank";
import {
  parseGuildQuestState,
  refreshGuildQuestState,
  skillbookNumber,
  type GuildQuestState,
  type RecipePoolEntry,
} from "@/lib/guildQuests";

function recipeRankToNum(rank: string): number {
  const m = rank.toUpperCase().match(/R?\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

// 공개 레시피 → 의뢰 후보 (납품 대상은 결과 요리 이름)
export async function fetchRecipePool(): Promise<RecipePoolEntry[]> {
  const recipes = await prisma.cookingRecipe.findMany({
    where: { isPublic: true },
    select: { resultName: true, rank: true, sellPrice: true },
  });
  return recipes.map((recipe) => ({
    name: recipe.resultName,
    rank: recipeRankToNum(recipe.rank),
    sellPrice: recipe.sellPrice,
  }));
}

// 상태 로드 + 일일/주간 lazy 리셋 (변경 시 저장). 페이지·액션 공용.
export async function loadGuildQuestState(
  userId: string,
  sheet: { guildQuestJson: string | null; adventurerRank: string | null },
): Promise<{ state: GuildQuestState; rank: string }> {
  const rank = normalizeAdventurerRank(sheet.adventurerRank);
  await loadLifeItems();
  const state = parseGuildQuestState(sheet.guildQuestJson);
  const recipes = await fetchRecipePool();
  if (refreshGuildQuestState(state, rank, recipes)) {
    await prisma.characterSheet.update({
      where: { userId },
      data: { guildQuestJson: JSON.stringify(state) },
    });
  }
  return { state, rank };
}

// 뽑기 풀 — 전투스킬 탭에 정의된 스킬북 번호 + 스킬 이름/직업
export async function fetchSkillbookPool(): Promise<
  { num: number; itemId: string; skillName: string; job: string | null }[]
> {
  const skills = await prisma.combatSkill.findMany({
    where: { sourceItem: { startsWith: "스킬북" } },
    select: { sourceItem: true, name: true, job: true },
  });
  const out: { num: number; itemId: string; skillName: string; job: string | null }[] = [];
  for (const skill of skills) {
    const num = skillbookNumber(skill.sourceItem);
    if (num == null) continue;
    out.push({ num, itemId: `스킬북${num}`, skillName: skill.name, job: skill.job });
  }
  return out;
}
