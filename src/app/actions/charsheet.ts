"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { MASTER_SHEET_ID, fetchSheetByTab, isValidTabName } from "@/lib/charsheet";
import { parseGoldToInt } from "@/lib/dice";
import { adventurerRankFromFame, totalFameForRank } from "@/lib/adventurerRank";
import { craftSerialOf, randomCraftSerial, withCraftSerial } from "@/lib/weaponCraft";
import {
  pushInventoryToSheet,
  readSheetEquipment,
  readSheetInventory,
  type SheetInventory,
  type SheetInventoryItem,
} from "@/lib/googleSheets";

export type SheetState = { error?: string; ok?: boolean } | undefined;

// "강철 검(+1)" → "강철 검" : 강화·인첸트 꼬리표 제거
function baseItemName(name: string): string {
  return name.trim().replace(/\s*\([^()]*\)\s*$/, "").trim();
}

// 고유번호가 없는 제작품에 번호를 발급한다 (가방에 있는 것 한정).
// 제작품은 같은 이름이라도 제작 건마다 효과·가격이 다르다. 번호가 없으면 이름으로 도감을
// 뒤지다 남의 제작 정의를 물려받는다 — 실제로 '철 포인트 아머'가 그렇게 셋으로 갈렸다.
//
// 가방만 건드리는 이유: 이름을 바꾸는 작업이라 창고·경매에 흩어진 같은 이름과 갈라진다.
// 가방은 pushInventoryToSheet 로 시트 이름 칸까지 되돌려 쓸 수 있어 한 번에 정합이 맞는다.
// 착용 중인 장비는 시트 장비칸에 쓰는 경로가 없어서 여기서 제외한다.
const CRAFTED_MARK = /(?:^|\n)제작:\s*\S/;

