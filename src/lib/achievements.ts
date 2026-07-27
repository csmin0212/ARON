import "server-only";

import { prisma } from "./prisma";
import { getActiveItems } from "./lifeSkillData";
import { loadLifeItems } from "./lifeSkillLoader";
import {
  alchemyLevel,
  lifeBagWeight,
  parseLifeState,
} from "./lifeSkillPerks";
import { parseHousingState } from "./housing";
import { totalFameForRank } from "./adventurerRank";

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

// 카운터를 특정 값으로 재설정한 JSON 반환 (주간 리셋 등)
export function setStat(json: string | null | undefined, name: string, value: number): string {
  const stats = parseStats(json);
  stats[name] = value;
  return JSON.stringify(stats);
}

// 카운터를 최대값 갱신 방식으로 기록한 JSON 반환 (최고 등급류)
export function setMaxStat(json: string | null | undefined, name: string, value: number): string {
  const stats = parseStats(json);
  stats[name] = Math.max(stats[name] ?? 0, value);
  return JSON.stringify(stats);
}

const RANK_ORDER: Record<string, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const TIER_ORDER: Record<string, number> = { small: 1, standard: 2, luxury: 3 };
const TOOL_TIER: Record<string, number> = {
  "좋은 낚싯대": 1,
  "고급 낚싯대": 2,
  "숙련 채집 도구": 1,
  "장인의 채집 도구": 2,
  "철 곡괭이": 1,
  "미스릴 곡괭이": 2,
};
// 도구 → 생활스킬 종류. 같은 종류의 도구끼리만 등급을 비교한다 (낚싯대로 채집 업적 방지)
const TOOL_KIND: Record<string, "낚시" | "채집" | "채광"> = {
  "좋은 낚싯대": "낚시",
  "고급 낚싯대": "낚시",
  "숙련 채집 도구": "채집",
  "장인의 채집 도구": "채집",
  "철 곡괭이": "채광",
  "미스릴 곡괭이": "채광",
};
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
// 활성 풀(시트 동기화본) 기준으로 매번 구성 — 신규 어종/약초/광물이 도감 판정에 반영되게.
const rankMapOf = (kind: "낚시" | "채집" | "채광") =>
  new Map(getActiveItems(kind).map((item) => [item.name, item.rank]));
const rankRequirement = (a: AchRow) => {
  const explicit = parseInt(String(a.condValue ?? "").replace(/[^\d-]/g, ""), 10);
  if (!Number.isNaN(explicit)) return explicit;
  const fromId = a.id.match(/(?:^|_)r(\d+)(?:_|$)/i)?.[1];
  if (fromId) return Number(fromId);
  const fromName = a.name.match(/R\s*(\d+)/i)?.[1];
  return fromName ? Number(fromName) : null;
};
function countStatPrefix(stats: Record<string, number>, prefix: string): number {
  return Object.entries(stats).filter(([key, value]) => key.startsWith(prefix) && value > 0).length;
}

function parseRecipeIngredients(value: string | null | undefined): { name: string; qty: number }[] {
  try {
    const parsed = JSON.parse(value ?? "[]") as { name?: string; qty?: number }[];
    return parsed
      .filter((item) => item.name && item.qty && item.qty > 0)
      .map((item) => ({ name: item.name!, qty: item.qty! }));
  } catch {
    return [];
  }
}

