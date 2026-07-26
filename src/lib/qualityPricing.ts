import "server-only";

import { prisma } from "@/lib/prisma";
import {
  WEAK_PRICE_MULT,
  alchemyAcceleratorMinutes,
  customPotionSellPrice,
  isCustomAlchemyPotionName,
  parsePotionName,
} from "@/lib/alchemy";
import { lifeSkillItemKind, lifeSkillSellPrice } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";

export type RecipeIngredient = { name: string; qty: number };

const BASIC_INGREDIENT_BUY_PRICE = new Map<string, number>([
  ["달걀", 10],
  ["우유", 10],
  ["고기", 10],
  ["채소", 10],
  ["과일", 10],
  ["물", 5],
  ["밀", 20],
  ["소금", 30],
  ["향신료", 50],
  ["치즈", 50],
]);

const PROFIT_MULTIPLIER_BY_GRADE = new Map<string, number>([
  ["고품질", 1.2],
  ["고급", 1.2],
  ["명품", 1.5],
  ["장인", 2],
]);

export function qualityProfitMultiplier(grade: string | null | undefined): number {
  if (!grade) return 1;
  return PROFIT_MULTIPLIER_BY_GRADE.get(grade) ?? 1;
}

export function profitAdjustedSellPrice(
  baseSellPrice: number,
  cost: number,
  grade: string | null | undefined,
): number {
  const multiplier = qualityProfitMultiplier(grade);
  if (multiplier === 1) return Math.max(1, Math.round(baseSellPrice));
  const profit = Math.max(0, baseSellPrice - cost);
  return Math.max(1, Math.round(baseSellPrice) + Math.ceil(profit * (multiplier - 1)));
}

export function parseRecipeIngredientsForCost(value: string | null | undefined): RecipeIngredient[] {
  try {
    return value ? (JSON.parse(value) as RecipeIngredient[]) : [];
  } catch {
    return [];
  }
}

function normalize(name: string): string {
  return name.trim();
}

async function ingredientUnitPriceMap(names: Iterable<string>): Promise<Map<string, number>> {
  await loadLifeItems();
  const uniqueNames = [...new Set([...names].map(normalize).filter(Boolean))];
  const prices = new Map<string, number>();

  for (const name of uniqueNames) {
    const basic = BASIC_INGREDIENT_BUY_PRICE.get(name);
    if (basic != null) {
      prices.set(name, basic);
      continue;
    }
    const kind = lifeSkillItemKind(name);
    if (kind) {
      prices.set(name, lifeSkillSellPrice(kind, name));
    }
  }

  const missing = uniqueNames.filter((name) => !prices.has(name));
  if (missing.length > 0) {
    const rows = await prisma.item.findMany({
      where: { OR: [{ id: { in: missing } }, { name: { in: missing } }] },
      select: { id: true, name: true, sellPrice: true, buyPrice: true },
    });
    for (const row of rows) {
      const price = row.sellPrice && row.sellPrice > 0
        ? row.sellPrice
        : row.buyPrice && row.buyPrice > 0
          ? row.buyPrice
          : 0;
      prices.set(row.id, price);
      prices.set(row.name, price);
    }
  }

  for (const name of uniqueNames) {
    if (!prices.has(name)) prices.set(name, 0);
  }
  return prices;
}

export async function recipeIngredientCost(ingredients: RecipeIngredient[]): Promise<number> {
  const unitPrices = await ingredientUnitPriceMap(ingredients.map((item) => item.name));
  return ingredients.reduce((sum, item) => {
    const name = normalize(item.name);
    return sum + (unitPrices.get(name) ?? 0) * Math.max(0, item.qty);
  }, 0);
}

export async function recipeIngredientCostFromJson(value: string | null | undefined): Promise<number> {
  return recipeIngredientCost(parseRecipeIngredientsForCost(value));
}

export async function potionSellPrice(
  rawName: string,
  effectText?: string | null,
): Promise<number | null> {
  const { base, modifier, grade } = parsePotionName(rawName);
  if (isCustomAlchemyPotionName(rawName)) {
    return customPotionSellPrice(effectText);
  }
  const recipe = await prisma.alchemyRecipe.findFirst({
    where: { resultName: base },
    select: { sellPrice: true, ingredientsJson: true },
  });
  if (!recipe) return null;

  const acceleratorMinutes = alchemyAcceleratorMinutes(rawName, effectText);
  if (acceleratorMinutes != null) {
    return Math.round((recipe.sellPrice * acceleratorMinutes) / 10);
  }

  const baseSellPrice = Math.round(recipe.sellPrice * (modifier === "약한" ? WEAK_PRICE_MULT : 1));
  return profitAdjustedSellPrice(
    baseSellPrice,
    await recipeIngredientCostFromJson(recipe.ingredientsJson),
    grade,
  );
}

export async function recipeCostMap<T extends { resultName: string; ingredientsJson: string | null }>(
  recipes: T[],
): Promise<Map<string, number>> {
  const parsed = recipes.map((recipe) => ({
    resultName: recipe.resultName,
    ingredients: parseRecipeIngredientsForCost(recipe.ingredientsJson),
  }));
  const unitPrices = await ingredientUnitPriceMap(
    parsed.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.name)),
  );
  return new Map(
    parsed.map((recipe) => [
      recipe.resultName,
      recipe.ingredients.reduce((sum, item) => {
        const name = normalize(item.name);
        return sum + (unitPrices.get(name) ?? 0) * Math.max(0, item.qty);
      }, 0),
    ]),
  );
}
