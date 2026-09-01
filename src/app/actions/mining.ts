"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant, markStat } from "@/lib/achievements";
import { dailyLifeEventBonus } from "@/lib/dailyEvents";
import { dedupeLifeActions } from "@/lib/locationActions";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import {
  lifeSkillCategory,
  lifeSkillExpGain,
  lifeSkillKindOf,
  lifeSkillMarketPrice,
  pickLifeSkillCatch,
  type LocationLifeConfig,
} from "@/lib/lifeSkillData";
import {
  addLifeBagItem,
  adjustedRankWeights,
  applyExp,
  baseWeightsFor,
  boostedLifeExp,
  computeMods,
  isPerkChoiceLevel,
  lifeLuckModFromStats,
  lifeExpGainText,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  progressOf,
  recordCollection,
  recordLifeItemLocation,
  recordLifeCatch,
  toolRankRateBonus,
} from "@/lib/lifeSkillPerks";
import { fetchLifeSkillCatalog } from "@/lib/skillCatalog";

const MINE = "채광" as const;
const SIDE_WAIT_MS = 2 * 60_000; // 사이드 명중 → 2분
const MISS_WAIT_MS = 5 * 60_000; // 빗나감 → 5분

// 채집·낚시와 동일한 등급별 기본 난이도/공식
const RANK_DIFFICULTY = [10, 30, 45, 60, 100, 120];
const DIFFICULTY_FLOOR = 10;
function toolTier(name: string): number {
  if (name === "미스릴 곡괭이") return 2;
  if (name === "철 곡괭이") return 1;
  return 0;
}

export type MineStart =
  | { ok: true; rarity: string; rank: number; difficulty: number; drainSlow: number }
  | { error: string };
export type MineResolve =
  | { ok: true; mode: "instant"; name: string; rarity: string; sell: number; exp: number; expBase: number }
  | { ok: true; mode: "searching"; readyAt: number; waitSec: number }
  | { error: string };
export type MineCollect =
  | { ok: true; name: string; rarity: string; sell: number; exp: number; expBase: number }
  | { error: string };

type Pending = {
  no: number;
  name: string;
  locationId?: string | null;
  rank: number;
  rarity: string;
  weight: number;
  price: number;
  text: string;
  exp: number;
  size: number;
  status: "playing" | "searching";
  readyAt?: number;
};

export type PendingMineView = {
  status: "searching";
  rarity: string;
  readyAt: number;
};

function parseLocationLife(value: string | null): LocationLifeConfig | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LocationLifeConfig;
  } catch {
    return null;
  }
}
function parsePending(value: string | null): Pending | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Pending;
  } catch {
    return null;
  }
}

async function ensureItem(p: Pending): Promise<void> {
  const sellPrice = lifeSkillMarketPrice(MINE, { rank: p.rank, price: p.price } as never);
  await prisma.item.upsert({
    where: { id: p.name },
    create: { id: p.name, name: p.name, category: lifeSkillCategory(MINE), sellPrice, weight: p.weight, desc: p.text, order: p.no },
    update: { name: p.name, category: lifeSkillCategory(MINE), sellPrice, weight: p.weight, desc: p.text, order: p.no },
  });
}

