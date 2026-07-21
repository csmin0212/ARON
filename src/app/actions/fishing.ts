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

const FISH = "낚시" as const;

export type FishingStart =
  | { ok: true; rarity: string; rank: number; difficulty: number; barBonus: number; drainSlow: number }
  | { error: string };

export type FishingResolve =
  | { ok: true; landed: true; name: string; rarity: string; sell: number; size: number; exp: number }
  | { ok: true; landed: false; readyAt: number } // 놓쳤지만 2분 뒤 수확 가능
  | { error: string };
export type FishingCollect =
  | { ok: true; name: string; rarity: string; sell: number; size: number; exp: number }
  | { error: string };

// 놓친 물고기를 다시 낚을 수 있게 되기까지 대기 (채집·채광 사이드존과 동일)
const MISS_WAIT_MS = 2 * 60_000;

type PendingCatch = {
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
  difficulty: number;
  apCost: number;
  status?: "searching"; // 놓쳐서 재낚시 대기 중
  readyAt?: number; // 대기 완료 시각
};

// 월드 페이지 표시용 — 놓쳐서 다시 물 때까지 대기 중인 상태
export type PendingFishView = { status: "searching"; rarity: string; readyAt: number };

// 등급별 기본 난이도(0~100). 4·5성은 흉악 — 고레벨이라야 잡을 만해진다.
const RANK_DIFFICULTY = [10, 30, 45, 60, 100, 120];
const DIFFICULTY_FLOOR = 10; // 만렙이어도 최소 난이도

// 낚싯대 등급 (이름 → 0/1/2). 등급이 높을수록 캐치바가 커진다.
function rodTier(name: string): number {
  if (name === "고급 낚싯대") return 2;
  if (name === "좋은 낚싯대") return 1;
  return 0;
}

function parseLocationLife(value: string | null): LocationLifeConfig | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as LocationLifeConfig;
  } catch {
    return null;
  }
}

async function ensureItem(p: PendingCatch): Promise<void> {
  const sellPrice = lifeSkillMarketPrice(FISH, { rank: p.rank, price: p.price } as never);
  await prisma.item.upsert({
    where: { id: p.name },
    create: { id: p.name, name: p.name, category: lifeSkillCategory(FISH), sellPrice, weight: p.weight, desc: p.text, order: p.no },
    update: { name: p.name, category: lifeSkillCategory(FISH), sellPrice, weight: p.weight, desc: p.text, order: p.no },
  });
}

function parsePendingCatch(value: string | null): PendingCatch | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as PendingCatch;
  } catch {
    return null;
  }
}

// 물고기 실지급 — 가방/숙련도/도감 반영 + 시스템 메시지. 즉시 성공·2분 뒤 수확 공용.
type FishSheet = { userId: string; lifeJson: string | null; achStatsJson: string | null; locationId: string | null };
type FishGrantResult =
  | { ok: true; landed: true; name: string; rarity: string; sell: number; size: number; exp: number }
  | { error: string };
