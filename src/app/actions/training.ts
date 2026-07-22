"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { freshAp, postSystem } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { appendSheetAbilityBase, appendSheetFormula, type AbilityKey } from "@/lib/googleSheets";

// ── 길드 뒷마당 「단련」 ──
// 피로도 5 를 써서 단련한다. 누적 횟수는 화면에 보이지 않고 내부(achStatsJson)에만 쌓인다.
// - 100~900회: 매 100회마다 "성장할 능력치" 선택 1회씩 (총 9회 → 능력치 +1)
// - 1000·3000·5000회: 스킬 포인트 +1 (시트 AF61)
// - 10000회: 스킬 포인트 +2
// 카운터 키(achStatsJson):
//   단련횟수      = 총 단련 횟수 (업적 조건타입도 이 값을 그대로 읽음)
//   단련성장선택  = 지금까지 소비한 능력치 선택 횟수 (0~9)
//   단련스킬포인트 = 지금까지 지급한 스킬 포인트 총합 (지급 멱등성 보장)

const TRAIN_AP = 5;
const SKILL_POINT_CELL = "AF61";
const MAX_STAT_PICKS = 9; // 100~900회, 9회
const SP_THRESHOLDS: { at: number; points: number }[] = [
  { at: 1000, points: 1 },
  { at: 3000, points: 1 },
  { at: 5000, points: 1 },
  { at: 10000, points: 2 },
];

const ABILITIES: { key: AbilityKey; label: string }[] = [
  { key: "STR", label: "근력" },
  { key: "DEX", label: "재주" },
  { key: "AGI", label: "민첩" },
  { key: "INT", label: "지력" },
  { key: "PER", label: "감지" },
  { key: "SPI", label: "정신" },
  { key: "LUK", label: "행운" },
];
const ABILITY_BY_KEY = new Map(ABILITIES.map((a) => [a.key, a]));

export type TrainResult =
  | {
      ok: true;
      ap: number;
      statMilestone: number | null; // 이번에 새로 열린 능력치 선택 마일스톤(100~900), 없으면 null
      pendingPicks: number; // 현재 밀린 능력치 선택 수
      skillPoints: number; // 이번 단련으로 지급된 스킬 포인트
      spMilestone: number | null; // 스킬 포인트가 나온 마일스톤(1000/3000/5000/10000)
      spWriteFailed: boolean; // AF61 기록 실패 여부(다음 단련 때 재시도됨)
    }
  | { error: string };

export type TrainPickResult = { ok: true; label: string; remaining: number } | { error: string };

function parseStats(json: string | null | undefined): Record<string, number> {
  try {
    if (json) return JSON.parse(json) as Record<string, number>;
  } catch {
    /* noop */
  }
  return {};
}

function statPicksReached(count: number): number {
  return Math.min(MAX_STAT_PICKS, Math.floor(count / 100));
}

function totalSkillPointsFor(count: number): number {
  return SP_THRESHOLDS.reduce((sum, t) => sum + (count >= t.at ? t.points : 0), 0);
}

// 이번 단련이 처음으로 넘긴 스킬 포인트 마일스톤(있으면) — 표시용
function crossedSpMilestone(prevCount: number, nextCount: number): number | null {
  for (const t of SP_THRESHOLDS) {
    if (prevCount < t.at && nextCount >= t.at) return t.at;
  }
  return null;
}

const GUILD_BACKYARD_KEYWORDS = [
  "길드 뒷마당",
  "길드뒷마당",
  "guild backyard",
  "guild_backyard",
  "guildbackyard",
  "training yard",
  "training_yard",
  "trainingyard",
];

// 현재 위치가 길드 뒷마당 단련을 이용할 수 있는 곳인지
async function canUseGuildYard(locationId: string | null): Promise<boolean> {
  if (!locationId) return false;
  const [location, actions] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } }),
    prisma.locationAction.findMany({ where: { locationId }, select: { kind: true, label: true } }),
  ]);
  const source = [location?.id ?? "", location?.name ?? "", ...actions.flatMap((a) => [a.kind, a.label ?? ""])]
    .join(" ")
    .toLowerCase();
  return GUILD_BACKYARD_KEYWORDS.some((keyword) => source.includes(keyword.toLowerCase()));
}

