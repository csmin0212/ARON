"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant, markStat } from "@/lib/achievements";
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
  computeMods,
  isPerkChoiceLevel,
  lifeBagLimit,
  lifeBagWeight,
  lifeLuckModFromStats,
  parseLifeState,
  progressOf,
  recordCollection,
  recordLifeItemLocation,
  recordLifeCatch,
} from "@/lib/lifeSkillPerks";
import { fetchLifeSkillCatalog } from "@/lib/skillCatalog";

const GATHER = "채집" as const;
const SIDE_WAIT_MS = 2 * 60_000; // 사이드 명중 → 2분
const MISS_WAIT_MS = 5 * 60_000; // 빗나감 → 5분

// 낚시와 동일한 등급별 기본 난이도/공식
const RANK_DIFFICULTY = [10, 30, 45, 60, 100, 120];
const DIFFICULTY_FLOOR = 10;
function toolTier(name: string): number {
  if (name === "장인의 채집 도구") return 2;
  if (name === "숙련 채집 도구") return 1;
  return 0;
}

export type GatherStart =
  | { ok: true; rarity: string; rank: number; difficulty: number; drainSlow: number }
  | { error: string };
export type GatherResolve =
  | { ok: true; mode: "instant"; name: string; rarity: string; sell: number; exp: number }
  | { ok: true; mode: "searching"; readyAt: number; waitSec: number }
  | { error: string };
export type GatherCollect =
  | { ok: true; name: string; rarity: string; sell: number; exp: number }
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

export type PendingGatherView = {
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
  const sellPrice = lifeSkillMarketPrice(GATHER, { rank: p.rank, price: p.price } as never);
  await prisma.item.upsert({
    where: { id: p.name },
    create: { id: p.name, name: p.name, category: lifeSkillCategory(GATHER), sellPrice, weight: p.weight, desc: p.text, order: p.no },
    update: { name: p.name, category: lifeSkillCategory(GATHER), sellPrice, weight: p.weight, desc: p.text, order: p.no },
  });
}

// 채집물을 실제 가방에 지급 + 숙련도/도감 기록 + 시스템 메시지
async function grant(userId: string, nickname: string, locationId: string | null, p: Pending, how: string) {
  const sheet = await prisma.characterSheet.findUnique({ where: { userId } });
  const originLocationId = p.locationId ?? locationId;
  const life = parseLifeState(sheet?.lifeJson);
  const mods = computeMods(life, GATHER);
  const bag = life.bags[GATHER];
  if (lifeBagWeight(bag) + p.weight > lifeBagLimit(life, GATHER)) {
    return { full: true as const };
  }
  const expGained = Math.max(1, Math.round(lifeSkillExpGain(GATHER, p.exp) * mods.expMult));
  const leveled = applyExp(life, GATHER, expGained, await fetchLifeSkillCatalog());
  const first = recordCollection(life, GATHER, p.name);
  const count = recordLifeCatch(life, GATHER, p.name);
  recordLifeItemLocation(life, GATHER, p.name, originLocationId);
  addLifeBagItem(life, GATHER, { name: p.name, weight: p.weight, rank: p.rank, text: p.text });
  await ensureItem(p);
  let achStats = bumpStat(sheet?.achStatsJson, "채집성공횟수");
  achStats = bumpStat(achStats, "아이템획득수");
  if (originLocationId) achStats = markStat(achStats, `채집지역:${originLocationId}`);

  await prisma.characterSheet.update({
    where: { userId },
    data: {
      lifeJson: JSON.stringify(life),
      pendingGatherJson: null,
      achStatsJson: achStats,
    },
  });
  void checkAndGrant(userId);
  const sell = lifeSkillMarketPrice(GATHER, { rank: p.rank, price: p.price } as never);
  if (originLocationId) {
    await postSystem(
      originLocationId,
      `🌿 ${nickname}님 ${how} — [${p.rarity}] ${p.name} x1 (판매가 ${sell}G) +숙련도 ${expGained}${
        first ? " 📖 도감 신규!" : ` 누적 ${count}회`
      }`,
    );
    for (const lv of leveled) {
      const perkPrompt = isPerkChoiceLevel(lv) ? " 캐릭터 페이지에서 특성을 선택하세요." : "";
      await postSystem(originLocationId, `🆙 ${nickname}님의 채집 레벨이 ${lv}이 되었다!${perkPrompt}`);
    }
  }
  return { full: false as const, sell, exp: expGained };
}

