"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { rollDice } from "@/lib/dice";
import { dungeonWeekKey } from "@/lib/world";
import { ABILITY_LABELS_KO, type DropEntry } from "@/lib/gamedata";
import {
  appendSheetFormula,
  inventoryWeightTotal,
  type SheetInventory,
} from "@/lib/googleSheets";

const DUNGEON_AP = 60;
const WEEKLY_LIMIT = 3;
const EXP_CELL = "N9"; // 시트 경험점 칸 (수식 보존하고 +N)

export type DungeonResult =
  | {
      ok: true;
      success: boolean;
      ability: string;
      dice: number[];
      mod: number;
      total: number;
      dc: number;
      exp: number;
      rewards: string[];
      runsLeft: number;
    }
  | { error: string };

type StatEntry = { label: string; mod: number | null };

function statMod(statsJson: string | null, label: string): number | null {
  if (!statsJson) return null;
  try {
    const stats = JSON.parse(statsJson) as StatEntry[];
    const s = stats.find((x) => x.label === label);
    return s ? (s.mod ?? 0) : null;
  } catch {
    return null;
  }
}

function parseInv(json: string | null): SheetInventory {
  try {
    if (json) return JSON.parse(json) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

async function incDbItem(userId: string, name: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: name }, { name }] } });
  if (!item) return;
  const existing = await prisma.inventoryEntry.findFirst({ where: { userId, itemId: item.id, meta: null } });
  if (existing) {
    await prisma.inventoryEntry.update({ where: { id: existing.id }, data: { qty: existing.qty + qty } });
  } else {
    await prisma.inventoryEntry.create({ data: { userId, itemId: item.id, qty } });
  }
}

export async function challengeDungeon(dungeonId: string, ability: string): Promise<DungeonResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  if (!ABILITY_LABELS_KO.includes(ability)) return { error: "능력치를 선택해주세요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };

  const dungeon = await prisma.dungeon.findUnique({ where: { id: dungeonId } });
  if (!dungeon) return { error: "던전을 찾지 못했어요." };
  if (sheet.locationId !== dungeon.locationId) return { error: "이 던전을 도전할 수 있는 장소가 아니에요." };

  // 주간 캡
  const week = dungeonWeekKey();
  const runs = sheet.dungeonWeek === week ? sheet.dungeonRuns : 0;
  if (runs >= WEEKLY_LIMIT) {
    return { error: `이번 주 던전 도전을 모두 사용했어요. (${WEEKLY_LIMIT}/${WEEKLY_LIMIT}) 월요일 05시에 초기화돼요.` };
  }

  // AP
  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < DUNGEON_AP) return { error: `피로도가 부족해요. (필요 ${DUNGEON_AP}, 보유 ${ap})` };

  // 능력치 판정
  const mod = statMod(sheet.statsJson, ability);
  if (mod == null) return { error: `시트에서 ${ability} 능력치를 찾지 못했어요. 프로필에서 동기화해주세요.` };
  const dice = rollDice(2);
  const total = dice[0] + dice[1] + mod;
  const success = total >= dungeon.dc;

  // AP·주간 횟수 차감
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - DUNGEON_AP, apResetAt, dungeonWeek: week, dungeonRuns: runs + 1 },
  });

  // 경험점은 성공·실패 동일 지급 (시트 수식 끝에 +N)
  if (dungeon.exp > 0) await appendSheetFormula(sheet.sheetTab, EXP_CELL, dungeon.exp);

  // 성공 시 보상(포션 등) 지급
  const rewards: string[] = [];
  if (success) {
    let drops: DropEntry[] = [];
    try {
      drops = JSON.parse(dungeon.dropsJson) as DropEntry[];
    } catch {
      drops = [];
    }
    const inv = parseInv(sheet.invJson);
    for (const d of drops) {
      if (d.item === "꽝") continue;
      if (d.item === "골드") continue; // 던전 골드 보상은 후속
      const found = inv.items.find((i) => i.name.trim() === d.item.trim());
      if (found) found.qty += d.qty;
      else inv.items.push({ name: d.item, effect: null, weight: 1, qty: d.qty });
      await incDbItem(user.id, d.item, d.qty);
      rewards.push(`${d.item} x${d.qty}`);
    }
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { invJson: JSON.stringify(inv) },
    });
  }

  if (sheet.locationId) {
    await postSystem(
      sheet.locationId,
      `⚔️ ${user.nickname}님의 ${dungeon.name} 도전 — 🎲 ${dice.join("+")}+${mod}=${total} (목표 ${dungeon.dc}) ${
        success ? "성공!" : "실패…"
      } 경험점 +${dungeon.exp}${success && rewards.length ? ` · ${rewards.join(", ")} 획득` : ""}`,
    );
  }

  revalidatePath("/world");
  revalidatePath("/profile");
  return {
    ok: true,
    success,
    ability,
    dice,
    mod,
    total,
    dc: dungeon.dc,
    exp: dungeon.exp,
    rewards,
    runsLeft: WEEKLY_LIMIT - (runs + 1),
  };
}
