import "server-only";

import { prisma } from "./prisma";
import { invalidateWorldMessages } from "./worldCache";
import { getLocationActionsAt, getLocationById } from "./gameCatalog";
import { dailyLifeEventBonus } from "./dailyEvents";
import { rollDice } from "./dice";
import { KEYWORD_SEARCH_COST, regenFatigue } from "./world";
import { pickDrop, type DropEntry } from "./gamedata";
import type { StatEntry } from "./charsheet";
import type { CharacterSheet } from "@/generated/prisma";
import { dedupeLifeActions } from "./locationActions";
import {
  appendSheetItem,
  inventoryWeightTotal,
  type SheetInventory,
} from "./googleSheets";
import { enqueueSheetGoldSync } from "./sheetGoldSync";
import { bumpStat, checkAndGrant } from "./achievements";
import { loadLifeItems } from "./lifeSkillLoader";
import { grantSkillBookToken, isSkillBookItem } from "./skillbook";
import {
  lifeSkillCategory,
  lifeSkillExpGain,
  lifeSkillKindOf,
  lifeSkillMarketPrice,
  pickLifeSkillCatch,
  type LifeSkillCatch,
  type LifeSkillItem,
  type LifeSkillKind,
  type LifeSkillPoolConfig,
  type LocationLifeConfig,
} from "./lifeSkillData";
import {
  adjustedRankWeights,
  addLifeBagItem,
  applyExp,
  baseWeightsFor,
  boostedLifeExp,
  computeMods,
  isPerkChoiceLevel,
  lifeExpGainText,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  progressOf,
  recordLifeCatch,
  recordCollection,
  recordLifeItemLocation,
  statBuffBonus,
  toolRankRateBonus,
} from "./lifeSkillPerks";
import { fetchLifeSkillCatalog } from "./skillCatalog";

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

function lifeSkillResultText(catchResult: LifeSkillCatch): string {
  const item = catchResult.item;
  return ` 성공! ✨ [${item.rarity}] ${item.name} x1 획득! (크기 ${catchResult.size}, 중량 ${item.weight}, 판매가 ${lifeSkillMarketPrice(catchResult.kind, item)}G)`;
}

function parseLocationLifeConfig(value: string | null): LocationLifeConfig | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LocationLifeConfig;
  } catch {
    return null;
  }
}

function locationPoolConfig(
  life: LocationLifeConfig | null,
  kind: LifeSkillKind,
): LifeSkillPoolConfig | null {
  if (!life) return { enabled: true };
  if (kind === "채집") return life.gather ?? null;
  if (kind === "채광") return life.mine ?? null;
  return life.fish ?? null;
}

function lifeToolTier(kind: LifeSkillKind, name: string): number {
  if (kind === "낚시") {
    if (name === "고급 낚싯대") return 2;
    if (name === "좋은 낚싯대") return 1;
  }
  if (kind === "채집") {
    if (name === "장인의 채집 도구") return 2;
    if (name === "숙련 채집 도구") return 1;
  }
  if (kind === "채광") {
    if (name === "미스릴 곡괭이") return 2;
    if (name === "철 곡괭이") return 1;
  }
  return 0;
}

async function ensureLifeSkillItem(item: LifeSkillItem, kind: LifeSkillKind): Promise<void> {
  const sellPrice = lifeSkillMarketPrice(kind, item);
  await prisma.item.upsert({
    where: { id: item.name },
    create: {
      id: item.name,
      name: item.name,
      category: lifeSkillCategory(kind),
      sellPrice,
      weight: item.weight,
      desc: item.text,
      order: item.no,
    },
    update: {
      name: item.name,
      category: lifeSkillCategory(kind),
      sellPrice,
      weight: item.weight,
      desc: item.text,
      order: item.no,
    },
  });
}

