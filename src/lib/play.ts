import "server-only";

import { prisma } from "./prisma";
import { rollDice } from "./dice";
import { KEYWORD_SEARCH_COST, regenFatigue } from "./world";
import { pickDrop, type DropEntry } from "./gamedata";
import type { StatEntry } from "./charsheet";
import type { CharacterSheet } from "@/generated/prisma";
import {
  appendSheetItem,
  inventoryWeightTotal,
  syncSheetGold,
  syncSheetWeight,
  type SheetInventory,
} from "./googleSheets";
import {
  lifeSkillCategory,
  lifeSkillItemEffect,
  lifeSkillKindOf,
  pickLifeSkillCatch,
  type LifeSkillCatch,
  type LifeSkillItem,
} from "./lifeSkillData";
import {
  adjustedRankWeights,
  applyExp,
  baseWeightsFor,
  computeMods,
  parseLifeState,
  progressOf,
} from "./lifeSkillPerks";

export const KIND_EMOJI: Record<string, string> = {
  채집: "🌿",
  낚시: "🎣",
  채굴: "⛏️",
  벌목: "🪓",
  탐색: "🔍",
  휴식: "🛌",
};

// 피로도 lazy 회복 (이름은 기존 호출부 호환을 위해 유지)
export function freshAp(
  ap: number | null,
  apResetAt: Date | null,
): { ap: number; apResetAt: Date } {
  const r = regenFatigue(ap, apResetAt);
  return { ap: r.value, apResetAt: r.at };
}

function statModOf(statsJson: string | null, label: string): number | null {
  if (!statsJson) return null;
  try {
    const stats = JSON.parse(statsJson) as StatEntry[];
    const stat = stats.find((x) => x.label === label);
    return stat ? (stat.mod ?? 0) : null;
  } catch {
    return null;
  }
}