async function grantFish(
  nickname: string,
  sheet: FishSheet,
  pending: PendingCatch,
  verb: string,
): Promise<FishGrantResult> {
  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, FISH);
  const bag = life.bags[FISH];
  const bagMax = lifeBagLimit(life, FISH);
  if (lifeBagWeight(bag) + pending.weight > bagMax) {
    await prisma.characterSheet.update({ where: { userId: sheet.userId }, data: { pendingCatchJson: null } });
    return { error: `${bag.name}이 가득 차서 놓쳐버렸어요.` };
  }

  const expGained = Math.max(1, Math.round(lifeSkillExpGain(FISH, pending.exp) * mods.expMult));
  const leveled = applyExp(life, FISH, expGained, await fetchLifeSkillCatalog());
  const firstCatch = recordCollection(life, FISH, pending.name);
  const caughtCount = recordLifeCatch(life, FISH, pending.name);
  const locationId = pending.locationId ?? sheet.locationId;
  recordLifeItemLocation(life, FISH, pending.name, locationId);
  addLifeBagItem(life, FISH, { name: pending.name, weight: pending.weight, rank: pending.rank, text: pending.text });

  await ensureItem(pending);
  let achStats = bumpStat(sheet.achStatsJson, "낚시성공횟수");
  achStats = bumpStat(achStats, "아이템획득수");
  if (locationId) achStats = markStat(achStats, `낚시지역:${locationId}`);

  await prisma.characterSheet.update({
    where: { userId: sheet.userId },
    data: { lifeJson: JSON.stringify(life), pendingCatchJson: null, achStatsJson: achStats },
  });
  void checkAndGrant(sheet.userId);

  const sell = lifeSkillMarketPrice(FISH, { rank: pending.rank, price: pending.price } as never);
  if (locationId) {
    await postSystem(
      locationId,
      `🎣 ${nickname}님 — ${verb} ✨ [${pending.rarity}] ${pending.name} x1 (크기 ${pending.size}, 판매가 ${sell}G) +숙련도 ${expGained}${
        firstCatch ? " 📖 도감 신규 등록!" : ` 누적 ${caughtCount}회`
      }`,
    );
    for (const lv of leveled) {
      const perkPrompt = isPerkChoiceLevel(lv)
        ? " 캐릭터 페이지 → 생활 데이터에서 새 특성을 선택하세요."
        : "";
      await postSystem(
        locationId,
        `🆙 ${nickname}님의 낚시 레벨이 ${lv}이 되었다!${perkPrompt}`,
      );
    }
  }

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: true, landed: true, name: pending.name, rarity: pending.rarity, sell, size: pending.size, exp: expGained };
}

// 1단계: 낚기 시작 — AP 차감 + 어종 추첨(서버 보관). 무엇을 걸었는지는 숨김(희귀도만 노출).
export async function startFishing(): Promise<FishingStart> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { error: "월드에 입장한 상태여야 해요." };

  // 놓쳐서 재낚시 대기 중이면 먼저 수확해야 함
  const prev = parsePendingCatch(sheet.pendingCatchJson);
  if (prev?.status === "searching") {
    return { error: "놓친 물고기가 다시 물기를 기다리는 중이에요. 먼저 수확해주세요." };
  }

  const [rawActions, here] = await Promise.all([
    prisma.locationAction.findMany({ where: { locationId: sheet.locationId }, orderBy: { order: "asc" } }),
    prisma.location.findUnique({ where: { id: sheet.locationId }, select: { lifeJson: true } }),
  ]);
  const action = dedupeLifeActions(rawActions).find((a) => lifeSkillKindOf(a.kind, a.label) === FISH);
  if (!action) return { error: "여기서는 낚시를 할 수 없어요." };

  const locationLife = parseLocationLife(here?.lifeJson ?? null);
  const pool = locationLife ? locationLife.fish ?? null : { enabled: true };
  if (!pool?.enabled) return { error: "여기서는 낚시를 할 수 없어요." };

  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, FISH, lifeLuckModFromStats(sheet.statsJson));
  const eventBonus = dailyLifeEventBonus(FISH);
  mods.apCostDown += eventBonus.apCostDown;
  mods.luck += eventBonus.luck;

  // '효율적인 정리' — 피로도 소모 감소 (최소 1은 소모)
  const apCost = Math.max(1, action.apCost - mods.apCostDown);
  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < apCost) {
    return { error: `피로도가 부족해요. (필요 ${apCost}, 보유 ${ap})` };
  }
  const level = progressOf(life, FISH).level;
  const levelBase = baseWeightsFor(level);
  const regionBase = pool.weights
    ? pool.weights.map((w, rank) => (levelBase[rank] > 0 ? w : 0))
    : levelBase;
  await loadLifeItems();
  let caught;
  try {
    caught = pickLifeSkillCatch(FISH, { ...pool, weights: adjustedRankWeights(mods, regionBase, level) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "낚시 목록 설정을 확인해주세요." };
  }
  const item = caught.item;

  const bag = life.bags[FISH];
  const bagMax = lifeBagLimit(life, FISH);
  if (lifeBagWeight(bag) + item.weight > bagMax) {
    return { error: `${bag.name}이 가득 찼어요. (${lifeBagWeight(bag)} + ${item.weight} / ${bagMax})` };
  }

  // 효과 난이도 = max(10, 등급기본 − 레벨 − 낚싯대보정), 상한 100 → 0~1로 변환
  // '낚싯대 숙련' 특성 — 낚싯대 보정 공식을 N% 개선 (기본 낚싯대는 보정 0이라 효과 없음)
  const rankDiff = RANK_DIFFICULTY[item.rank] ?? 60;
  const rodRelief = rodTier(life.tools.낚시) * 10 * (1 + mods.toolEff / 100); // 좋은 -10 / 고급 -20
  const eff = Math.max(DIFFICULTY_FLOOR, Math.min(100, rankDiff - level - rodRelief));
  const difficulty = eff / 100;
  const barBonus = 0; // 낚싯대 효과는 난이도 하락으로 통합
  const pending: PendingCatch = {
    no: item.no,
    name: item.name,
    locationId: sheet.locationId,
    rank: item.rank,
    rarity: item.rarity,
    weight: item.weight,
    price: item.price,
    text: item.text,
    exp: item.exp,
    size: caught.size,
    difficulty,
    apCost,
  };

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - apCost, apResetAt, pendingCatchJson: JSON.stringify(pending) },
  });

  return { ok: true, rarity: item.rarity, rank: item.rank, difficulty, barBonus, drainSlow: mods.gaugeSlow };
}

