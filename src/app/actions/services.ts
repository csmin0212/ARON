"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseGoldToInt } from "@/lib/dice";
import {
  appendSheetItem,
  consumeSheetItem,
  readSheetInventory,
  syncSheetGold,
  updateSheetItemDetails,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";
import { postSystem } from "@/lib/play";

export type ServiceState = { error?: string; ok?: string } | undefined;

const STEEL_FRAGMENT = "강철 파편";

const GEM_EFFECTS = [
  { key: "루비", text: "루비 인첸트: <화> 속성 마법 데미지 +2" },
  { key: "에메랄드", text: "에메랄드 인첸트: <풍> 속성 마법 데미지 +2" },
  { key: "사파이어", text: "사파이어 인첸트: <수> 속성 마법 데미지 +2" },
  { key: "토파즈", text: "토파즈 인첸트: <지> 속성 마법 데미지 +2" },
  {
    key: "다이아몬드",
    text: "다이아몬드 인첸트: 마법 데미지 +2, 데미지 경감 [분류:마술] 효과 +2",
  },
];

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function findInvItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  return inv.items.find((item) => item.name.trim() === name.trim()) ?? null;
}

function itemQty(inv: SheetInventory, name: string): number {
  return findInvItem(inv, name)?.qty ?? 0;
}

function addInvItem(inv: SheetInventory, item: SheetInventoryItem, qty: number): SheetInventory {
  const existing = findInvItem(inv, item.name);
  if (existing) {
    existing.qty += qty;
    existing.effect ||= item.effect;
    existing.weight ??= item.weight;
  } else {
    inv.items.push({ ...item, qty });
  }
  if (item.weight != null) inv.curWeight = (inv.curWeight ?? 0) + item.weight * qty;
  return inv;
}

function consumeInvItem(inv: SheetInventory, name: string, qty: number): SheetInventory {
  const item = findInvItem(inv, name);
  if (item) item.qty = Math.max(0, item.qty - qty);
  return inv;
}

function updateInvItem(
  inv: SheetInventory,
  name: string,
  patch: { effect?: string; weight?: number | null },
): SheetInventory {
  const item = findInvItem(inv, name);
  if (!item) return inv;
  if (patch.effect !== undefined) item.effect = patch.effect;
  if (patch.weight !== undefined) item.weight = patch.weight;
  return inv;
}

function appendEffect(current: string | null, line: string): string {
  return current ? `${current}\n${line}` : line;
}

function gemEffect(gemName: string): string {
  return GEM_EFFECTS.find((gem) => gemName.includes(gem.key))?.text ?? `${gemName} 인첸트`;
}

async function currentSheet(): Promise<{
  userId: string;
  nickname: string;
  tab: string;
  locationId: string | null;
  inv: SheetInventory;
  invFromSheet: boolean;
} | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return null;

  const sheetInv = await readSheetInventory(sheet.sheetTab);
  return {
    userId: user.id,
    nickname: user.nickname,
    tab: sheet.sheetTab,
    locationId: sheet.locationId,
    inv: sheetInv ?? parseInv(sheet.invJson),
    invFromSheet: !!sheetInv,
  };
}

async function addDbInventory(userId: string, itemId: string, qty: number): Promise<void> {
  const existing = await prisma.inventoryEntry.findFirst({ where: { userId, itemId, meta: null } });
  if (existing) {
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  } else {
    await prisma.inventoryEntry.create({ data: { userId, itemId, qty } });
  }
}

async function decrementDbInventory(userId: string, itemName: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
  if (!item) return;

  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: item.id, meta: null },
  });
  if (!existing) return;

  await prisma.inventoryEntry.update({
    where: { id: existing.id },
    data: { qty: Math.max(0, existing.qty - qty) },
  });
}

export async function buyShopItem(_prev: ServiceState, formData: FormData): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const itemId = String(formData.get("itemId") ?? "").trim();
  const qty = Math.max(1, Math.min(99, Number(formData.get("qty") ?? 1) || 1));
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item || item.buyPrice == null || item.buyPrice <= 0) {
    return { error: "구매할 수 없는 아이템입니다." };
  }

  const price = item.buyPrice * qty;
  const gold = parseGoldToInt(ctx.inv.gold);
  if (gold < price) return { error: `소지금이 부족합니다. (${gold}G / ${price}G)` };

  const nextGold = gold - price;
  const goldOk = await syncSheetGold(ctx.tab, nextGold);
  const itemOk = await appendSheetItem(ctx.tab, item.name, qty);
  if (!goldOk || !itemOk) return { error: "시트에 구매 결과를 쓰지 못했습니다." };

  const inv = addInvItem(
    { ...ctx.inv, gold: `${nextGold}G` },
    { name: item.name, effect: item.desc, weight: 1, qty },
    qty,
  );
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { curGold: nextGold, gold: `${nextGold}G`, invJson: JSON.stringify(inv) },
    }),
    addDbInventory(ctx.userId, item.id, qty),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `🛒 ${ctx.nickname}님이 ${item.name} x${qty} 구매.`);
  }
  revalidatePath("/world");
  return { ok: `${item.name} x${qty} 구매 완료.` };
}