async function addItem(userId: string, itemId: string, qty: number): Promise<void> {
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

function mergeInventorySnapshot(
  invJson: string | null,
  itemName: string,
  qty: number,
  details: { effect?: string | null; weight?: number | null } = {},
): string {
  let inv: SheetInventory = { gold: null, curWeight: null, maxWeight: null, items: [] };
  try {
    if (invJson) inv = JSON.parse(invJson) as SheetInventory;
  } catch {
    inv = { gold: null, curWeight: null, maxWeight: null, items: [] };
  }

  const found = inv.items.find((item) => item.name === itemName);
  if (found) {
    found.qty += qty;
    if (!found.effect && details.effect) found.effect = details.effect;
    if (found.weight == null && details.weight != null) found.weight = details.weight;
  } else {
    inv.items.push({
      name: itemName,
      effect: details.effect ?? null,
      weight: details.weight ?? 1,
      qty,
    });
  }

  inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
  return JSON.stringify(inv);
}

function parseInventorySnapshot(invJson: string | null): SheetInventory {
  try {
    if (invJson) return JSON.parse(invJson) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function lifeSkillResultText(catchResult: LifeSkillCatch): string {
  const item = catchResult.item;
  return ` 성공! ✨ [${item.rarity}] ${item.name} x1 획득! (크기 ${catchResult.size}, 중량 ${item.weight}, 판매가 ${item.price}G)`;
}

async function ensureLifeSkillItem(item: LifeSkillItem, kind: "채집" | "낚시"): Promise<void> {
  await prisma.item.upsert({
    where: { id: item.name },
    create: {
      id: item.name,
      name: item.name,
      category: lifeSkillCategory(kind),
      sellPrice: item.price,
      desc: item.text,
      order: item.no,
    },
    update: {
      name: item.name,
      category: lifeSkillCategory(kind),
      sellPrice: item.price,
      desc: item.text,
      order: item.no,
    },
  });
}

export async function postSystem(locationId: string, content: string): Promise<void> {
  await prisma.worldMessage.create({ data: { locationId, system: true, content } });
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const diceText = (dice: number[], mod: number, total: number, dc: number) =>
  `🎲 ${dice.join("+")}${mod >= 0 ? "+" : ""}${mod} = ${total} (목표 ${dc})`;

export async function runActionCommand(
  userId: string,
  nickname: string,
  sheet: CharacterSheet,
  command: string,
): Promise<{ error?: string }> {
  const locationId = sheet.locationId!;
  const actions = await prisma.locationAction.findMany({
    where: { locationId },
    orderBy: { order: "asc" },
  });

  const target = actions.find(
    (a) => norm(a.label ?? a.kind) === norm(command) || norm(a.kind) === norm(command),
  );
  if (!target) {
    const list = actions.map((a) => `/${a.label ?? a.kind}`).join(" · ");
    return {
      error: actions.length
        ? `여기서 가능한 행동: ${list}`
        : "이 장소에서 할 수 있는 행동이 없어요.",
    };
  }

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < target.apCost)
    return { error: `피로도가 부족해요. (필요 ${target.apCost}, 보유 ${ap}) — 6분마다 1씩 회복돼요.` };

  const label = target.label ?? target.kind;
  const emoji = KIND_EMOJI[target.kind] ?? "✨";

  let success = true;
  let rollLine = "";
  if (target.statLabel && target.dc != null) {
    const mod = statModOf(sheet.statsJson, target.statLabel);
    if (mod == null)
      return {
        error: `시트에서 ${target.statLabel} 능력치를 찾지 못했어요. 프로필에서 다시 동기화해주세요.`,
      };

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    success = total >= target.dc;
    rollLine = ` — ${diceText(dice, mod, total, target.dc)}`;
    await prisma.roll.create({
      data: {
        userId,
        label: `${label} 판정 (${target.statLabel})`,
        dice: JSON.stringify(dice),
        modifier: mod,
        total,
        dc: target.dc,
        success,
      },
    });
  }

  let resultLine: string;
  if (!success) {
    resultLine = ` 실패... ${target.failText ?? ""}`.trimEnd();
  } else {
    const lifeSkillKind = lifeSkillKindOf(target.kind, target.label);

    if (lifeSkillKind) {
      // 특성 보정 적용한 등급 추첨 + 숙련도 누적/레벨업
      const life = parseLifeState(sheet.lifeJson);
      const mods = computeMods(life, lifeSkillKind);
      const level = progressOf(life, lifeSkillKind).level;
      const caught = pickLifeSkillCatch(
        lifeSkillKind,
        adjustedRankWeights(mods, baseWeightsFor(level)),
      );
      const item = caught.item;
      const effect = lifeSkillItemEffect(item);
      const expGained = Math.max(1, Math.round(item.exp * mods.expMult));
      const leveled = applyExp(life, lifeSkillKind, expGained);

      await ensureLifeSkillItem(item, lifeSkillKind);
      await addItem(userId, item.name, 1);
      const nextInvJson = mergeInventorySnapshot(sheet.invJson, item.name, 1, {
        effect,
        weight: item.weight,
      });
      const nextInv = parseInventorySnapshot(nextInvJson);

      await prisma.characterSheet.update({
        where: { userId },
        data: { invJson: nextInvJson, lifeJson: JSON.stringify(life) },
      });
      void appendSheetItem(sheet.sheetTab, item.name, 1, { effect, weight: item.weight });
      if (nextInv.curWeight != null) void syncSheetWeight(sheet.sheetTab, nextInv.curWeight);

      resultLine = `${lifeSkillResultText(caught)} (+숙련도 ${expGained})`;
      for (const lv of leveled) {
        await postSystem(
          locationId,
          `🆙 ${nickname}님의 ${lifeSkillKind} 레벨이 ${lv}이 되었다! 내 캐릭터 페이지 → 생활 데이터에서 새 특성을 선택하세요.`,
        );
      }
    } else {
      let drop: DropEntry;
      try {
        drop = pickDrop(JSON.parse(target.dropsJson) as DropEntry[]);
      } catch {
        return { error: "드랍테이블이 잘못됐어요. GM에게 알려주세요." };
      }

      if (drop.item === "골드" && drop.gold > 0) {
        const nextGold = (sheet.curGold ?? 0) + drop.gold;
        let nextInvJson = sheet.invJson;
        try {
          const inv = nextInvJson
            ? (JSON.parse(nextInvJson) as SheetInventory)
            : { gold: null, curWeight: null, maxWeight: null, items: [] };
          inv.gold = `${nextGold}G`;
          nextInvJson = JSON.stringify(inv);
        } catch {
          nextInvJson = sheet.invJson;
        }

        await prisma.characterSheet.update({
          where: { userId },
          data: { curGold: nextGold, invJson: nextInvJson },
        });
        void syncSheetGold(sheet.sheetTab, nextGold);
        resultLine = ` 성공! ✨ ${drop.gold}G 획득!`;
      } else if (drop.item === "꽝") {
        resultLine = " 꽝... 아무 일도 일어나지 않았다.";
      } else {
        await addItem(userId, drop.item, drop.qty);
        const item = await prisma.item.findUnique({ where: { id: drop.item } });
        const itemName = item?.name ?? drop.item;
        await prisma.characterSheet.update({
          where: { userId },
          data: { invJson: mergeInventorySnapshot(sheet.invJson, itemName, drop.qty) },
        });
        void appendSheetItem(sheet.sheetTab, itemName, drop.qty);
        resultLine = ` 성공! ✨ ${itemName} x${drop.qty} 획득!`;
      }
    }
  }

  await prisma.characterSheet.update({
    where: { userId },
    data: { ap: ap - target.apCost, apResetAt },
  });

  await postSystem(locationId, `${emoji} ${nickname}님의 ${label}${rollLine}${resultLine}`);
  return {};
}

export async function tryKeywordSpeech(
  userId: string,
  nickname: string,
  sheet: CharacterSheet,
  content: string,
): Promise<{ notice?: string; changed?: boolean }> {
  const locationId = sheet.locationId!;
  const here = await prisma.location.findUnique({ where: { id: locationId } });
  if (!here) return {};

  let discovered: string[] = [];
  try {
    discovered = sheet.discoveredJson ? (JSON.parse(sheet.discoveredJson) as string[]) : [];
  } catch {
    discovered = [];
  }

  let hereConns: string[] = [];
  try {
    hereConns = here.connJson ? (JSON.parse(here.connJson) as string[]) : [];
  } catch {
    hereConns = [];
  }

  const hiddens = await prisma.location.findMany({
    where: { hidden: true, keyword: { not: null } },
  });
  const target = hiddens.find((h) => {
    if (discovered.includes(h.id)) return false;
    if (norm(h.keyword!) !== norm(content)) return false;
    let hConns: string[] = [];
    try {
      hConns = h.connJson ? (JSON.parse(h.connJson) as string[]) : [];
    } catch {
      hConns = [];
    }
    return hereConns.includes(h.id) || hConns.includes(here.id);
  });
  if (!target) return {};

  const discover = async () => {
    await prisma.characterSheet.update({
      where: { userId },
      data: { discoveredJson: JSON.stringify([...discovered, target.id]) },
    });
    await postSystem(
      locationId,
      `🗺️ ${nickname}님이 숨겨진 장소를 발견했다: ${target.emoji ?? "📍"} ${target.name}!`,
    );
  };

  const cond = (target.cond ?? "").trim();
  if (cond.startsWith("아이템")) {
    const itemName = cond.replace(/^아이템\s*[:=>]\s*/, "").trim();
    const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
    const entry = item
      ? await prisma.inventoryEntry.findFirst({
          where: { userId, itemId: item.id, qty: { gt: 0 } },
        })
      : null;
    if (!entry)
      return { notice: "무언가 희미하게 반응하지만... 열쇠가 되어줄 무언가가 필요해 보인다." };
    await discover();
    return { changed: true };
  }

  if (cond.startsWith("판정")) {
    const cm = cond.match(/^판정\s*[:=>]\s*(.+?)\s*[:=>]\s*(\d+)$/);
    if (!cm) return { notice: "발견 조건 형식이 잘못됐어요. GM에게 알려주세요." };

    const statLabel = cm[1].trim();
    const dc = parseInt(cm[2], 10);
    const mod = statModOf(sheet.statsJson, statLabel);
    if (mod == null) return { notice: `시트에서 ${statLabel} 능력치를 찾지 못했어요.` };

    const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
    if (ap < KEYWORD_SEARCH_COST)
      return { notice: `탐색할 기력이 없어요. (피로도 ${KEYWORD_SEARCH_COST} 필요)` };

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    const success = total >= dc;
    await Promise.all([
      prisma.roll.create({
        data: {
          userId,
          label: `탐색 판정 (${statLabel})`,
          dice: JSON.stringify(dice),
          modifier: mod,
          total,
          dc,
          success,
        },
      }),
      prisma.characterSheet.update({
        where: { userId },
        data: { ap: ap - KEYWORD_SEARCH_COST, apResetAt },
      }),
    ]);

    await postSystem(
      locationId,
      `🔍 ${nickname}님의 탐색 판정 — ${diceText(dice, mod, total, dc)} ${success ? "성공!" : "실패..."}`,
    );
    if (success) await discover();
    return { changed: true };
  }

  await discover();
  return { changed: true };
}