export async function postSystem(locationId: string, content: string): Promise<void> {
  await prisma.worldMessage.create({ data: { locationId, system: true, content } });
  // 이 장소의 채팅 캐시만 즉시 갱신 (접속자 캐시는 건드리지 않는다)
  invalidateWorldMessages(locationId);
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
  // 장소 행동목록·장소정보는 참조 데이터 — 캐시본을 쓴다 (행동마다 DB 재조회 방지)
  const [rawActions, here] = await Promise.all([
    getLocationActionsAt(locationId),
    getLocationById(locationId),
  ]);
  const actions = dedupeLifeActions(rawActions);

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

  const lifeSkillKind = lifeSkillKindOf(target.kind, target.label);
  const life = lifeSkillKind ? parseLifeState(sheet.lifeJson) : null;
  const lifeMods = lifeSkillKind && life ? computeMods(life, lifeSkillKind) : null;
  if (lifeSkillKind && lifeMods) {
    const eventBonus = dailyLifeEventBonus(lifeSkillKind);
    lifeMods.apCostDown += eventBonus.apCostDown;
    lifeMods.luck += eventBonus.luck;
    lifeMods.luck += toolRankRateBonus(lifeToolTier(lifeSkillKind, life!.tools[lifeSkillKind]), lifeMods.toolEff);
  }
  const actionApCost = lifeMods ? Math.max(1, target.apCost - lifeMods.apCostDown) : target.apCost;
  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < actionApCost)
    return { error: `피로도가 부족해요. (필요 ${actionApCost}, 보유 ${ap}) — 6분마다 1씩 회복돼요.` };

  const label = target.label ?? target.kind;
  const emoji = KIND_EMOJI[target.kind] ?? "✨";

  let success = true;
  let margin = 0; // 판정 여유분 — 드랍 추첨에서 꽝 가중치 보정에만 쓰고 밖으로 드러내지 않는다
  let rollLine = "";
  if (target.statLabel && target.dc != null) {
    const baseMod = statModOf(sheet.statsJson, target.statLabel);
    if (baseMod == null)
      return {
        error: `시트에서 ${target.statLabel} 능력치를 찾지 못했어요. 프로필에서 다시 동기화해주세요.`,
      };
    // 요리 판정 버프 (30분 지속) — 보정에 합산
    const buff = statBuffBonus(parseLifeState(sheet.lifeJson), target.statLabel);
    const mod = baseMod + buff;

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    success = total >= target.dc;
    if (success) margin = total - target.dc;
    rollLine = ` — ${diceText(dice, mod, total, target.dc)}${buff > 0 ? ` 🍲버프 +${buff}` : ""}`;
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
    if (lifeSkillKind) {
      // 특성 보정 적용한 등급 추첨 + 숙련도 누적/레벨업
      const locationLife = parseLocationLifeConfig(here?.lifeJson ?? null);
      const locationPool = locationPoolConfig(locationLife, lifeSkillKind);
      if (!locationPool?.enabled) {
        return { error: `이 장소에서는 ${lifeSkillKind}을 할 수 없어요.` };
      }
      const mods = lifeMods!;
      const activeLife = life!;
      const level = progressOf(activeLife, lifeSkillKind).level;
      const levelBase = baseWeightsFor(level);
      const regionBase = locationPool.weights
        ? locationPool.weights.map((weight, rank) => (levelBase[rank] > 0 ? weight : 0))
        : levelBase;
      await loadLifeItems();
      let caught;
      try {
        caught = pickLifeSkillCatch(lifeSkillKind, {
          ...locationPool,
          weights: adjustedRankWeights(mods, regionBase),
        });
      } catch (e) {
        return { error: e instanceof Error ? e.message : `${lifeSkillKind} 목록 설정을 확인해주세요.` };
      }
      const item = caught.item;

      const bag = activeLife.bags[lifeSkillKind];
      const bagWeight = lifeBagWeight(bag);
      const bagMax = lifeBagLimit(activeLife, lifeSkillKind);
      if (bagWeight + item.weight > bagMax) {
        return {
          error: `${bag.name}이 가득 찼어요. (${bagWeight} + ${item.weight} / ${bagMax})`,
        };
      }

      const expBase = lifeSkillExpGain(lifeSkillKind, item.exp);
      const expGained = boostedLifeExp(expBase, mods.expMult);
      const expText = lifeExpGainText(expBase, expGained);
      const leveled = applyExp(activeLife, lifeSkillKind, expGained, await fetchLifeSkillCatalog());
      const firstCatch = recordCollection(activeLife, lifeSkillKind, item.name);
      const caughtCount = recordLifeCatch(activeLife, lifeSkillKind, item.name);
      recordLifeItemLocation(activeLife, lifeSkillKind, item.name, locationId);
      addLifeBagItem(activeLife, lifeSkillKind, {
        name: item.name,
        weight: item.weight,
        rank: item.rank,
        text: item.text,
      });

      await ensureLifeSkillItem(item, lifeSkillKind);
      await prisma.characterSheet.update({
        where: { userId },
        data: { lifeJson: JSON.stringify(activeLife) },
      });

      resultLine = `${lifeSkillResultText(caught)} (+숙련도 ${expText})${
        firstCatch ? " 📖 도감에 새로 등록!" : ` 누적 ${caughtCount}회`
      }`;
      for (const lv of leveled) {
        const perkPrompt = isPerkChoiceLevel(lv)
          ? " 내 캐릭터 페이지 → 생활 데이터에서 새 특성을 선택하세요."
          : "";
        await postSystem(
          locationId,
          `🆙 ${nickname}님의 ${lifeSkillKind} 레벨이 ${lv}이 되었다!${perkPrompt}`,
        );
      }
    } else {
      let drop: DropEntry;
      try {
        drop = pickDrop(JSON.parse(target.dropsJson) as DropEntry[], margin);
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
        void enqueueSheetGoldSync(userId);
        resultLine = ` 성공! ✨ ${drop.gold}G 획득!`;
      } else if (drop.item === "꽝") {
        resultLine = " 꽝... 아무 일도 일어나지 않았다.";
      } else {
        // 드랍 표기는 ID든 이름이든 허용 — 동기화 검증과 동일 기준 (이름만 적어도 효과·해설이 붙는다)
        const item = await prisma.item.findFirst({
          where: { OR: [{ id: drop.item }, { name: drop.item }] },
        });
        const itemId = item?.id ?? drop.item;
        await addItem(userId, itemId, drop.qty);
        if (await isSkillBookItem(itemId)) await grantSkillBookToken(userId, itemId, drop.qty);
        const itemName = item?.name ?? drop.item;
        const effect = item?.desc ?? null;
        const weight = item?.weight ?? 1;
        await prisma.characterSheet.update({
          where: { userId },
          data: {
            invJson: mergeInventorySnapshot(sheet.invJson, itemName, drop.qty, { effect, weight }),
            achStatsJson: bumpStat(sheet.achStatsJson, "아이템획득수", drop.qty),
          },
        });
        void appendSheetItem(sheet.sheetTab, itemName, drop.qty, { effect, weight });
        resultLine = ` 성공! ✨ ${itemName} x${drop.qty} 획득!`;
      }
    }
  }

  await prisma.characterSheet.update({
    where: { userId },
    data: { ap: ap - actionApCost, apResetAt },
  });

  await postSystem(locationId, `${emoji} ${nickname}님의 ${label}${rollLine}${resultLine}`);
  void checkAndGrant(userId);
  return {};
}

