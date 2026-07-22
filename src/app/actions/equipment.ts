"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  inventoryWeightTotal,
  pushInventoryToSheet,
  writeSheetEquipmentSlot,
  type EquipmentSlotId,
  type SheetEquipment,
  type SheetEquipmentSlot,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";

export type EquipmentState = { error?: string; ok?: string } | undefined;

const WEAPON_TYPES = new Set([
  "격투",
  "단검",
  "장검",
  "양손검",
  "도끼",
  "타격",
  "창",
  "채찍",
  "카타나",
  "활",
]);
const ARMOR_SLOT_BY_TYPE: Record<string, EquipmentSlotId> = {
  머리: "head",
  몸통: "body",
  전신: "body",
  보조: "sub",
};

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    /* ignore */
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function emptyEquipment(): SheetEquipment {
  return {
    slots: [
      { id: "weapon1", label: "무기 1", group: "weapon", itemType: "무기", name: null, effect: null, weight: null, stats: {} },
      { id: "weapon2", label: "무기 2", group: "weapon", itemType: "무기", name: null, effect: null, weight: null, stats: {} },
      { id: "head", label: "머리", group: "armor", itemType: "머리", name: null, effect: null, weight: null, stats: {} },
      { id: "body", label: "몸통", group: "armor", itemType: "몸통", name: null, effect: null, weight: null, stats: {} },
      { id: "sub", label: "보조", group: "armor", itemType: "보조", name: null, effect: null, weight: null, stats: {} },
      { id: "accessory1", label: "장신구", group: "accessory", itemType: "장신구", name: null, effect: null, weight: null, stats: {} },
    ],
    weaponWeightText: null,
    armorWeightText: null,
  };
}

function parseEquipment(value: string | null): SheetEquipment {
  try {
    if (value) {
      const parsed = JSON.parse(value) as SheetEquipment;
      const allowedIds = new Set(emptyEquipment().slots.map((slot) => slot.id));
      const parsedSlots = (parsed.slots ?? []).filter((slot) => allowedIds.has(slot.id));
      const byId = new Map(parsedSlots.map((slot) => [slot.id, slot]));
      return {
        ...emptyEquipment(),
        ...parsed,
        slots: emptyEquipment().slots.map((slot) => byId.get(slot.id) ?? slot),
      };
    }
  } catch {
    /* ignore */
  }
  return emptyEquipment();
}

function itemKey(item: Pick<SheetInventoryItem, "name" | "effect" | "weight">): string {
  return `${item.name.trim()}\u0000${item.effect ?? ""}\u0000${item.weight ?? ""}`;
}

function findInvItem(inv: SheetInventory, name: string): SheetInventoryItem | null {
  const target = name.trim();
  return inv.items.find((item) => item.qty > 0 && item.name.trim() === target) ?? null;
}