// 단련 1회. 피로도 5 소모.
export async function trainOnce(): Promise<TrainResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };
  if (!(await canUseGuildYard(sheet.locationId))) {
    return { error: "길드 뒷마당에서만 단련할 수 있어요." };
  }

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < TRAIN_AP) return { error: `피로도가 부족해요. (필요 ${TRAIN_AP}, 보유 ${ap})` };

  const stats = parseStats(sheet.achStatsJson);
  const prevCount = stats["단련횟수"] ?? 0;
  const nextCount = prevCount + 1;

  // 능력치 선택 마일스톤 — 이번에 새 선택권이 열렸는지
  const reachedBefore = statPicksReached(prevCount);
  const reachedAfter = statPicksReached(nextCount);
  const consumedPicks = stats["단련성장선택"] ?? 0;
  const pendingPicks = Math.max(0, reachedAfter - consumedPicks);
  const statMilestone = reachedAfter > reachedBefore ? reachedAfter * 100 : null;

  // 스킬 포인트 — 이미 지급한 합계와 비교해 부족분만 지급(멱등)
  const grantedSp = stats["단련스킬포인트"] ?? 0;
  const owedSp = Math.max(0, totalSkillPointsFor(nextCount) - grantedSp);
  const spMilestone = crossedSpMilestone(prevCount, nextCount);

  let achStats = bumpStat(sheet.achStatsJson, "단련횟수");
  let spWriteFailed = false;
  if (owedSp > 0) {
    // AF61 에 먼저 기록 성공한 만큼만 지급 카운터에 반영 — 실패 시 다음 단련에서 재시도된다
    const wrote = await appendSheetFormula(sheet.sheetTab, SKILL_POINT_CELL, owedSp);
    if (wrote) {
      achStats = bumpStat(achStats, "단련스킬포인트", owedSp);
    } else {
      spWriteFailed = true;
    }
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - TRAIN_AP, apResetAt, achStatsJson: achStats },
  });

  if (sheet.locationId && (statMilestone || (owedSp > 0 && !spWriteFailed))) {
    const note = statMilestone
      ? `단련 ${statMilestone}회 — 능력치가 성장할 준비가 됐다!`
      : `단련 ${spMilestone}회 — 스킬 포인트 +${owedSp}!`;
    void postSystem(sheet.locationId, `🏋️ ${user.nickname}님이 꾸준한 단련의 결실을 맺었다. ${note}`);
  }

  void checkAndGrant(user.id);
  revalidatePath("/world");
  revalidatePath("/profile");
  return {
    ok: true,
    ap: ap - TRAIN_AP,
    statMilestone,
    pendingPicks,
    skillPoints: spWriteFailed ? 0 : owedSp,
    spMilestone: spWriteFailed ? null : spMilestone,
    spWriteFailed,
  };
}

// 밀린 능력치 선택을 하나 소비해 해당 능력 기본치를 +1.
export async function pickTrainingStat(abilityKey: string): Promise<TrainPickResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const ability = ABILITY_BY_KEY.get(abilityKey as AbilityKey);
  if (!ability) return { error: "올바른 능력치가 아니에요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };

  const stats = parseStats(sheet.achStatsJson);
  const count = stats["단련횟수"] ?? 0;
  const consumed = stats["단련성장선택"] ?? 0;
  const pending = Math.max(0, statPicksReached(count) - consumed);
  if (pending <= 0) return { error: "성장 대기 중인 능력치가 없어요." };

  // 시트 반영이 성공해야만 선택을 소비한다(실패 시 선택권 유지)
  const wrote = await appendSheetAbilityBase(sheet.sheetTab, ability.key, 1);
  if (!wrote) return { error: "시트에 반영하지 못했어요. 잠시 후 다시 시도해주세요." };

  const achStats = bumpStat(sheet.achStatsJson, "단련성장선택");
  // 프로필 표시용 캐시(statsJson)의 해당 능력 값도 +1 (정본은 시트, 재동기화 시 최신화)
  let statsJson = sheet.statsJson;
  try {
    if (sheet.statsJson) {
      const arr = JSON.parse(sheet.statsJson) as { key?: string; label?: string; value?: number | null }[];
      const target = arr.find((s) => s.key === ability.key || s.label === ability.label);
      if (target && typeof target.value === "number") target.value += 1;
      statsJson = JSON.stringify(arr);
    }
  } catch {
    statsJson = sheet.statsJson;
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { achStatsJson: achStats, statsJson },
  });

  if (sheet.locationId) {
    void postSystem(sheet.locationId, `💪 ${user.nickname}님의 ${ability.label}이(가) 단련으로 한 단계 성장했다!`);
  }

  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: true, label: ability.label, remaining: pending - 1 };
}