// 비밀 키워드로 히든 장소를 발견한다. 완전 비공개 —
// 키워드 입력도, 판정도, 발견 사실도 채팅(공개)에 절대 노출하지 않고
// 결과는 오직 본인에게 notice 로만 돌려준다.
export async function tryKeywordSpeech(
  userId: string,
  sheet: CharacterSheet,
  content: string,
): Promise<{ notice?: string; found?: boolean }> {
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
  // 틀린 키워드/조건 미충족도 조용히 — 시도 자체가 남에게 보이지 않는다.
  if (!target) return { notice: "…아무런 반응이 없다." };

  const foundText = `🗺️ 숨겨진 장소를 발견했다: ${target.emoji ?? "📍"} ${target.name}! 이제 그곳으로 이동할 수 있다.`;
  const discover = async () => {
    await prisma.characterSheet.update({
      where: { userId },
      data: { discoveredJson: JSON.stringify([...discovered, target.id]) },
    });
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
      return { notice: "무언가 희미하게 반응하지만… 열쇠가 되어줄 무언가가 필요해 보인다." };
    await discover();
    return { notice: foundText, found: true };
  }

  if (cond.startsWith("판정")) {
    const cm = cond.match(/^판정\s*[:=>]\s*(.+?)\s*[:=>]\s*(\d+)$/);
    if (!cm) return { notice: "발견 조건 형식이 잘못됐어요. GM에게 알려주세요." };

    const statLabel = cm[1].trim();
    const dc = parseInt(cm[2], 10);
    const baseMod = statModOf(sheet.statsJson, statLabel);
    if (baseMod == null) return { notice: `시트에서 ${statLabel} 능력치를 찾지 못했어요.` };
    // 요리 판정 버프 (30분 지속) — 보정에 합산
    const mod = baseMod + statBuffBonus(parseLifeState(sheet.lifeJson), statLabel);

    const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
    if (ap < KEYWORD_SEARCH_COST)
      return { notice: `탐색할 기력이 없어요. (피로도 ${KEYWORD_SEARCH_COST} 필요)` };

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    const success = total >= dc;
    // 판정 굴림은 개인 기록에만 남기고(공개 채팅 X), AP 차감.
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

    const rollText = diceText(dice, mod, total, dc);
    if (success) {
      await discover();
      return { notice: `${rollText} 성공! ${foundText}`, found: true };
    }
    return { notice: `${rollText} 실패… 아직 길이 보이지 않는다.`, found: false };
  }

  await discover();
  return { notice: foundText, found: true };
}