// 2단계: 결과 — 성공 시 즉시 지급, 실패 시 놓친 물고기가 2분 뒤 다시 물게 대기 상태로.
export async function resolveFishing(landed: boolean): Promise<FishingResolve> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.pendingCatchJson) return { error: "진행 중인 낚시가 없어요." };

  const pending = parsePendingCatch(sheet.pendingCatchJson);
  if (!pending || pending.status === "searching") {
    return { error: "진행 중인 낚시가 없어요." };
  }
  const locationId = pending.locationId ?? sheet.locationId;

  if (!landed) {
    // 놓침 — 채집·채광처럼 2분 뒤 다시 물어서 낚을 수 있게 대기 상태로 둔다. (피로도는 이미 소모)
    const readyAt = Date.now() + MISS_WAIT_MS;
    const next: PendingCatch = { ...pending, status: "searching", readyAt };
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: {
        pendingCatchJson: JSON.stringify(next),
        achStatsJson: bumpStat(sheet.achStatsJson, "낚시실패횟수"),
      },
    });
    void checkAndGrant(user.id);
    if (locationId) {
      await postSystem(
        locationId,
        `🎣 ${user.nickname}님 — 놓쳤다! 하지만 2분 뒤 다시 물면 낚을 수 있어요.`,
      );
    }
    revalidatePath("/world");
    revalidatePath("/profile");
    return { ok: true, landed: false, readyAt };
  }

  return await grantFish(user.nickname, sheet, pending, "잡았다!");
}

// 3단계: 놓친 물고기 재낚시 — 2분 지나면 수확
export async function collectFishing(): Promise<FishingCollect> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  const pending = parsePendingCatch(sheet?.pendingCatchJson ?? null);
  if (!sheet || !pending || pending.status !== "searching" || pending.readyAt == null) {
    return { error: "다시 낚을 물고기가 없어요." };
  }
  if (Date.now() < pending.readyAt) return { error: "아직 물지 않았어요." };

  const res = await grantFish(user.nickname, sheet, pending, "다시 낚았다!");
  if ("error" in res) return { error: res.error };
  return { ok: true, name: res.name, rarity: res.rarity, sell: res.sell, size: res.size, exp: res.exp };
}