// 광석을 실제 가방에 지급 + 숙련도/도감 기록 + 시스템 메시지
async function grant(userId: string, nickname: string, locationId: string | null, p: Pending, how: string) {
  const sheet = await prisma.characterSheet.findUnique({ where: { userId } });
  const originLocationId = p.locationId ?? locationId;
  const life = parseLifeState(sheet?.lifeJson);
  const mods = computeMods(life, MINE);
  const bag = life.bags[MINE];
  if (lifeBagWeight(bag) + p.weight > lifeBagLimit(life, MINE)) {
    return { full: true as const };
  }
  const first = recordCollection(life, MINE, p.name);
  const count = recordLifeCatch(life, MINE, p.name);
  recordLifeItemLocation(life, MINE, p.name, originLocationId);
  addLifeBagItem(life, MINE, { name: p.name, weight: p.weight, rank: p.rank, text: p.text });
  // 일석이조 — doubleDrop% 확률로 광물 1개 추가 (가방에 여유가 있을 때만)
  const doubled =
    mods.doubleDrop > 0 &&
    Math.random() * 100 < mods.doubleDrop &&
    lifeBagWeight(bag) + p.weight <= lifeBagLimit(life, MINE);
  if (doubled) addLifeBagItem(life, MINE, { name: p.name, weight: p.weight, rank: p.rank, text: p.text });
  const gotQty = doubled ? 2 : 1;
  // 숙련도도 얻은 개수만큼. 추첨 결과를 알아야 해서 일석이조 판정 뒤에 계산한다.
  const expBase = lifeSkillExpGain(MINE, p.exp) * gotQty;
  const expGained = boostedLifeExp(expBase, mods.expMult);
  const expText = lifeExpGainText(expBase, expGained);
  const leveled = applyExp(life, MINE, expGained, await fetchLifeSkillCatalog());
  await ensureItem(p);
  let achStats = bumpStat(sheet?.achStatsJson, "채광성공횟수");
  achStats = bumpStat(achStats, "아이템획득수", gotQty);
  if (originLocationId) achStats = markStat(achStats, `채광지역:${originLocationId}`);

  await prisma.characterSheet.update({
    where: { userId },
    data: {
      lifeJson: JSON.stringify(life),
      pendingMineJson: null,
      achStatsJson: achStats,
    },
  });
  void checkAndGrant(userId);
  const sell = lifeSkillMarketPrice(MINE, { rank: p.rank, price: p.price } as never);
  if (originLocationId) {
    const actor = { userId, actorName: nickname, kind: "채광" as const };
    await postSystem(
      originLocationId,
      `⛏️ ${nickname}님 ${how} — [${p.rarity}] ${p.name} x${gotQty}${gotQty > 1 ? " ✨일석이조!" : ""} (판매가 ${sell}G) +숙련도 ${expText}${
        first ? " 📖 도감 신규!" : ` 누적 ${count}회`
      }`,
      actor,
    );
    for (const lv of leveled) {
      const perkPrompt = isPerkChoiceLevel(lv) ? " 캐릭터 페이지에서 특성을 선택하세요." : "";
      await postSystem(originLocationId, `🆙 ${nickname}님의 채광 레벨이 ${lv}이 되었다!${perkPrompt}`, actor);
    }
  }
  return { full: false as const, sell, exp: expGained, expBase };
}

