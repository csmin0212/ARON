"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { rollDice } from "@/lib/dice";
import { dungeonWeekKey } from "@/lib/world";
import { ABILITY_LABELS_KO, pickDrop, type DropEntry } from "@/lib/gamedata";
import {
  appendSheetFormula,
  appendSheetGold,
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

function parseDropList(json: string | null): DropEntry[] {
  try {
    return json ? (JSON.parse(json) as DropEntry[]) : [];
  } catch {
    return [];
  }
}

// 드랍 한 건을 인벤토리/도감에 반영하고, 골드 드랍이면 그 양을 반환(나중에 합산 지급).
async function giveDrop(
  userId: string,
  inv: SheetInventory,
  d: DropEntry,
  rewards: string[],
): Promise<number> {
  if (d.item === "꽝") return 0;
  if (d.item === "골드") {
    if (d.gold > 0) rewards.push(`${d.gold}G`);
    return d.gold;
  }
  const catalog = await prisma.item.findFirst({
    where: { OR: [{ id: d.item }, { name: d.item }] },
    select: { name: true, desc: true },
  });
  const itemName = catalog?.name ?? d.item;
  const found = inv.items.find((i) => i.name.trim() === itemName.trim());
  if (found) {
    found.qty += d.qty;
    if (!found.effect && catalog?.desc) found.effect = catalog.desc;
  } else {
    inv.items.push({ name: itemName, effect: catalog?.desc ?? null, weight: 1, qty: d.qty });
  }
  await incDbItem(userId, d.item, d.qty);
  rewards.push(`${itemName} x${d.qty}`);
  return 0;
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

  // AP·주간 횟수 차감 + 업적 카운터 (입장 / 성공 시 클리어)
  let achStats = bumpStat(sheet.achStatsJson, "던전입장");
  if (success) {
    achStats = bumpStat(achStats, "던전클리어");
    achStats = bumpStat(achStats, "주간던전클리어");
  }
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - DUNGEON_AP, apResetAt, dungeonWeek: week, dungeonRuns: runs + 1, achStatsJson: achStats },
  });

  // 경험점은 성공·실패 동일 지급 (범위면 랜덤). 시트 수식 끝에 +N
  const expGain =
    dungeon.expMax > dungeon.exp
      ? dungeon.exp + Math.floor(Math.random() * (dungeon.expMax - dungeon.exp + 1))
      : dungeon.exp;
  if (expGain > 0) await appendSheetFormula(sheet.sheetTab, EXP_CELL, expGain);

  // 성공 시 보상 지급 — 확정 보상은 전부, 확률 보상은 가중치로 하나 추첨.
  const rewards: string[] = [];
  if (success) {
    const guaranteed = parseDropList(dungeon.dropsJson);
    const rollPool = parseDropList(dungeon.rollDropsJson);
    const picks = [...guaranteed];
    if (rollPool.length > 0) picks.push(pickDrop(rollPool));

    const inv = parseInv(sheet.invJson);
    let goldGain = 0;
    for (const d of picks) {
      goldGain += await giveDrop(user.id, inv, d, rewards);
    }
    inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;

    if (goldGain > 0) {
      const nextGold = (sheet.curGold ?? 0) + goldGain;
      inv.gold = `${nextGold}G`;
      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { invJson: JSON.stringify(inv), curGold: nextGold, gold: `${nextGold}G` },
      });
      void appendSheetGold(sheet.sheetTab, goldGain);
    } else {
      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { invJson: JSON.stringify(inv) },
      });
    }
  }

  if (sheet.locationId) {
    await postSystem(
      sheet.locationId,
      `⚔️ ${user.nickname}님의 ${dungeon.name} 도전 — 🎲 ${dice.join("+")}+${mod}=${total} (목표 ${dungeon.dc}) ${
        success ? "성공!" : "실패…"
      } 경험점 +${expGain}${success && rewards.length ? ` · ${rewards.join(", ")} 획득` : ""}`,
    );
  }

  void checkAndGrant(user.id);
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
    exp: expGain,
    rewards,
    runsLeft: WEEKLY_LIMIT - (runs + 1),
  };
}
