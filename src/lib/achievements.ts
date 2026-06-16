import "server-only";

import { prisma } from "./prisma";
import { FISH_ITEMS, PLANT_ITEMS } from "./lifeSkillData";
import { lifeBagWeight, parseLifeState } from "./lifeSkillPerks";
import { parseHousingState } from "./housing";

// ── 누적 카운터 / 방문 집합 헬퍼 (호출부에서 시트 업데이트에 사용) ──
function parseStrArr(json: string | null | undefined): string[] {
  try {
    if (json) return JSON.parse(json) as string[];
  } catch {
    /* noop */
  }
  return [];
}
function parseStats(json: string | null | undefined): Record<string, number> {
  try {
    if (json) return JSON.parse(json) as Record<string, number>;
  } catch {
    /* noop */
  }
  return {};
}

// 방문 목록에 장소를 더한 JSON 반환 (이미 있으면 그대로)
export function addVisited(json: string | null | undefined, locationId: string): string {
  const arr = parseStrArr(json);
  if (!arr.includes(locationId)) arr.push(locationId);
  return JSON.stringify(arr);
}

// 카운터 +by 한 JSON 반환
export function bumpStat(json: string | null | undefined, name: string, by = 1): string {
  const stats = parseStats(json);
  stats[name] = (stats[name] ?? 0) + by;
  return JSON.stringify(stats);
}

export function markStat(json: string | null | undefined, name: string): string {
  const stats = parseStats(json);
  stats[name] = 1;
  return JSON.stringify(stats);
}

