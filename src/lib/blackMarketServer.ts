import "server-only";

import { prisma } from "@/lib/prisma";
import { kstDayKey } from "@/lib/world";
import { getActiveItems, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { fetchSkillbookPool } from "@/lib/guildQuestsServer";
import {
  buildBlackMarketStock,
  parseBlackMarketQuestState,
  refreshBlackMarketQuestState,
  type BlackMarketQuestState,
  type BlackMarketStockItem,
} from "@/lib/blackMarket";

function rowToStock(row: {
  id: string;
  day: string;
  slot: string;
  kind: string;
  itemName: string;
  rank: number;
  price: number;
  stock: number;
  initialStock: number;
  meta: string | null;
}): BlackMarketStockItem {
  return {
    id: row.id,
    day: row.day,
    slot: row.slot,
    kind: row.kind as LifeSkillKind | "스킬북",
    itemName: row.itemName,
    rank: row.rank,
    price: row.price,
    stock: row.stock,
    initialStock: row.initialStock,
    meta: row.meta,
  };
}

async function generateTodayStock(day: string): Promise<BlackMarketStockItem[]> {
  await loadLifeItems();
  const lifeCandidates = (["낚시", "채집", "채광"] as const).flatMap((kind) =>
    getActiveItems(kind)
      .filter((item) => item.rank >= 3 && item.rank <= 5)
      .map((item) => ({ kind, item })),
  );
  const skillbooks = (await fetchSkillbookPool())
    .filter((book) => book.num % 4 === 1)
    .map((book) => ({
      itemId: book.itemId,
      skillName: book.skillName,
    }));
  return buildBlackMarketStock(day, lifeCandidates, skillbooks);
}

export async function ensureBlackMarketStock(day = kstDayKey(new Date())): Promise<BlackMarketStockItem[]> {
  const existing = await prisma.blackMarketListing.findMany({
    where: { day },
    orderBy: { slot: "asc" },
  });
  if (existing.length > 0) return existing.map(rowToStock);

  const stock = await generateTodayStock(day);
  if (stock.length > 0) {
    await prisma.blackMarketListing.createMany({
      data: stock,
      skipDuplicates: true,
    });
  }
  const rows = await prisma.blackMarketListing.findMany({
    where: { day },
    orderBy: { slot: "asc" },
  });
  return rows.map(rowToStock);
}

export async function forceResetBlackMarketStock(day = kstDayKey(new Date())): Promise<BlackMarketStockItem[]> {
  await prisma.blackMarketListing.deleteMany({ where: { day } });
  const stock = await generateTodayStock(day);
  if (stock.length > 0) {
    await prisma.blackMarketListing.createMany({ data: stock });
  }
  return stock;
}

export async function loadBlackMarketQuestState(
  userId: string,
  sheet: { blackMarketQuestJson: string | null },
): Promise<BlackMarketQuestState> {
  const state = parseBlackMarketQuestState(sheet.blackMarketQuestJson);
  if (refreshBlackMarketQuestState(state)) {
    await prisma.characterSheet.update({
      where: { userId },
      data: { blackMarketQuestJson: JSON.stringify(state) },
    });
  }
  return state;
}
