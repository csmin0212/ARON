"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { MASTER_SHEET_ID, fetchSheetByTab, isValidTabName } from "@/lib/charsheet";
import { parseGoldToInt } from "@/lib/dice";
import {
  pushInventoryToSheet,
  readSheetInventory,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";

export type SheetState = { error?: string; ok?: boolean } | undefined;

// "강철 검(+1)" → "강철 검" : 강화·인첸트 꼬리표 제거
function baseItemName(name: string): string {
  return name.trim().replace(/\s*\([^()]*\)\s*$/, "").trim();
}

// 효과/중량이 비어 있는 휴대품을 아이템 탭 카탈로그로 채운다.
// 모달 '상세 효과'와 시트 '효과·해설'에 아이템 설명이 함께 나오도록 하기 위함.
// 하나라도 채워졌으면 true (시트에도 반영해야 함).
async function fillItemCatalogDetails(inventory: SheetInventory): Promise<boolean> {
  const targets = inventory.items.filter((item) => item.qty > 0 && (!item.effect || item.weight == null));
  if (targets.length === 0) return false;

  const keys = new Set<string>();
  for (const item of targets) {
    keys.add(item.name.trim());
    keys.add(baseItemName(item.name));
  }
  const catalog = await prisma.item.findMany({
    where: { OR: [{ id: { in: [...keys] } }, { name: { in: [...keys] } }] },
    select: { id: true, name: true, desc: true, weight: true },
  });
  const descByKey = new Map<string, string>();
  const weightByKey = new Map<string, number>();
  for (const entry of catalog) {
    if (entry.desc) {
      if (!descByKey.has(entry.id)) descByKey.set(entry.id, entry.desc);
      if (!descByKey.has(entry.name)) descByKey.set(entry.name, entry.desc);
    }
    if (entry.weight != null) {
      if (!weightByKey.has(entry.id)) weightByKey.set(entry.id, entry.weight);
      if (!weightByKey.has(entry.name)) weightByKey.set(entry.name, entry.weight);
    }
  }

  let changed = false;
  for (const item of targets) {
    const key = item.name.trim();
    const baseKey = baseItemName(item.name);
    const desc = descByKey.get(key) ?? descByKey.get(baseKey);
    if (!item.effect && desc) {
      item.effect = desc;
      changed = true;
    }
    const weight = weightByKey.get(key) ?? weightByKey.get(baseKey);
    if (item.weight == null && weight != null) {
      item.weight = weight;
      changed = true;
    }
  }
  return changed;
}

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

  const sheetInventory = await readSheetInventory(tab);
  const inventory = sheetInventory ?? {
    sourceSheetId: parsed.sourceSheetId,
    gold: null,
    curWeight: null,
    maxWeight: null,
    items: [],
  };
  const catalogFilled = inventory ? await fillItemCatalogDetails(inventory) : false;
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
    adventurerRank: parsed.adventurerRank ?? undefined,
    fame: parsed.fame ?? 0,
    curHp: parsed.hp,
    curMp: parsed.mp,
    curGold: parseGoldToInt(inventory?.gold ?? parsed.gold),
    statsJson: JSON.stringify(parsed.stats),
    sheetSkillsJson: JSON.stringify(parsed.skills), // SL 1+ 스킬 — 주간 수입 판정용
    invJson: inventory ? JSON.stringify(inventory) : undefined,
    syncedAt: new Date(),
  };

  await prisma.characterSheet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  if (sheetInventory) await syncDbInventoryFromSheet(user.id, sheetInventory);
  // 새로 채운 효과를 시트 효과·해설 칸에도 반영 (보강된 게 있을 때만)
  if (inventory && inventory.sourceSheetId === MASTER_SHEET_ID && catalogFilled) {
    await pushInventoryToSheet(tab, inventory);
  }

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
  const catalogFilled = await fillItemCatalogDetails(inventory);

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      invJson: JSON.stringify(inventory),
      syncedAt: new Date(),
    },
  });
  await syncDbInventoryFromSheet(user.id, inventory);
  if (inventory.sourceSheetId === MASTER_SHEET_ID && catalogFilled) {
    await pushInventoryToSheet(sheet.sheetTab, inventory);
  }

  revalidatePath("/profile");
  revalidatePath("/world");
}

export async function unlinkSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.$transaction([
    prisma.characterSheet.deleteMany({ where: { userId: user.id } }),
    // 시트에서 다시 채울 수 있는 미러 인벤만 정리한다.
    // 경매 등록·미수령 우편은 원본 보상 데이터라 삭제하면 아이템이 유실될 수 있다.
    // (스킬북 토큰 meta='skillbook'은 보존, 재연동 시 인벤은 시트에서 다시 채워짐)
    prisma.inventoryEntry.deleteMany({ where: { userId: user.id, meta: null } }),
  ]);
  revalidatePath("/profile");
  revalidatePath("/world");
}
