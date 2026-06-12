"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { fetchSheetByTab, isValidTabName } from "@/lib/charsheet";
import { parseGoldToInt } from "@/lib/dice";
import { readSheetInventory, type SheetInventory, type SheetInventoryItem } from "@/lib/googleSheets";

export type SheetState = { error?: string; ok?: boolean } | undefined;

function mergeSheetItems(items: SheetInventoryItem[]): { itemId: string; qty: number }[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    const itemId = item.name.trim();
    if (!itemId || item.qty <= 0) continue;
    merged.set(itemId, (merged.get(itemId) ?? 0) + item.qty);
  }
  return [...merged.entries()].map(([itemId, qty]) => ({ itemId, qty }));
}

async function syncDbInventoryFromSheet(userId: string, inventory: SheetInventory): Promise<void> {
  const entries = mergeSheetItems(inventory.items);
  const itemIds = entries.map((entry) => entry.itemId);

  await prisma.inventoryEntry.deleteMany({
    where: {
      userId,
      meta: null,
      ...(itemIds.length > 0 ? { itemId: { notIn: itemIds } } : {}),
    },
  });

  for (const entry of entries) {
    const existing = await prisma.inventoryEntry.findMany({
      where: { userId, itemId: entry.itemId, meta: null },
      orderBy: { updatedAt: "desc" },
    });
    const [keep, ...duplicates] = existing;
    if (keep) {
      await prisma.inventoryEntry.update({
        where: { id: keep.id },
        data: { qty: entry.qty },
      });
      if (duplicates.length > 0) {
        await prisma.inventoryEntry.deleteMany({
          where: { id: { in: duplicates.map((item) => item.id) } },
        });
      }
    } else {
      await prisma.inventoryEntry.create({
        data: { userId, itemId: entry.itemId, qty: entry.qty },
      });
    }
  }
}

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

  const inventory = await readSheetInventory(tab);
  const existing = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { curHp: true },
  });

  const live =
    existing && existing.curHp != null
      ? inventory?.gold
        ? { curGold: parseGoldToInt(inventory.gold) }
        : {}
      : {
          curHp: parsed.hp,
          curMp: parsed.mp,
          curGold: parseGoldToInt(inventory?.gold ?? parsed.gold),
        };

  const data = {
    sheetTab: tab,
    charClass: parsed.charClass,
    race: parsed.race,
    attribute: parsed.attribute,
    level: parsed.level,
    hp: parsed.hp,
    mp: parsed.mp,
    fate: parsed.fate,
    gold: inventory?.gold ?? parsed.gold,
    statsJson: JSON.stringify(parsed.stats),
    invJson: inventory ? JSON.stringify(inventory) : undefined,
    syncedAt: new Date(),
    ...live,
  };

  await prisma.characterSheet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  if (inventory) await syncDbInventoryFromSheet(user.id, inventory);

  revalidatePath("/profile");
  revalidatePath("/world");
  return { ok: true };
}

export async function syncSheetInventory(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { sheetTab: true },
  });
  if (!sheet?.sheetTab) return;

  const inventory = await readSheetInventory(sheet.sheetTab);
  if (!inventory) return;

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      invJson: JSON.stringify(inventory),
      curGold: parseGoldToInt(inventory.gold),
      gold: inventory.gold,
      syncedAt: new Date(),
    },
  });
  await syncDbInventoryFromSheet(user.id, inventory);

  revalidatePath("/profile");
  revalidatePath("/world");
}

export async function unlinkSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.characterSheet.deleteMany({ where: { userId: user.id } });
  revalidatePath("/profile");
  revalidatePath("/world");
}
