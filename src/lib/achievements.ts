import "server-only";

import { prisma } from "./prisma";
import { parseLifeState } from "./lifeSkillPerks";
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

const RANK_ORDER: Record<string, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const TIER_ORDER: Record<string, number> = { small: 1, standard: 2, luxury: 3 };
const TOOL_TIER: Record<string, number> = {
  "좋은 낚싯대": 1,
  "고급 낚싯대": 2,
  "숙련 채집 도구": 1,
  "장인의 채집 도구": 2,
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

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
  const [all, earnedRows, sheet] = await Promise.all([
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

  const earnedCount = earned.size;
  const num = (v: string | null) => {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  };

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
      case "낚시도감등록수":
        return n != null && life.collection.낚시.length >= n;
      case "채집도감등록수":
        return n != null && life.collection.채집.length >= n;
      case "낚시가방최대중량":
        return n != null && (life.bags.낚시?.maxWeight ?? 0) >= n;
      case "채집가방최대중량":
        return n != null && (life.bags.채집?.maxWeight ?? 0) >= n;
      case "가구배치수":
        return n != null && furnitureCount >= n;
      case "이동횟수":
        return n != null && (stats["이동횟수"] ?? 0) >= n;
      case "조사성공횟수":
        return n != null && (stats["조사성공횟수"] ?? 0) >= n;
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
      case "장소방문":
      case "히든장소방문":
        return !!v && !!visitTokens && visitTokens.has(norm(v));
      default:
        return false; // 미구현 조건타입 (요리/길드/카운터 등) — 추후 배선
    }
  }

  const newly = pending.filter(satisfied);
  if (newly.length === 0) return [];

  await prisma.userAchievement.createMany({
    data: newly.map((a) => ({ userId, achId: a.id })),
    skipDuplicates: true,
  });
  const fameGain = newly.reduce((s, a) => s + a.rewardFame, 0);
  if (fameGain > 0 && sheet) {
    await prisma.characterSheet.update({
      where: { userId },
      data: { fame: { increment: fameGain } },
    });
  }
  return newly.map((a) => ({
    id: a.id,
    name: a.name,
    badge: a.badge,
    rewardTitle: a.rewardTitle,
  }));
}
