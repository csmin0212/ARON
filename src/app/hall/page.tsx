import { prisma } from "@/lib/prisma";
import {
  alchemyMasterCount,
  parseLifeState,
} from "@/lib/lifeSkillPerks";
import { getAlchemyRecipes, getCookingRecipes } from "@/lib/gameCatalog";
import { collectionItems } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { isGmUsername } from "@/lib/gm";
import { getCurrentUser } from "@/lib/auth";
import { totalFameForRank } from "@/lib/adventurerRank";
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

// 전체 순위를 먼저 계산한 뒤 TOP N과 내 순위(있으면)를 함께 넘긴다.
function rankCategory(
  rows: Row[],
  score: (r: Row) => number,
  value: (r: Row) => string,
  meUsername: string | null,
): Pick<HallCategory, "entries" | "myEntry"> {
  const ranked = rows
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const entries: HallEntry[] = ranked.slice(0, TOP_N).map(({ r }, i) => ({
    rank: i + 1,
    username: r.username,
    nickname: r.nickname,
    avatar: r.avatar,
    badge: r.badge,
    value: value(r),
    isMe: r.username === meUsername,
  }));
  const myIndex = meUsername
    ? ranked.findIndex(({ r }) => r.username === meUsername)
    : -1;
  const myEntry =
    myIndex >= TOP_N
      ? (() => {
          const r = ranked[myIndex].r;
          return {
            rank: myIndex + 1,
            username: r.username,
            nickname: r.nickname,
            avatar: r.avatar,
            badge: r.badge,
            value: value(r),
            isMe: true,
          };
        })()
      : undefined;

  return { entries, myEntry };
}

function category(
  rows: Row[],
  meUsername: string | null,
  data: Omit<HallCategory, "entries" | "myEntry"> & {
    score: (r: Row) => number;
    value: (r: Row) => string;
  },
): HallCategory {
  const ranked = rankCategory(rows, data.score, data.value, meUsername);
  return {
    key: data.key,
    label: data.label,
    icon: data.icon,
    ...ranked,
  };
}

function pct(found: number, total: number): number {
  return total > 0 ? Math.round((found / total) * 1000) / 10 : 0;
}

export default async function HallPage() {
  const user = await getCurrentUser();
  const meUsername = user && !isGmUsername(user.username) ? user.username : null;

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
      fame: totalFameForRank(s.adventurerRank, s.fame),
      rank: s.adventurerRank,
      collectionFound,
      collectionTotal,
      collectionPct: pct(collectionFound, collectionTotal),
      gold: s.curGold ?? 0,
    };
  });

  // 레벨 동률은 경험치로 미세 가산해 타이브레이크
  const categories: HallCategory[] = [
    category(rows, meUsername, {
      key: "fishing",
      label: "낚시",
      icon: "🎣",
      score: (r) => r.fishingLv * 1e9 + r.fishingExp,
      value: (r) => `Lv.${r.fishingLv}`,
    }),
    category(rows, meUsername, {
      key: "plant",
      label: "채집",
      icon: "🌿",
      score: (r) => r.plantLv * 1e9 + r.plantExp,
      value: (r) => `Lv.${r.plantLv}`,
    }),
    category(rows, meUsername, {
      key: "mining",
      label: "채광",
      icon: "⛏️",
      score: (r) => r.miningLv * 1e9 + r.miningExp,
      value: (r) => `Lv.${r.miningLv}`,
    }),
    category(rows, meUsername, {
      key: "cooking",
      label: "요리",
      icon: "🍳",
      score: (r) => r.cookingLv * 1e9 + r.cookingExp,
      value: (r) => `Lv.${r.cookingLv}`,
    }),
    category(rows, meUsername, {
      key: "smithing",
      label: "제작",
      icon: "⚒️",
      score: (r) => r.smithingLv * 1e9 + r.smithingExp,
      value: (r) => `Lv.${r.smithingLv}`,
    }),
    category(rows, meUsername, {
      key: "alchemy",
      label: "연금술",
      icon: "⚗️",
      score: (r) => r.alchemyLv * 1e9 + r.alchemyScore,
      value: (r) => `Lv.${r.alchemyLv} · 장인 ${r.alchemyMasters}개`,
    }),
    category(rows, meUsername, {
      key: "fame",
      label: "명성",
      icon: "🏅",
      score: (r) => (RANK_ORDER[r.rank] ?? 0) * 1e9 + r.fame,
      value: (r) => `${r.rank} · ${r.fame.toLocaleString("ko-KR")}`,
    }),
    category(rows, meUsername, {
      key: "collection",
      label: "도감",
      icon: "📖",
      score: (r) => r.collectionPct * 1e9 + r.collectionFound,
      value: (r) => `${r.collectionPct}% (${r.collectionFound}/${r.collectionTotal})`,
    }),
    category(rows, meUsername, {
      key: "gold",
      label: "재산",
      icon: "💰",
      score: (r) => r.gold,
      value: (r) => `${r.gold.toLocaleString("ko-KR")}G`,
    }),
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