export async function upgradeWeapon(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const weaponName = String(formData.get("weaponName") ?? "").trim();
  const level = Math.max(1, Math.min(4, Number(formData.get("level") ?? 1) || 1));
  const weapon = findInvItem(ctx.inv, weaponName);
  if (!weapon || weapon.qty <= 0) return { error: "강화할 무기를 인벤토리에서 찾지 못했습니다." };
  if ((weapon.effect ?? "").includes("강철 강화")) {
    return { error: "이미 강철 강화가 적용된 무기입니다." };
  }
  if (itemQty(ctx.inv, STEEL_FRAGMENT) < level) {
    return { error: `${STEEL_FRAGMENT}이 부족합니다. (${itemQty(ctx.inv, STEEL_FRAGMENT)}/${level})` };
  }

  const nextWeight = (weapon.weight ?? 0) + level;
  const nextEffect = appendEffect(
    weapon.effect,
    `강철 강화 +${level}: 공격력 +${level}, 중량 +${level}`,
  );

  const consumeOk = await consumeSheetItem(ctx.tab, STEEL_FRAGMENT, level);
  if (!consumeOk.ok) return { error: consumeOk.error };
  const updateOk = await updateSheetItemDetails(ctx.tab, weapon.name, {
    effect: nextEffect,
    weight: nextWeight,
  });
  if (!updateOk.ok) return { error: updateOk.error };

  let inv = consumeInvItem(ctx.inv, STEEL_FRAGMENT, level);
  inv = updateInvItem(inv, weapon.name, { effect: nextEffect, weight: nextWeight });
  inv.curWeight = (inv.curWeight ?? 0) + level;
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    decrementDbInventory(ctx.userId, STEEL_FRAGMENT, level),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `⚒️ ${ctx.nickname}님이 ${weapon.name}을 +${level} 강화.`);
  }
  revalidatePath("/world");
  return { ok: `${weapon.name} +${level} 강화 완료.` };
}

export async function enchantWeapon(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const ctx = await currentSheet();
  if (!ctx) return { error: "로그인과 캐릭터 시트 연동이 필요합니다." };
  if (!ctx.invFromSheet) return { error: "구글 시트 쓰기 설정을 먼저 확인해주세요." };

  const weaponName = String(formData.get("weaponName") ?? "").trim();
  const gemName = String(formData.get("gemName") ?? "").trim();
  const weapon = findInvItem(ctx.inv, weaponName);
  if (!weapon || weapon.qty <= 0) return { error: "인첸트할 무기를 인벤토리에서 찾지 못했습니다." };
  if ((weapon.effect ?? "").includes("인첸트")) {
    return { error: "이미 인첸트가 적용된 무기입니다." };
  }
  if (itemQty(ctx.inv, STEEL_FRAGMENT) < 2) {
    return { error: `${STEEL_FRAGMENT}이 부족합니다. (${itemQty(ctx.inv, STEEL_FRAGMENT)}/2)` };
  }
  if (itemQty(ctx.inv, gemName) < 1) return { error: `${gemName}이 부족합니다.` };

  const nextEffect = appendEffect(weapon.effect, gemEffect(gemName));
  const steelOk = await consumeSheetItem(ctx.tab, STEEL_FRAGMENT, 2);
  if (!steelOk.ok) return { error: steelOk.error };
  const gemOk = await consumeSheetItem(ctx.tab, gemName, 1);
  if (!gemOk.ok) return { error: gemOk.error };
  const updateOk = await updateSheetItemDetails(ctx.tab, weapon.name, { effect: nextEffect });
  if (!updateOk.ok) return { error: updateOk.error };

  let inv = consumeInvItem(ctx.inv, STEEL_FRAGMENT, 2);
  inv = consumeInvItem(inv, gemName, 1);
  inv = updateInvItem(inv, weapon.name, { effect: nextEffect });
  await Promise.all([
    prisma.characterSheet.update({
      where: { userId: ctx.userId },
      data: { invJson: JSON.stringify(inv) },
    }),
    decrementDbInventory(ctx.userId, STEEL_FRAGMENT, 2),
    decrementDbInventory(ctx.userId, gemName, 1),
  ]);

  if (ctx.locationId) {
    await postSystem(ctx.locationId, `💎 ${ctx.nickname}님이 ${weapon.name}에 ${gemName} 인첸트.`);
  }
  revalidatePath("/world");
  return { ok: `${weapon.name} 인첸트 완료.` };
}