function cookingTagTokens(recipe: {
  category: string;
  tags: string | null;
  ingredientsJson?: string | null;
}): string[] {
  const tokens = new Set<string>();
  if (/생선|물고기|어획|낚시/.test(recipe.category)) tokens.add("생선");
  if (/채집|약초|나물/.test(recipe.category)) tokens.add("채집");
  for (const tag of (recipe.tags ?? "").split(/[,，]/)) {
    const t = tag.trim();
    if (t) tokens.add(t);
  }
  const fishNames = new Set(getActiveItems("낚시").map((item) => item.name.trim()));
  const gatherNames = new Set(getActiveItems("채집").map((item) => item.name.trim()));
  for (const ingredient of parseRecipeIngredients(recipe.ingredientsJson)) {
    const name = ingredient.name.trim();
    if (fishNames.has(name)) tokens.add("생선");
    if (gatherNames.has(name)) tokens.add("채집");
  }
  return [...tokens];
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
  desc: string | null;
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
        desc: true,
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
  // 도감·희귀도 판정 전에 시트 동기화본 풀을 반드시 로드 — 콜드 인스턴스가
  // 하드코딩 seed 풀로 판정하면 완성률 과대(오지급)·신규 어종 랭크 누락(미지급)이 난다.
  await loadLifeItems();
  const life = parseLifeState(sheet?.lifeJson);
  const housing = parseHousingState(sheet?.housingJson, sheet?.houseTier);
  const stats = parseStats(sheet?.achStatsJson);
  const gold = sheet?.curGold ?? 0;
  const rank = sheet?.adventurerRank ?? "D";
  let fame = totalFameForRank(rank, sheet?.fame);
  const discoveredCount = parseStrArr(sheet?.discoveredJson).length;
  let ownedTitles = all.filter((a) => earned.has(a.id) && a.rewardTitle).length;
  const furnitureCount =
    housing.items.length + // 보유 가구 (캐릭터 귀속)
    Object.values(housing.furniture).reduce(
      (n, list) => n + (Array.isArray(list) ? list.length : 0),
      0,
    );
  const houseMaxTier = housing.owned.reduce((m, t) => Math.max(m, TIER_ORDER[t] ?? 0), 0);
  const tools = (life as { tools?: Record<string, string> }).tools ?? {};
  const fishingBagWeight = lifeBagWeight(life.bags.낚시);
  const plantBagWeight = lifeBagWeight(life.bags.채집);
  const mineBagWeight = lifeBagWeight(life.bags.채광);
  const bestFishingRank = maxKnownRank(life.collection.낚시, rankMapOf("낚시"));
  const bestPlantRank = maxKnownRank(life.collection.채집, rankMapOf("채집"));
  const bestMineRank = maxKnownRank(life.collection.채광, rankMapOf("채광"));
  // 완성률 분자는 현재 풀에 있는 종만 센다 — 풀 개편으로 빠진 옛 종 때문에 100%가 넘는 사고 방지
  const fishPoolNames = new Set(getActiveItems("낚시").map((i) => i.name));
  const plantPoolNames = new Set(getActiveItems("채집").map((i) => i.name));
  const minePoolNames = new Set(getActiveItems("채광").map((i) => i.name));
  const fishInPool = life.collection.낚시.filter((n) => fishPoolNames.has(n)).length;
  const plantInPool = life.collection.채집.filter((n) => plantPoolNames.has(n)).length;
  const mineInPool = life.collection.채광.filter((n) => minePoolNames.has(n)).length;
  const bestSameFishing = maxCount(life.catchCounts.낚시);
  const bestSamePlant = maxCount(life.catchCounts.채집);
  const bestSameMine = maxCount(life.catchCounts.채광);
  const fishingAreaCount = countStatPrefix(stats, "낚시지역:");
  const plantAreaCount = countStatPrefix(stats, "채집지역:");
  const mineAreaCount = countStatPrefix(stats, "채광지역:");
  const craftMineralKinds = countStatPrefix(stats, "제작광물:");
  // 연금술 — 새 조제 시스템은 life.alchemy 레벨과 조제 등급/횟수 카운터를 기준으로 판정한다.
  const alchemyLv = alchemyLevel(life);

  // 방문 토큰 (id + 정규화 이름) — 장소방문/히든장소방문/지역그룹방문/층전체방문용
  let visitTokens: Set<string> | null = null;
  let visitedStart = false;
  let hiddenVisitedCount = 0; // 방문한 히든 장소 수
  let publicVisitedCount = 0; // 방문한 공개 장소 수
  let allPublicVisited = false; // 공개 장소 전부 방문 여부
  let hiddenLocs: { id: string; name: string }[] = [];
  if (
    types.has("장소방문") ||
    types.has("히든장소방문") ||
    types.has("지역그룹방문") ||
    types.has("층전체방문")
  ) {
    const ids = [
      ...parseStrArr(sheet?.visitedJson),
      ...parseStrArr(sheet?.discoveredJson),
      sheet?.locationId ?? "",
    ].filter(Boolean);
    const locs = await prisma.location.findMany({
      select: { id: true, name: true, isStart: true, hidden: true },
    });
    const locById = new Map(locs.map((l) => [l.id, l]));
    visitTokens = new Set<string>();
    const visitedIds = new Set<string>();
    for (const id of ids) {
      visitTokens.add(norm(id));
      const loc = locById.get(id);
      if (loc?.isStart) visitedStart = true;
      if (loc?.name) visitTokens.add(norm(loc.name));
      if (loc && !visitedIds.has(loc.id)) {
        visitedIds.add(loc.id);
        if (loc.hidden) hiddenVisitedCount++;
        else publicVisitedCount++;
      }
    }
    const publicLocs = locs.filter((l) => !l.hidden);
    allPublicVisited = publicLocs.length > 0 && publicLocs.every((l) => visitedIds.has(l.id));
    hiddenLocs = locs.filter((l) => l.hidden).map((l) => ({ id: l.id, name: l.name }));
  }

  // 커뮤니티 카운트 (필요 시에만)
  let postCount = 0,
    commentCount = 0,
    voteCount = 0;
  if (types.has("게시글작성수")) postCount = await prisma.post.count({ where: { authorId: userId } });
  if (types.has("댓글작성수"))
    commentCount = await prisma.comment.count({ where: { authorId: userId } });
  if (types.has("추천횟수")) voteCount = await prisma.vote.count({ where: { userId } });

  // 레시피 보유 수 — 요리 발견분(카운터) 외에 가챠 구매분(UserRecipe)까지 포함
  let recipeCount = 0;
  if (types.has("요리레시피수"))
    recipeCount = await prisma.userRecipe.count({ where: { userId } });
  const cookedRecipeTags = new Set<string>();
  if (types.has("요리태그") || types.has("요리재료") || types.has("요리분류")) {
    const userRecipes = await prisma.userRecipe.findMany({
      where: { userId },
      select: { recipeId: true },
    });
    const recipeIds = [...new Set(userRecipes.map((recipe) => recipe.recipeId))];
    if (recipeIds.length > 0) {
      const recipes = await prisma.cookingRecipe.findMany({
        where: { id: { in: recipeIds } },
        select: { category: true, tags: true, ingredientsJson: true },
      });
      for (const recipe of recipes) {
        for (const tag of cookingTagTokens(recipe)) cookedRecipeTags.add(tag);
      }
    }
  }

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

  let earnedCount = earned.size;
  const num = (v: string | null) => {
    const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  };
  const percent = (current: number, total: number) => (total <= 0 ? 0 : (current / total) * 100);
  // 조건값이 비어 있으면 설명·이름에서 의도를 읽는다 (시트에서 조건값을 자주 생략하므로)
  const condSource = (a: AchRow) => [a.condValue, a.desc, a.name].filter(Boolean).join(" ");

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
      case "채광레벨":
        return n != null && life.mining.level >= n;
      case "대장레벨":
      case "대장간레벨":
      case "제작레벨":
        return n != null && life.smithing.level >= n;
      case "연금술레벨":
      case "연금레벨":
        return n != null && alchemyLv >= n;
      case "연금숙련포션수":
      case "연금고급수":
      case "연금장인수":
      case "연금명품수":
      case "연금완벽횟수":
        return false;
      case "연금등급":
      case "연금제작등급":
      case "연금품질": {
        const made = stats.연금최고제작등급 ?? 0;
        const src = norm(condSource(a));
        if (src.includes(norm("네이밍")) || src.includes(norm("이름"))) return made >= 3;
        if (src.includes(norm("명품"))) return made >= 2;
        if (src.includes(norm("고품질")) || src.includes(norm("희귀"))) return made >= 1;
        if (n != null) return made >= n;
        return false;
      }
      case "제작광물종류수":
        return n != null && craftMineralKinds >= n;
      case "제작등급": {
        // 숫자 조건값 = 서열(고품질1<명품2<장인3), 그 외엔 설명·이름에서 등급을 읽는다
        const made = stats.제작최고제작등급 ?? 0;
        if (n != null) return made >= n;
        const src = norm(condSource(a));
        if (src.includes(norm("장인"))) return made >= 3;
        if (src.includes(norm("명품")) || src.includes(norm("걸작"))) return made >= 2;
        if (src.includes(norm("고품질")) || src.includes(norm("희귀"))) return made >= 1;
        return false;
      }
      case "낚시도감등록수":
        return n != null && life.collection.낚시.length >= n;
      case "채집도감등록수":
        return n != null && life.collection.채집.length >= n;
      case "채광도감등록수":
        return n != null && life.collection.채광.length >= n;
      case "낚시도감완성률":
        return n != null && percent(fishInPool, fishPoolNames.size) >= n;
      case "채집도감완성률":
        return n != null && percent(plantInPool, plantPoolNames.size) >= n;
      case "채광도감완성률":
        return n != null && percent(mineInPool, minePoolNames.size) >= n;
      case "희귀도낚시":
        return rankRequirement(a) != null && bestFishingRank >= rankRequirement(a)!;
      case "희귀도채집":
        return rankRequirement(a) != null && bestPlantRank >= rankRequirement(a)!;
      case "희귀도채광":
        return rankRequirement(a) != null && bestMineRank >= rankRequirement(a)!;
      case "동일낚시획득":
        return n != null && bestSameFishing >= n;
      case "동일채집획득":
        return n != null && bestSamePlant >= n;
      case "동일채광획득":
        return n != null && bestSameMine >= n;
      case "낚시지역성공수":
        return n != null && fishingAreaCount >= n;
      case "채집지역성공수":
        return n != null && plantAreaCount >= n;
      case "채광지역성공수":
        return n != null && mineAreaCount >= n;
      case "낚시가방중량":
        return n != null && fishingBagWeight >= n;
      case "채집가방중량":
        return n != null && plantBagWeight >= n;
      case "채광가방중량":
        return n != null && mineBagWeight >= n;
      case "낚시가방최대중량":
        return n != null && (life.bags.낚시?.maxWeight ?? 0) >= n;
      case "채집가방최대중량":
        return n != null && (life.bags.채집?.maxWeight ?? 0) >= n;
      case "채광가방최대중량":
        return n != null && (life.bags.채광?.maxWeight ?? 0) >= n;
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
      case "집등급": {
        // 조건값(small/standard/luxury)이 비어 있으면 업적ID·설명에서 등급을 읽는다
        const src = norm(`${a.id} ${condSource(a)}`);
        const tier =
          v && TIER_ORDER[String(v).trim()]
            ? String(v).trim()
            : src.includes("luxury") || src.includes(norm("호화"))
              ? "luxury"
              : src.includes("standard") || src.includes(norm("평범")) || src.includes(norm("아늑"))
                ? "standard"
                : src.includes("small") || src.includes(norm("작은 집"))
                  ? "small"
                  : null;
        return tier != null && houseMaxTier >= (TIER_ORDER[tier] ?? 99);
      }
      case "모험가랭크": {
        // 조건값이 비어 있으면 업적ID(_c/_b/_a/_s)·이름("C랭크")에서 랭크를 읽는다
        const fromV = String(v ?? "").trim().toUpperCase();
        const letter = RANK_ORDER[fromV]
          ? fromV
          : (a.id.match(/_rank_([dcbas])$/i)?.[1] ?? a.name.match(/([DCBAS])\s*랭크/i)?.[1])?.toUpperCase() ?? null;
        return letter != null && (RANK_ORDER[rank] ?? 0) >= (RANK_ORDER[letter] ?? 99);
      }
      case "생활장비보유": {
        // 조건값이 비면 설명("좋은 낚싯대를 구매했다")에서 도구명을 찾고, 같은 종류끼리만 비교
        const src = norm(condSource(a));
        const req = Object.keys(TOOL_TIER).find((k) => src.includes(norm(k)));
        if (!req) return false;
        const owned = tools[TOOL_KIND[req]] ?? "";
        return (TOOL_TIER[owned] ?? 0) >= (TOOL_TIER[req] ?? 99);
      }
      case "요리등급":
      case "요리제작등급":
      case "요리품질": {
        // 설명·이름에 제작 등급 의도가 있으면 조건값 숫자보다 우선한다.
        // "희귀 요리" 업적이 조건값 1로 들어와도 레시피 R1이 아니라 고품질 이상으로 판정한다.
        const made = stats.요리최고제작등급 ?? 0;
        const src = norm(condSource(a));
        if (src.includes(norm("장인")) || src.includes(norm("서명작"))) return made >= 3;
        if (src.includes(norm("걸작")) || src.includes(norm("명품"))) return made >= 2;
        if (src.includes(norm("희귀")) || src.includes(norm("고품질"))) return made >= 1;
        // 숫자 조건값 = 레시피 랭크(레거시)
        if (n != null) return (stats.요리최고등급 ?? 0) >= n;
        return false;
      }
      case "요리태그":
      case "요리재료":
      case "요리분류": {
        // 카운터 키는 cookingTagTokens 기준("생선"/"채집" + 시트 태그) — 별칭을 흡수한다
        const explicit = v?.trim();
        const src = condSource(a);
        const raw =
          explicit ||
          (/(물고기|생선|어획)/.test(src) ? "생선" : /(채집|약초|나물)/.test(src) ? "채집" : null);
        if (!raw) return false;
        const alias: Record<string, string> = { 물고기: "생선", 어획물: "생선", 채집물: "채집", 약초: "채집" };
        const tag = alias[raw] ?? raw;
        return (stats[`요리태그:${tag}`] ?? 0) > 0 || cookedRecipeTags.has(tag);
      }
      case "칭호장착":
        return !!userDecor?.equippedTitle;
      case "대표배지장착": {
        // n>1이면 "서로 다른 배지를 n종 장착해 본" 누적 판정 (장착 슬롯은 1개뿐이므로)
        const goal = n ?? 1;
        if (goal <= 1) return !!userDecor?.equippedBadge;
        return countStatPrefix(stats, "배지장착:") >= goal;
      }
      case "장소방문":
        if (!v && a.id === "visit_belltower")
          return visitedStart || !!visitTokens?.has(norm("종탑거리"));
        return !!v && !!visitTokens && visitTokens.has(norm(v));
      case "히든장소방문": {
        // 숫자 조건값 = 방문한 히든 장소 수, 문자 조건값 = 특정 장소 방문
        if (n != null) return hiddenVisitedCount >= n;
        if (v) return !!visitTokens && visitTokens.has(norm(v));
        // 조건값이 비면 설명에서 히든 장소명을 찾는다 — 정확히 한 곳만 매치될 때만 사용
        const src = norm(condSource(a));
        const matched = hiddenLocs.filter(
          (l) => src.includes(norm(l.id)) || src.includes(norm(l.name)),
        );
        if (matched.length !== 1) return false;
        return (
          !!visitTokens &&
          (visitTokens.has(norm(matched[0].id)) || visitTokens.has(norm(matched[0].name)))
        );
      }
      case "지역그룹방문": {
        // 층 구분이 아직 없어 "공개 장소 방문 수"로 판정. 2층 업적은 2층이 생길 때까지 잠금.
        const src = condSource(a);
        if (/2\s*층/.test(src)) return false;
        // 조건값 "1층:10" 형식이 우선 — 통짜 num()은 "1층:10"을 110으로 읽는 사고가 난다
        const colon = String(v ?? "").match(/[:：]\s*(\d+)/);
        const spots = src.match(/(\d+)\s*곳/);
        const goal = colon ? Number(colon[1]) : spots ? Number(spots[1]) : n;
        return goal != null && publicVisitedCount >= goal;
      }
      case "층전체방문":
        return allPublicVisited;
      case "요리레시피수":
        return n != null && Math.max(recipeCount, stats.요리레시피수 ?? 0) >= n;
      case "의뢰수락횟수":
        return n != null && (stats.의뢰수락횟수 ?? 0) >= n;
      case "의뢰완료횟수":
        // 과거 카운터명(길드의뢰완료횟수)과 병행 — 기존 누적치 승계
        return n != null && Math.max(stats.의뢰완료횟수 ?? 0, stats.길드의뢰완료횟수 ?? 0) >= n;
      case "길드등록":
        // 별도 등록 절차가 없음 — 캐릭터 시트 연동자는 전원 길드 소속으로 간주
        return !!sheet;
      default:
        // 누적 카운터형 — condType 이름과 같은 카운터를 그때그때 bumpStat 하면 자동 작동.
        // (이동횟수·조사성공/실패·낚시/채집 성공/실패·던전/균열 클리어·입장·집휴식·월드채팅·아이템획득 …)
        // 아직 카운터를 안 올리는 미구현 조건은 0이라 자동으로 잠금 유지.
        return n != null && (stats[a.condType] ?? 0) >= n;
    }
  }

  // 연쇄 판정 — 지급으로 업적달성수·칭호보유수·명성이 늘면 그 자리에서 재평가
  const newly: AchRow[] = [];
  const picked = new Set<string>();
  for (let round = 0; round < 4; round++) {
    const batch = pending.filter((a) => !picked.has(a.id) && satisfied(a));
    if (batch.length === 0) break;
    for (const a of batch) {
      newly.push(a);
      picked.add(a.id);
      earnedCount += 1;
      if (a.rewardTitle) ownedTitles += 1;
      fame += a.rewardFame;
    }
  }
  if (newly.length === 0) return [];

  // 동시 요청과 경합해도 실제로 이 호출이 지급한 것만 인정 (명성 중복 지급 방지)
  const granted: AchRow[] = [];
  for (const a of newly) {
    try {
      await prisma.userAchievement.create({ data: { userId, achId: a.id } });
      granted.push(a);
    } catch {
      // 이미 지급됨(unique 충돌) — 건너뜀
    }
  }
  if (granted.length === 0) return [];

  const fameGain = granted.reduce((sum, a) => sum + a.rewardFame, 0);
  if (fameGain > 0) {
    await prisma.characterSheet.updateMany({
      where: { userId },
      data: { fame: { increment: fameGain } },
    });
  }

  return granted.map((a) => ({
    id: a.id,
    name: a.name,
    badge: a.badge,
    rewardTitle: a.rewardTitle,
  }));
}