async function issueMissingCraftSerials(inventory: SheetInventory): Promise<boolean> {
  const targets = inventory.items.filter(
    (item) => item.qty > 0 && !craftSerialOf(item.name) && CRAFTED_MARK.test(item.effect ?? ""),
  );
  if (targets.length === 0) return false;

  let changed = false;
  for (const item of targets) {
    const baseName = item.name.trim();
    // 지금 이 물건이 참조하던 도감 행을 그대로 스냅샷해 자기 행으로 복제한다.
    const source = await prisma.item.findFirst({
      where: { OR: [{ id: baseName }, { name: baseName }] },
      select: { category: true, buyPrice: true, sellPrice: true, weight: true, desc: true, craftEffect: true, order: true },
    });

    let nextName: string | null = null;
    for (let attempt = 0; attempt < 8 && !nextName; attempt++) {
      const candidate = withCraftSerial(baseName, randomCraftSerial());
      const taken = await prisma.item.findUnique({ where: { id: candidate }, select: { id: true } });
      if (!taken) nextName = candidate;
    }
    if (!nextName) continue; // 8번 다 겹치면 이번 동기화는 건너뛴다 (다음에 다시 시도)

    await prisma.item.create({
      data: {
        id: nextName,
        name: nextName,
        category: source?.category ?? null,
        buyPrice: source?.buyPrice ?? null,
        sellPrice: source?.sellPrice ?? null,
        weight: item.weight ?? source?.weight ?? null,
        desc: item.effect ?? source?.desc ?? null,
        craftEffect: source?.craftEffect ?? null,
        order: source?.order ?? 0,
      },
    });
    item.name = nextName;
    changed = true;
  }
  return changed;
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
  // 제작품은 이름이 겹쳐도 고유번호(#7K2F)로 자기 행만 찾아야 한다.
  // 이 조회가 시트 효과 칸이 빈 휴대품을 도감 설명으로 채우는 자리라,
  // 이름만으로 찾으면 남이 만든 동명 제작품의 효과가 붙어버린다.
  const serials = [...new Set(targets.map((item) => craftSerialOf(item.name)).filter(Boolean))];
  const catalog = await prisma.item.findMany({
    where: {
      OR: [
        { id: { in: [...keys] } },
        { name: { in: [...keys] } },
        ...serials.map((serial) => ({ id: { endsWith: ` #${serial}` } })),
      ],
    },
    select: { id: true, name: true, desc: true, weight: true },
  });
  const descByKey = new Map<string, string>();
  const weightByKey = new Map<string, number>();
  for (const entry of catalog) {
    const serial = craftSerialOf(entry.id);
    const entryKeys = serial ? [entry.id, entry.name, `#${serial}`] : [entry.id, entry.name];
    for (const key of entryKeys) {
      if (entry.desc && !descByKey.has(key)) descByKey.set(key, entry.desc);
      if (entry.weight != null && !weightByKey.has(key)) weightByKey.set(key, entry.weight);
    }
  }

  let changed = false;
  for (const item of targets) {
    const key = item.name.trim();
    const baseKey = baseItemName(item.name);
    // 고유번호가 있으면 이름 폴백(baseKey)보다 먼저 본다 — 수식어가 앞에 붙어 이름이
    // 달라져도 자기 행을 찾고, 이름만 같은 남의 제작품으로 새지 않는다.
    const serial = craftSerialOf(item.name);
    const lookup = <T>(map: Map<string, T>): T | undefined =>
      map.get(key) ?? (serial ? map.get(`#${serial}`) : undefined) ?? map.get(baseKey);

    const desc = lookup(descByKey);
    if (!item.effect && desc) {
      item.effect = desc;
      changed = true;
    }
    const weight = lookup(weightByKey);
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

  const [sheetInventory, sheetEquipment] = await Promise.all([
    readSheetInventory(tab),
    readSheetEquipment(tab),
  ]);
  const inventory = sheetInventory ?? {
    sourceSheetId: parsed.sourceSheetId,
    gold: null,
    curWeight: null,
    maxWeight: null,
    items: [],
  };
  const catalogFilled = inventory ? await fillItemCatalogDetails(inventory) : false;
  // 효과를 채운 뒤에 발급해야 새 도감 행이 빈 채로 만들어지지 않는다.
  const serialsIssued = inventory ? await issueMissingCraftSerials(inventory) : false;
  const existing = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { adventurerRank: true, fame: true },
  });
  const fame = Math.max(
    parsed.fame ?? 0,
    existing ? totalFameForRank(existing.adventurerRank, existing.fame) : 0,
  );
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
    adventurerRank: adventurerRankFromFame(fame),
    fame,
    curHp: parsed.hp,
    curMp: parsed.mp,
    curGold: parseGoldToInt(inventory?.gold ?? parsed.gold),
    statsJson: JSON.stringify(parsed.stats),
    sheetSkillsJson: JSON.stringify(parsed.skills), // SL 1+ 스킬 — 주간 수입 판정용
    invJson: inventory ? JSON.stringify(inventory) : undefined,
    equipmentJson: sheetEquipment ? JSON.stringify(sheetEquipment) : undefined,
    syncedAt: new Date(),
  };

  await prisma.characterSheet.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  if (sheetInventory) await syncDbInventoryFromSheet(user.id, sheetInventory);
  // 새로 채운 효과를 시트 효과·해설 칸에도 반영 (보강된 게 있을 때만)
  if (inventory && inventory.sourceSheetId === MASTER_SHEET_ID && (catalogFilled || serialsIssued)) {
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

  const [inventory, equipment] = await Promise.all([
    readSheetInventory(sheet.sheetTab),
    readSheetEquipment(sheet.sheetTab),
  ]);
  if (!inventory) return;
  const catalogFilled = await fillItemCatalogDetails(inventory);
  const serialsIssued = await issueMissingCraftSerials(inventory);

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      invJson: JSON.stringify(inventory),
      ...(equipment ? { equipmentJson: JSON.stringify(equipment) } : {}),
      syncedAt: new Date(),
    },
  });
  await syncDbInventoryFromSheet(user.id, inventory);
  if (inventory.sourceSheetId === MASTER_SHEET_ID && (catalogFilled || serialsIssued)) {
    await pushInventoryToSheet(sheet.sheetTab, inventory);
  }

  revalidatePath("/profile");
  revalidatePath("/world");
}

// 연동 '해제' 는 말 그대로 시트 연결만 끊는다. 행은 지우지 않는다.
//
// 예전엔 CharacterSheet 행을 통째로 삭제했다. 그 행에는 시트로 되채울 수 없는 것들이
// 전부 들어 있다 — lifeJson(생활스킬 레벨·exp·특성·도감·도구·생활가방·장소기록),
// housingJson·houseTier(부동산), discoveredJson(히든 발견), achStatsJson(업적 카운터),
// guildQuestJson, visitedJson. 실제로 한 캐릭터가 연동 해제 한 번에 채집 Lv32·도감 95종·
// 특성 11개·집·히든 3곳을 전부 잃었고, DB 백업 브랜치로만 되살릴 수 있었다.
//
// sheetTab 을 비우면 '!sheet?.sheetTab' 을 쓰는 모든 연동 검사가 미연동으로 판정한다.
// 재연동하면 syncSheet 가 같은 행을 upsert 하므로 나머지 데이터는 그대로 돌아온다.
// 인벤 미러(meta=null)도 남긴다 — 시트에서 다시 채워지는 값이라 지울 이유가 없고,
// 지우면 재연동 전까지 창고·도감 표시가 어긋난다.
export async function unlinkSheet(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.characterSheet.updateMany({
    where: { userId: user.id },
    data: { sheetTab: "" },
  });
  revalidatePath("/profile");
  revalidatePath("/world");
}
