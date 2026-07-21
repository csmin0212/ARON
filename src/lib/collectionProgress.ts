import { prisma } from "@/lib/prisma";
import { getAlchemyRecipes, getCookingRecipes } from "@/lib/gameCatalog";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import { collectionItems } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";

export interface CollectionProgressRow {
  emoji: string;
  label: string;
  pct: number;
}

function pct(found: number, total: number): number {
  return total > 0 ? Math.round((found / total) * 100) : 0;
}

// 유저의 도감 완성률(업적·낚시·채집·채광·요리·포션)을 % 로 계산.
// /u 페이지의 도감 탭과 같은 판정 기준을 위젯용으로 경량화한 것.
export async function computeCollectionProgress(
  userId: string,
  sheet: { lifeJson?: string | null } | null | undefined,
): Promise<CollectionProgressRow[]> {
  const [achTotal, achEarned, recipes, alchemy, discoveredRecipes] = await Promise.all([
    prisma.achievement.count(),
    prisma.userAchievement.count({ where: { userId } }),
    getCookingRecipes(),
    getAlchemyRecipes(),
    prisma.userRecipe.findMany({ where: { userId }, select: { recipeId: true } }),
  ]);

  const life = parseLifeState(sheet?.lifeJson);
  await loadLifeItems();
  const entries = collectionItems(false);
  const discoveredRecipeIds = new Set(discoveredRecipes.map((r) => r.recipeId));

  const lifeRow = (kind: "낚시" | "채집" | "채광", emoji: string): CollectionProgressRow => {
    const group = entries.filter((e) => e.kind === kind);
    const found = group.filter((e) => life.collection[kind].includes(e.item.name)).length;
    return { emoji, label: kind, pct: pct(found, group.length) };
  };

  const cookingFound = recipes.filter(
    (r) => r.isPublic || discoveredRecipeIds.has(r.id),
  ).length;
  const potionFound = alchemy.filter((r) => life.alchemyPerfect.includes(r.id)).length;

  return [
    { emoji: "🏅", label: "업적", pct: pct(achEarned, achTotal) },
    lifeRow("낚시", "🎣"),
    lifeRow("채집", "🌿"),
    lifeRow("채광", "⛏️"),
    { emoji: "🍳", label: "요리", pct: pct(cookingFound, recipes.length) },
    { emoji: "⚗️", label: "포션", pct: pct(potionFound, alchemy.length) },
  ];
}
