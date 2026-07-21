import { prisma } from "@/lib/prisma";
import {
  alchemyMasterCount,
  parseLifeState,
} from "@/lib/lifeSkillPerks";
import { getAlchemyRecipes, getCookingRecipes } from "@/lib/gameCatalog";
import { collectionItems } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { isGmUsername } from "@/lib/gm";
import HallOfFame, { type HallCategory, type HallEntry } from "@/components/HallOfFame";

export const metadata = { title: "명예의 전당 · 아리안로드 온라인 갤러리" };

const RANK_ORDER: Record<string, number> = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const TOP_N = 10;

type Row = {
  username: string;
  nickname: string;
  avatar: string | null;
  badge: string | null;
  fishingLv: number;
  fishingExp: number;
  plantLv: number;
  plantExp: number;
  miningLv: number;
  miningExp: number;
  cookingLv: number;
  cookingExp: number;
  smithingLv: number;
  smithingExp: number;
  alchemyLv: number;
  alchemyScore: number;
  alchemyMasters: number;
  fame: number;
  rank: string;
  collectionFound: number;
  collectionTotal: number;
  collectionPct: number;
  gold: number;
};

// 상위 N명을 정렬·매핑. score 로 내림차순 정렬, 0 이하(미달)는 제외.
function rankBy(rows: Row[], score: (r: Row) => number, value: (r: Row) => string): HallEntry[] {
  return rows
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, TOP_N)
    .map(({ r }) => ({
      username: r.username,
      nickname: r.nickname,
      avatar: r.avatar,
      badge: r.badge,
      value: value(r),
    }));
}

function pct(found: number, total: number): number {
  return total > 0 ? Math.round((found / total) * 1000) / 10 : 0;
}

export default async function HallPage() {
  await loadLifeItems();
  const [recipes, alchemyRecipes] = await Promise.all([
    getCookingRecipes(),
    getAlchemyRecipes(),
  ]);
  const lifeCatalog = collectionItems(false);
  const collectionTotal = lifeCatalog.length + recipes.length + alchemyRecipes.length;

  const sheets = await prisma.characterSheet.findMany({
    select: {
      lifeJson: true,
      fame: true,
      adventurerRank: true,
      curGold: true,
      user: {
        select: {
          username: true,
          nickname: true,
          avatar: true,
          equippedBadge: true,
          recipes: { select: { recipeId: true } },
        },
      },
    },
  });

  const rows: Row[] = sheets.filter((s) => !isGmUsername(s.user.username)).map((s) => {
    const life = parseLifeState(s.lifeJson);
    const discoveredRecipes = new Set(s.user.recipes.map((recipe) => recipe.recipeId));
    const lifeCollectionFound = lifeCatalog.filter(({ kind, item }) =>
      life.collection[kind].includes(item.name),
    ).length;
    const cookingFound = recipes.filter(
      (recipe) => recipe.isPublic || discoveredRecipes.has(recipe.id),
    ).length;
    const potionFound = alchemyRecipes.filter((recipe) =>
      life.alchemyPerfect.includes(recipe.id),
    ).length;
    const collectionFound = lifeCollectionFound + cookingFound + potionFound;
    const alchemyScore = Object.values(life.alchemyMastery).reduce(
      (sum, exp) => sum + Math.max(0, exp),
      0,
    );
    const alchemyMasters = alchemyMasterCount(life);
    return {
      username: s.user.username,
      nickname: s.user.nickname,
      avatar: s.user.avatar,
      badge: s.user.equippedBadge,
      fishingLv: life.fishing.level,
      fishingExp: life.fishing.exp,
      plantLv: life.plant.level,
      plantExp: life.plant.exp,
      miningLv: life.mining.level,
      miningExp: life.mining.exp,
      cookingLv: life.cooking.level,
      cookingExp: life.cooking.exp,
      smithingLv: life.smithing.level,
      smithingExp: life.smithing.exp,
      alchemyLv: life.alchemy.level,
      alchemyScore,
      alchemyMasters,
      fame: s.fame,
      rank: s.adventurerRank,
      collectionFound,
      collectionTotal,
      collectionPct: pct(collectionFound, collectionTotal),
      gold: s.curGold ?? 0,
    };
  });

  // 레벨 동률은 경험치로 미세 가산해 타이브레이크
  const categories: HallCategory[] = [
    {
      key: "fishing",
      label: "낚시",
      icon: "🎣",
      entries: rankBy(rows, (r) => r.fishingLv * 1e9 + r.fishingExp, (r) => `Lv.${r.fishingLv}`),
    },
    {
      key: "plant",
      label: "채집",
      icon: "🌿",
      entries: rankBy(rows, (r) => r.plantLv * 1e9 + r.plantExp, (r) => `Lv.${r.plantLv}`),
    },
    {
      key: "mining",
      label: "채광",
      icon: "⛏️",
      entries: rankBy(rows, (r) => r.miningLv * 1e9 + r.miningExp, (r) => `Lv.${r.miningLv}`),
    },
    {
      key: "cooking",
      label: "요리",
      icon: "🍳",
      entries: rankBy(rows, (r) => r.cookingLv * 1e9 + r.cookingExp, (r) => `Lv.${r.cookingLv}`),
    },
    {
      key: "smithing",
      label: "제작",
      icon: "⚒️",
      entries: rankBy(rows, (r) => r.smithingLv * 1e9 + r.smithingExp, (r) => `Lv.${r.smithingLv}`),
    },
    {
      key: "alchemy",
      label: "연금술",
      icon: "⚗️",
      entries: rankBy(
        rows,
        (r) => r.alchemyLv * 1e9 + r.alchemyScore,
        (r) => `Lv.${r.alchemyLv} · 장인 ${r.alchemyMasters}개`,
      ),
    },
    {
      key: "fame",
      label: "명성",
      icon: "🏅",
      entries: rankBy(
        rows,
        (r) => (RANK_ORDER[r.rank] ?? 0) * 1e9 + r.fame,
        (r) => `${r.rank} · ${r.fame.toLocaleString("ko-KR")}`,
      ),
    },
    {
      key: "collection",
      label: "도감",
      icon: "📖",
      entries: rankBy(
        rows,
        (r) => r.collectionPct * 1e9 + r.collectionFound,
        (r) => `${r.collectionPct}% (${r.collectionFound}/${r.collectionTotal})`,
      ),
    },
    {
      key: "gold",
      label: "재산",
      icon: "💰",
      entries: rankBy(rows, (r) => r.gold, (r) => `${r.gold.toLocaleString("ko-KR")}G`),
    },
  ];

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">HALL OF FAME</p>
        <h1 className="mt-1 text-2xl font-black text-content">🏛️ 명예의 전당</h1>
        <p className="mt-1 text-sm text-faint">
          광장 비석에 새겨진 분야별 최고의 모험가들입니다.
        </p>
      </section>

      <HallOfFame categories={categories} />
    </div>
  );
}