const RANK_ORDER: Record<string, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const TIER_ORDER: Record<string, number> = { small: 1, standard: 2, luxury: 3 };
const TOOL_TIER: Record<string, number> = {
  "좋은 낚싯대": 1,
  "고급 낚싯대": 2,
  "숙련 채집 도구": 1,
  "장인의 채집 도구": 2,
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const fishRankByName = new Map(FISH_ITEMS.map((item) => [item.name, item.rank]));
const plantRankByName = new Map(PLANT_ITEMS.map((item) => [item.name, item.rank]));

function countStatPrefix(stats: Record<string, number>, prefix: string): number {
  return Object.entries(stats).filter(([key, value]) => key.startsWith(prefix) && value > 0).length;
}

function maxCount(counts: Record<string, number> | undefined): number {
  return Math.max(0, ...Object.values(counts ?? {}));
}

function maxKnownRank(names: string[], rankByName: Map<string, number>): number {
  return names.reduce((max, name) => Math.max(max, rankByName.get(name) ?? 0), 0);
}

type AchRow = {
  id: string;
  condType: string;
  condValue: string | null;
  rewardTitle: string | null;
  rewardFame: number;
  badge: string | null;
  name: string;
};

// 업적 달성 판정 + 지급. 새로 달성한 업적 목록을 돌려준다.
export async function checkAndGrant(
  userId: string,
): Promise<{ id: string; name: string; badge: string | null; rewardTitle: string | null }[]> {
  const [all, earnedRows, sheet, userDecor] = await Promise.all([
    prisma.achievement.findMany({
      select: {
        id: true,
        condType: true,
        condValue: true,
        rewardTitle: true,
        rewardFame: true,
        badge: true,
        name: true,
      },
    }),
    prisma.userAchievement.findMany({ where: { userId }, select: { achId: true } }),
    prisma.characterSheet.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { equippedTitle: true, equippedBadge: true } }),
  ]);
  if (all.length === 0) return [];

  const earned = new Set(earnedRows.map((r) => r.achId));
  const pending = all.filter((a) => !earned.has(a.id));
  if (pending.length === 0) return [];
  const types = new Set(pending.map((a) => a.condType));

  // ── 상태 수집 (필요한 것만) ──
  const life = parseLifeState(sheet?.lifeJson);
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  const stats = parseStats(sheet?.achStatsJson);
  const gold = sheet?.curGold ?? 0;
  const fame = sheet?.fame ?? 0;
  const rank = sheet?.adventurerRank ?? "D";
  const discoveredCount = parseStrArr(sheet?.discoveredJson).length;
  const ownedTitles = all.filter((a) => earned.has(a.id) && a.rewardTitle).length;
  const furnitureCount = Object.values(housing.furniture).reduce(
    (n, list) => n + (Array.isArray(list) ? list.length : 0),
    0,
  );
  const houseMaxTier = housing.owned.reduce((m, t) => Math.max(m, TIER_ORDER[t] ?? 0), 0);
  const toolNames = Object.values((life as { tools?: Record<string, string> }).tools ?? {});
  const fishingBagWeight = lifeBagWeight(life.bags.낚시);
  const plantBagWeight = lifeBagWeight(life.bags.채집);
  const bestFishingRank = maxKnownRank(life.collection.낚시, fishRankByName);
  const bestPlantRank = maxKnownRank(life.collection.채집, plantRankByName);
  const bestSameFishing = maxCount(life.catchCounts.낚시);
  const bestSamePlant = maxCount(life.catchCounts.채집);
  const fishingAreaCount = countStatPrefix(stats, "낚시지역:");
  const plantAreaCount = countStatPrefix(stats, "채집지역:");

  // 방문 토큰 (id + 정규화 이름) — 장소방문/히든장소방문용
  let visitTokens: Set<string> | null = null;
  if (types.has("장소방문") || types.has("히든장소방문")) {
    const ids = [...parseStrArr(sheet?.visitedJson), ...parseStrArr(sheet?.discoveredJson)];
    const locs = await prisma.location.findMany({ select: { id: true, name: true } });
    const nameById = new Map(locs.map((l) => [l.id, l.name]));
    visitTokens = new Set<string>();
    for (const id of ids) {
      visitTokens.add(norm(id));
      const nm = nameById.get(id);
      if (nm) visitTokens.add(norm(nm));
    }
  }

  // 커뮤니티 카운트 (필요 시에만)
  let postCount = 0,
    commentCount = 0,
    voteCount = 0;
  if (types.has("게시글작성수")) postCount = await prisma.post.count({ where: { authorId: userId } });
  if (types.has("댓글작성수"))
    commentCount = await prisma.comment.count({ where: { authorId: userId } });
  if (types.has("추천횟수")) voteCount = await prisma.vote.count({ where: { userId } });

  let storageUsedWeight = 0,
    storageMaxWeight = 0;
  if (types.has("창고사용중량") || types.has("창고최대중량")) {
    const box = await prisma.storageBox.findUnique({
      where: { userId },
      include: { entries: true },
    });
    storageMaxWeight = box?.maxWeight ?? 0;
    storageUsedWeight =
      box?.entries.reduce((sum, entry) => sum + (entry.weight ?? 0) * entry.qty, 0) ?? 0;
  }

  const earnedCount = earned.size;
  const num = (v: string | null) => {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  };
  const rankNum = (v: string | null) => num(v);
  const percent = (current: number, total: number) => (total <= 0 ? 0 : (current / total) * 100);

  function satisfied(a: AchRow): boolean {
    const v = a.condValue;
    const n = num(v);
    switch (a.condType) {
      case "명성":
        return n != null && fame >= n;
      case "골드보유":
        return n != null && gold >= n;
      case "낚시레벨":
        return n != null && life.fishing.level >= n;
      case "채집레벨":
        return n != null && life.plant.level >= n;
      case "요리레벨":
      case "요리숙련레벨":
        return n != null && life.cooking.level >= n;
      case "낚시도감등록수":
        return n != null && life.collection.낚시.length >= n;
      case "채집도감등록수":
        return n != null && life.collection.채집.length >= n;
      case "낚시도감완성률":
        return n != null && percent(life.collection.낚시.length, FISH_ITEMS.length) >= n;
      case "채집도감완성률":
        return n != null && percent(life.collection.채집.length, PLANT_ITEMS.length) >= n;
      case "희귀도낚시":
        return rankNum(v) != null && bestFishingRank >= rankNum(v)!;
      case "희귀도채집":
        return rankNum(v) != null && bestPlantRank >= rankNum(v)!;
      case "동일낚시획득":
        return n != null && bestSameFishing >= n;
      case "동일채집획득":
        return n != null && bestSamePlant >= n;
      case "낚시지역성공수":
        return n != null && fishingAreaCount >= n;
      case "채집지역성공수":
        return n != null && plantAreaCount >= n;
      case "낚시가방중량":
        return n != null && fishingBagWeight >= n;
      case "채집가방중량":
        return n != null && plantBagWeight >= n;
      case "낚시가방최대중량":
        return n != null && (life.bags.낚시?.maxWeight ?? 0) >= n;
      case "채집가방최대중량":
        return n != null && (life.bags.채집?.maxWeight ?? 0) >= n;
      case "창고사용중량":
        return n != null && storageUsedWeight >= n;
      case "창고최대중량":
        return n != null && storageMaxWeight >= n;
      case "가구배치수":
        return n != null && furnitureCount >= n;
      case "최초발견":
        return n != null && discoveredCount >= n;
      case "칭호보유수":
        return n != null && ownedTitles >= n;
      case "업적달성수":
        return n != null && earnedCount >= n;
      case "게시글작성수":
        return n != null && postCount >= n;
      case "댓글작성수":
        return n != null && commentCount >= n;
      case "추천횟수":
        return n != null && voteCount >= n;
      case "집구매":
        return housing.owned.length >= (n ?? 1);
      case "집등급":
        return houseMaxTier >= (TIER_ORDER[String(v)] ?? 99);
      case "모험가랭크":
        return (RANK_ORDER[rank] ?? 0) >= (RANK_ORDER[String(v).toUpperCase()] ?? 99);
      case "생활장비보유":
        return (
          !!v &&
          (toolNames.includes(v) ||
            toolNames.some((t) => (TOOL_TIER[t] ?? 0) >= (TOOL_TIER[v] ?? 99)))
        );
      case "요리등급":
        return n != null && (stats.요리최고등급 ?? 0) >= n;
      case "요리태그":
        return !!v && (stats[`요리태그:${v}`] ?? 0) > 0;
      case "칭호장착":
        return !!userDecor?.equippedTitle;
      case "대표배지장착":
        return !!userDecor?.equippedBadge;
      case "장소방문":
      case "히든장소방문":
        return !!v && !!visitTokens && visitTokens.has(norm(v));
      default:
        // 누적 카운터형 — condType 이름과 같은 카운터를 그때그때 bumpStat 하면 자동 작동.
        // (이동횟수·조사성공/실패·낚시/채집 성공/실패·던전/균열 클리어·입장·집휴식·월드채팅·아이템획득 …)
        // 아직 카운터를 안 올리는 미구현 조건은 0이라 자동으로 잠금 유지.
        return n != null && (stats[a.condType] ?? 0) >= n;
    }
  }

  const newly = pending.filter(satisfied);
  if (newly.length === 0) return [];

  await prisma.userAchievement.createMany({
    data: newly.map((a) => ({ userId, achId: a.id })),
    skipDuplicates: true,
  });
  return newly.map((a) => ({
    id: a.id,
    name: a.name,
    badge: a.badge,
    rewardTitle: a.rewardTitle,
  }));
}
