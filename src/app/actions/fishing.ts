"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { dedupeLifeActions } from "@/lib/locationActions";
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
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  progressOf,
  recordCollection,
  recordLifeCatch,
} from "@/lib/lifeSkillPerks";

const FISH = "낚시" as const;

export type FishingStart =
  | { ok: true; rarity: string; rank: number; difficulty: number; barBonus: number }
  | { error: string };

export type FishingResolve =
  | { ok: true; landed: true; name: string; rarity: string; sell: number; size: number; exp: number }
  | { ok: true; landed: false }
  | { error: string };

type PendingCatch = {
  no: number;
  name: string;
  rank: number;
  rarity: string;
  weight: number;
  price: number;
  text: string;
  exp: number;
  size: number;
  difficulty: number;
};

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
    create: { id: p.name, name: p.name, category: lifeSkillCategory(FISH), sellPrice, desc: p.text, order: p.no },
    update: { name: p.name, category: lifeSkillCategory(FISH), sellPrice, desc: p.text, order: p.no },
  });
}

// 1단계: 낚기 시작 — AP 차감 + 어종 추첨(서버 보관). 무엇을 걸었는지는 숨김(희귀도만 노출).
export async function startFishing(): Promise<FishingStart> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { error: "월드에 입장한 상태여야 해요." };

  const [rawActions, here] = await Promise.all([
    prisma.locationAction.findMany({ where: { locationId: sheet.locationId }, orderBy: { order: "asc" } }),
    prisma.location.findUnique({ where: { id: sheet.locationId }, select: { lifeJson: true } }),
  ]);
  const action = dedupeLifeActions(rawActions).find((a) => lifeSkillKindOf(a.kind, a.label) === FISH);
  if (!action) return { error: "여기서는 낚시를 할 수 없어요." };

  const locationLife = parseLocationLife(here?.lifeJson ?? null);
  const pool = locationLife ? locationLife.fish ?? null : { enabled: true };
  if (!pool?.enabled) return { error: "여기서는 낚시를 할 수 없어요." };

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < action.apCost) {
    return { error: `피로도가 부족해요. (필요 ${action.apCost}, 보유 ${ap})` };
  }

  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, FISH);
  const level = progressOf(life, FISH).level;
  const levelBase = baseWeightsFor(level);
  const regionBase = pool.weights
    ? pool.weights.map((w, rank) => (levelBase[rank] > 0 ? w : 0))
    : levelBase;
  let caught;
  try {
    caught = pickLifeSkillCatch(FISH, { ...pool, weights: adjustedRankWeights(mods, regionBase) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "낚시 목록 설정을 확인해주세요." };
  }
  const item = caught.item;

  const bag = life.bags[FISH];
  const bagMax = lifeBagLimit(life, FISH, mods.weightBonus);
  if (lifeBagWeight(bag) + item.weight > bagMax) {
    return { error: `${bag.name}이 가득 찼어요. (${lifeBagWeight(bag)} + ${item.weight} / ${bagMax})` };
  }

  // 효과 난이도 = max(10, 등급기본 − 레벨 − 낚싯대보정), 상한 100 → 0~1로 변환
  const rankDiff = RANK_DIFFICULTY[item.rank] ?? 60;
  const rodRelief = rodTier(life.tools.낚시) * 10; // 좋은 -10 / 고급 -20
  const eff = Math.max(DIFFICULTY_FLOOR, Math.min(100, rankDiff - level - rodRelief));
  const difficulty = eff / 100;
  const barBonus = 0; // 낚싯대 효과는 난이도 하락으로 통합
  const pending: PendingCatch = {
    no: item.no,
    name: item.name,
    rank: item.rank,
    rarity: item.rarity,
    weight: item.weight,
    price: item.price,
    text: item.text,
    exp: item.exp,
    size: caught.size,
    difficulty,
  };

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - action.apCost, apResetAt, pendingCatchJson: JSON.stringify(pending) },
  });

  return { ok: true, rarity: item.rarity, rank: item.rank, difficulty, barBonus };
}

// 2단계: 결과 — 성공 시 지급, 실패 시 빈손. 어느 쪽이든 진행 상태 정리.
export async function resolveFishing(landed: boolean): Promise<FishingResolve> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.pendingCatchJson) return { error: "진행 중인 낚시가 없어요." };

  let pending: PendingCatch;
  try {
    pending = JSON.parse(sheet.pendingCatchJson) as PendingCatch;
  } catch {
    await prisma.characterSheet.update({ where: { userId: user.id }, data: { pendingCatchJson: null } });
    return { error: "낚시 정보를 읽지 못했어요." };
  }
  const locationId = sheet.locationId;

  if (!landed) {
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { pendingCatchJson: null, achStatsJson: bumpStat(sheet.achStatsJson, "낚시실패횟수") },
    });
    void checkAndGrant(user.id);
    if (locationId) {
      await postSystem(locationId, `🎣 ${user.nickname}님 — 놓쳤다! 미끼만 물고 달아났다…`);
    }
    revalidatePath("/world");
    revalidatePath("/profile");
    return { ok: true, landed: false };
  }

  const life = parseLifeState(sheet.lifeJson);
  const mods = computeMods(life, FISH);
  const bag = life.bags[FISH];
  const bagMax = lifeBagLimit(life, FISH, mods.weightBonus);
  if (lifeBagWeight(bag) + pending.weight > bagMax) {
    await prisma.characterSheet.update({ where: { userId: user.id }, data: { pendingCatchJson: null } });
    return { error: `${bag.name}이 가득 차서 놓쳐버렸어요.` };
  }

  const expGained = Math.max(1, Math.round(lifeSkillExpGain(FISH, pending.exp) * mods.expMult));
  const leveled = applyExp(life, FISH, expGained);
  const firstCatch = recordCollection(life, FISH, pending.name);
  const caughtCount = recordLifeCatch(life, FISH, pending.name);
  addLifeBagItem(life, FISH, { name: pending.name, weight: pending.weight, rank: pending.rank, text: pending.text });

  await ensureItem(pending);
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      lifeJson: JSON.stringify(life),
      pendingCatchJson: null,
      achStatsJson: bumpStat(sheet.achStatsJson, "낚시성공횟수"),
    },
  });
  void checkAndGrant(user.id);

  const sell = lifeSkillMarketPrice(FISH, { rank: pending.rank, price: pending.price } as never);
  if (locationId) {
    await postSystem(
      locationId,
      `🎣 ${user.nickname}님 — 잡았다! ✨ [${pending.rarity}] ${pending.name} x1 (크기 ${pending.size}, 판매가 ${sell}G) +숙련도 ${expGained}${
        firstCatch ? " 📖 도감 신규 등록!" : ` 누적 ${caughtCount}회`
      }`,
    );
    for (const lv of leveled) {
      await postSystem(
        locationId,
        `🆙 ${user.nickname}님의 낚시 레벨이 ${lv}이 되었다! 캐릭터 페이지 → 생활 데이터에서 새 특성을 선택하세요.`,
      );
    }
  }

  revalidatePath("/world");
  revalidatePath("/profile");
  return {
    ok: true,
    landed: true,
    name: pending.name,
    rarity: pending.rarity,
    sell,
    size: pending.size,
    exp: expGained,
  };
}