// 1단계: 채집 시작 — AP 차감 + 채집물 추첨
export async function startGathering(): Promise<GatherStart> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { error: "월드에 입장한 상태여야 해요." };

  const prev = parsePending(sheet.pendingGatherJson);
  if (prev?.status === "searching") return { error: "이미 탐색 중인 채집이 있어요. 먼저 수확해주세요." };

  const [rawActions, here] = await Promise.all([
    prisma.locationAction.findMany({ where: { locationId: sheet.locationId }, orderBy: { order: "asc" } }),
    prisma.location.findUnique({ where: { id: sheet.locationId }, select: { lifeJson: true } }),
  ]);
  const action = dedupeLifeActions(rawActions).find((a) => lifeSkillKindOf(a.kind, a.label) === GATHER);
  if (!action) return { error: "여기서는 채집을 할 수 없어요." };

  const locationLife = parseLocationLife(here?.lifeJson ?? null);
  const pool = locationLife ? locationLife.gather ?? null : { enabled: true };
  if (!pool?.enabled) return { error: "여기서는 채집을 할 수 없어요." };

  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, GATHER, lifeLuckModFromStats(sheet.statsJson));

  // '효율적인 정리' — 피로도 소모 감소 (최소 1은 소모)
  const apCost = Math.max(1, action.apCost - mods.apCostDown);
  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < apCost) return { error: `피로도가 부족해요. (필요 ${apCost}, 보유 ${ap})` };

  const level = progressOf(life, GATHER).level;
  const levelBase = baseWeightsFor(level);
  const regionBase = pool.weights
    ? pool.weights.map((w, rank) => (levelBase[rank] > 0 ? w : 0))
    : levelBase;
  await loadLifeItems();
  let caught;
  try {
    caught = pickLifeSkillCatch(GATHER, { ...pool, weights: adjustedRankWeights(mods, regionBase, level) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "채집 목록 설정을 확인해주세요." };
  }
  const item = caught.item;

  const bag = life.bags[GATHER];
  if (lifeBagWeight(bag) + item.weight > lifeBagLimit(life, GATHER)) {
    return { error: `${bag.name}이 가득 찼어요.` };
  }

  // '채집 숙련' 특성 — 도구 보정 공식을 N% 개선 (기본 도구는 보정 0이라 효과 없음)
  const rankDiff = RANK_DIFFICULTY[item.rank] ?? 60;
  const rodRelief = toolTier(life.tools.채집) * 10 * (1 + mods.toolEff / 100);
  const difficulty = Math.max(DIFFICULTY_FLOOR, Math.min(100, rankDiff - level - rodRelief)) / 100;

  const pending: Pending = {
    no: item.no, name: item.name, rank: item.rank, rarity: item.rarity, weight: item.weight,
    locationId: sheet.locationId, price: item.price, text: item.text, exp: item.exp, size: caught.size, status: "playing",
  };
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - apCost, apResetAt, pendingGatherJson: JSON.stringify(pending) },
  });
  return { ok: true, rarity: item.rarity, rank: item.rank, difficulty, drainSlow: mods.gaugeSlow };
}

// 2단계: 타이밍 결과 — 정중앙(즉시) / 사이드(2분) / 빗나감(5분)
export async function resolveGathering(zone: "center" | "side" | "miss"): Promise<GatherResolve> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  const p = parsePending(sheet?.pendingGatherJson ?? null);
  if (!p || p.status !== "playing") return { error: "진행 중인 채집이 없어요." };

  if (zone === "center") {
    const res = await grant(user.id, user.nickname, sheet!.locationId, p, "정확히 채집했다!");
    if (res.full) {
      await prisma.characterSheet.update({ where: { userId: user.id }, data: { pendingGatherJson: null } });
      return { error: "가방이 가득 차서 놓쳤어요." };
    }
    revalidatePath("/world");
    revalidatePath("/profile");
    return { ok: true, mode: "instant", name: p.name, rarity: p.rarity, sell: res.sell, exp: res.exp };
  }

  const waitMs = zone === "side" ? SIDE_WAIT_MS : MISS_WAIT_MS;
  const readyAt = Date.now() + waitMs;
  const next: Pending = { ...p, status: "searching", readyAt };
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { pendingGatherJson: JSON.stringify(next) },
  });
  revalidatePath("/world");
  return { ok: true, mode: "searching", readyAt, waitSec: Math.round(waitMs / 1000) };
}

// 3단계: 탐색 완료 후 수확
export async function collectGathering(): Promise<GatherCollect> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  const p = parsePending(sheet?.pendingGatherJson ?? null);
  if (!p || p.status !== "searching" || p.readyAt == null) return { error: "수확할 채집이 없어요." };
  if (Date.now() < p.readyAt) return { error: "아직 탐색 중이에요." };

  const res = await grant(user.id, user.nickname, sheet!.locationId, p, "탐색 완료 —");
  if (res.full) return { error: "가방이 가득 찼어요. 비우고 다시 수확하세요." };
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: true, name: p.name, rarity: p.rarity, sell: res.sell, exp: res.exp };
}