// 1단계: 채광 시작 — AP 차감 + 광물 추첨
export async function startMining(): Promise<MineStart> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { error: "월드에 입장한 상태여야 해요." };

  const prev = parsePending(sheet.pendingMineJson);
  if (prev?.status === "searching") return { error: "이미 캐는 중인 광맥이 있어요. 먼저 수확해주세요." };

  const [rawActions, here] = await Promise.all([
    prisma.locationAction.findMany({ where: { locationId: sheet.locationId }, orderBy: { order: "asc" } }),
    prisma.location.findUnique({ where: { id: sheet.locationId }, select: { lifeJson: true } }),
  ]);
  const action = dedupeLifeActions(rawActions).find((a) => lifeSkillKindOf(a.kind, a.label) === MINE);
  if (!action) return { error: "여기서는 채광을 할 수 없어요." };

  const locationLife = parseLocationLife(here?.lifeJson ?? null);
  const pool = locationLife ? locationLife.mine ?? null : { enabled: true };
  if (!pool?.enabled) return { error: "여기서는 채광을 할 수 없어요." };

  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, MINE, lifeLuckModFromStats(sheet.statsJson));
  const eventBonus = dailyLifeEventBonus(MINE);
  mods.apCostDown += eventBonus.apCostDown;
  mods.luck += eventBonus.luck;
  const mineToolTier = toolTier(life.tools.채광);
  mods.luck += toolRankRateBonus(mineToolTier, mods.toolEff);

  // '효율적인 정리' — 피로도 소모 감소 (최소 1은 소모)
  const apCost = Math.max(1, action.apCost - mods.apCostDown);
  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < apCost) return { error: `피로도가 부족해요. (필요 ${apCost}, 보유 ${ap})` };

  const level = progressOf(life, MINE).level;
  const levelBase = baseWeightsFor(level);
  const regionBase = pool.weights
    ? pool.weights.map((w, rank) => (levelBase[rank] > 0 ? w : 0))
    : levelBase;
  await loadLifeItems();
  let caught;
  try {
    caught = pickLifeSkillCatch(MINE, { ...pool, weights: adjustedRankWeights(mods, regionBase, level) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "채광 목록 설정을 확인해주세요." };
  }
  const item = caught.item;

  const bag = life.bags[MINE];
  if (lifeBagWeight(bag) + item.weight > lifeBagLimit(life, MINE)) {
    return { error: `${bag.name}이 가득 찼어요.` };
  }

  // '곡괭이 숙련' 특성 — 도구 보정 공식을 N% 개선 (기본 도구는 보정 0이라 효과 없음)
  const rankDiff = RANK_DIFFICULTY[item.rank] ?? 60;
  const rodRelief = mineToolTier * 10 * (1 + mods.toolEff / 100);
  const difficulty = Math.max(DIFFICULTY_FLOOR, Math.min(100, rankDiff - level - rodRelief)) / 100;

  const pending: Pending = {
    no: item.no, name: item.name, rank: item.rank, rarity: item.rarity, weight: item.weight,
    locationId: sheet.locationId, price: item.price, text: item.text, exp: item.exp, size: caught.size, status: "playing",
  };
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - apCost, apResetAt, pendingMineJson: JSON.stringify(pending) },
  });
  return { ok: true, rarity: item.rarity, rank: item.rank, difficulty, drainSlow: mods.gaugeSlow };
}

// 2단계: 타격 결과 — 균열 완성(즉시) / 부분(2분) / 빗나감(5분)
export async function resolveMining(zone: "center" | "side" | "miss"): Promise<MineResolve> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  const p = parsePending(sheet?.pendingMineJson ?? null);
  if (!p || p.status !== "playing") return { error: "진행 중인 채광이 없어요." };

  if (zone === "center") {
    const res = await grant(user.id, user.nickname, sheet!.locationId, p, "광맥을 깔끔하게 깨뜨렸다!");
    if (res.full) {
      await prisma.characterSheet.update({ where: { userId: user.id }, data: { pendingMineJson: null } });
      return { error: "가방이 가득 차서 놓쳤어요." };
    }
    revalidatePath("/world");
    revalidatePath("/profile");
    return { ok: true, mode: "instant", name: p.name, rarity: p.rarity, sell: res.sell, exp: res.exp, expBase: res.expBase };
  }

  const waitMs = zone === "side" ? SIDE_WAIT_MS : MISS_WAIT_MS;
  const readyAt = Date.now() + waitMs;
  const next: Pending = { ...p, status: "searching", readyAt };
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { pendingMineJson: JSON.stringify(next) },
  });
  revalidatePath("/world");
  return { ok: true, mode: "searching", readyAt, waitSec: Math.round(waitMs / 1000) };
}

// 3단계: 채굴 완료 후 수확
export async function collectMining(): Promise<MineCollect> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  const p = parsePending(sheet?.pendingMineJson ?? null);
  if (!p || p.status !== "searching" || p.readyAt == null) return { error: "수확할 광물이 없어요." };
  if (Date.now() < p.readyAt) return { error: "아직 채굴 중이에요." };

  const res = await grant(user.id, user.nickname, sheet!.locationId, p, "채굴 완료 —");
  if (res.full) return { error: "가방이 가득 찼어요. 비우고 다시 수확하세요." };
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: true, name: p.name, rarity: p.rarity, sell: res.sell, exp: res.exp, expBase: res.expBase };
}