function consumeInvItem(inv: SheetInventory, item: SheetInventoryItem): SheetInventory {
  const key = itemKey(item);
  inv.items = inv.items
    .map((entry) => {
      if (itemKey(entry) !== key) return entry;
      return { ...entry, qty: entry.qty - 1 };
    })
    .filter((entry) => entry.qty > 0);
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

function addInvItem(inv: SheetInventory, item: SheetInventoryItem): SheetInventory {
  const key = itemKey(item);
  const existing = inv.items.find((entry) => itemKey(entry) === key);
  if (existing) existing.qty += item.qty;
  else inv.items.push({ ...item });
  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return inv;
}

function slotToItem(slot: SheetEquipmentSlot): SheetInventoryItem | null {
  if (!slot.name) return null;
  return {
    name: slot.name,
    effect: slot.effect,
    weight: slot.weight,
    qty: 1,
  };
}

function textItemType(item: SheetInventoryItem, catalogCategory: string | null | undefined): string | null {
  const effect = item.effect ?? "";
  const lvMatch = effect.match(/Lv\s*\d+\s+([^·\n]+)/i);
  const type = lvMatch?.[1]?.trim();
  if (type) return type;
  const category = catalogCategory?.trim();
  if (category === "무기") return "무기";
  if (category === "방어구") {
    return effect.match(/(?:부위|종별|Lv\s*\d+)\s*:?\s*(방패|머리|몸통|전신|보조)/)?.[1] ?? "몸통";
  }
  if (category === "장신구") return "장신구";
  return category || null;
}

function statNumber(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*([+-]?\\d+)`));
    if (match) return String(parseInt(match[1], 10));
  }
  return undefined;
}

function statText(text: string, label: string): string | undefined {
  const match = text.match(new RegExp(`${label}\\s*([^\\s·\\n]+)`));
  return match?.[1]?.trim();
}

function equipmentStats(itemType: string, effect: string | null): Record<string, string> {
  const text = effect ?? "";
  if (itemType === "방패") {
    return {
      명중: statNumber(text, ["물방", "물리\\s*방어력"]) ?? "",
      공격력: statNumber(text, ["마방", "마법\\s*방어력"]) ?? "",
    };
  }
  if (itemType === "무기" || WEAPON_TYPES.has(itemType)) {
    return {
      명중: statNumber(text, ["명중"]) ?? "",
      공격력: statNumber(text, ["공격력"]) ?? "",
      행동: statNumber(text, ["행동"]) ?? "",
      사거리: statText(text, "사거리") ?? "",
    };
  }
  if (ARMOR_SLOT_BY_TYPE[itemType]) {
    return {
      회피: statNumber(text, ["회피"]) ?? "",
      물방: statNumber(text, ["물방", "물리\\s*방어력"]) ?? "",
      마방: statNumber(text, ["마방", "마법\\s*방어력"]) ?? "",
      이동: statNumber(text, ["이동"]) ?? "",
    };
  }
  return {};
}

function chooseSlot(equipment: SheetEquipment, itemType: string): EquipmentSlotId | null {
  if (itemType === "방패" || itemType === "무기" || WEAPON_TYPES.has(itemType)) {
    const emptyWeapon = equipment.slots.find((slot) => slot.group === "weapon" && !slot.name);
    return (emptyWeapon?.id as EquipmentSlotId | undefined) ?? "weapon1";
  }
  if (ARMOR_SLOT_BY_TYPE[itemType]) return ARMOR_SLOT_BY_TYPE[itemType];
  if (itemType === "장신구") {
    return "accessory1";
  }
  return null;
}

async function syncDbInventoryFromInv(userId: string, inv: SheetInventory): Promise<void> {
  const merged = new Map<string, number>();
  for (const item of inv.items) {
    const name = item.name.trim();
    if (name && item.qty > 0) merged.set(name, (merged.get(name) ?? 0) + item.qty);
  }
  const itemIds = [...merged.keys()];

  await prisma.inventoryEntry.deleteMany({
    where: {
      userId,
      meta: null,
      ...(itemIds.length > 0 ? { itemId: { notIn: itemIds } } : {}),
    },
  });

  for (const [itemId, qty] of merged) {
    const existing = await prisma.inventoryEntry.findMany({
      where: { userId, itemId, meta: null },
      orderBy: { updatedAt: "desc" },
    });
    const [keep, ...duplicates] = existing;
    if (keep) {
      await prisma.inventoryEntry.update({ where: { id: keep.id }, data: { qty } });
      if (duplicates.length > 0) {
        await prisma.inventoryEntry.deleteMany({ where: { id: { in: duplicates.map((item) => item.id) } } });
      }
    } else {
      await prisma.inventoryEntry.create({ data: { userId, itemId, qty } });
    }
  }
}

function assertWeight(inv: SheetInventory): string | null {
  const curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight ?? 0;
  if (inv.maxWeight != null && curWeight > inv.maxWeight) {
    return `중량을 초과합니다. (${curWeight}/${inv.maxWeight})`;
  }
  inv.curWeight = curWeight;
  return null;
}

export async function equipInventoryItem(
  _prev: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) return { error: "장착할 아이템을 찾지 못했습니다." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { sheetTab: true, invJson: true, equipmentJson: true },
  });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };

  const inv = parseInv(sheet.invJson);
  const item = findInvItem(inv, itemName);
  if (!item) return { error: `${itemName}을 가방에서 찾지 못했습니다.` };

  const catalog = await prisma.item.findFirst({
    where: { OR: [{ id: item.name.trim() }, { name: item.name.trim() }] },
    select: { category: true },
  });
  const itemType = textItemType(item, catalog?.category);
  const equipment = parseEquipment(sheet.equipmentJson);
  const slotId = itemType ? chooseSlot(equipment, itemType) : null;
  if (!itemType || !slotId) return { error: "장비 가능한 아이템이 아닙니다." };

  const slot = equipment.slots.find((entry) => entry.id === slotId);
  if (!slot) return { error: "장비 슬롯을 찾지 못했습니다." };

  consumeInvItem(inv, item);
  const oldItem = slotToItem(slot);
  if (oldItem) addInvItem(inv, oldItem);
  const weightError = assertWeight(inv);
  if (weightError) return { error: weightError };

  const nextSlot: SheetEquipmentSlot = {
    ...slot,
    itemType,
    name: item.name,
    effect: item.effect,
    weight: item.weight,
    stats: equipmentStats(itemType, item.effect),
  };
  equipment.slots = equipment.slots.map((entry) => (entry.id === slotId ? nextSlot : entry));

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { invJson: JSON.stringify(inv), equipmentJson: JSON.stringify(equipment) },
  });
  await syncDbInventoryFromInv(user.id, inv);
  await Promise.all([
    pushInventoryToSheet(sheet.sheetTab, inv),
    writeSheetEquipmentSlot(sheet.sheetTab, nextSlot),
  ]);

  revalidatePath("/profile");
  revalidatePath("/world");
  return { ok: `${item.name} 장착 완료` };
}

export async function unequipEquipment(
  _prev: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const slotId = String(formData.get("slotId") ?? "").trim() as EquipmentSlotId;
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { sheetTab: true, invJson: true, equipmentJson: true },
  });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요합니다." };

  const equipment = parseEquipment(sheet.equipmentJson);
  const slot = equipment.slots.find((entry) => entry.id === slotId);
  if (!slot?.name) return { error: "해제할 장비가 없습니다." };

  const inv = parseInv(sheet.invJson);
  const oldItem = slotToItem(slot);
  if (oldItem) addInvItem(inv, oldItem);
  const weightError = assertWeight(inv);
  if (weightError) return { error: weightError };

  const nextSlot: SheetEquipmentSlot = {
    ...slot,
    itemType: slot.group === "weapon" ? "무기" : slot.group === "armor" ? slot.label : "장신구",
    name: null,
    effect: null,
    weight: null,
    stats: {},
  };
  equipment.slots = equipment.slots.map((entry) => (entry.id === slotId ? nextSlot : entry));

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { invJson: JSON.stringify(inv), equipmentJson: JSON.stringify(equipment) },
  });
  await syncDbInventoryFromInv(user.id, inv);
  await Promise.all([
    pushInventoryToSheet(sheet.sheetTab, inv),
    writeSheetEquipmentSlot(sheet.sheetTab, nextSlot),
  ]);

  revalidatePath("/profile");
  revalidatePath("/world");
  return { ok: `${slot.name} 장비 해제 완료` };
}
