import { prisma } from "@/lib/prisma";
import { parseLifeState } from "@/lib/lifeSkillPerks";
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
  cookingLv: number;
  cookingExp: number;
  fame: number;
  rank: string;
  collection: number;
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

export default async function HallPage() {
  const sheets = await prisma.characterSheet.findMany({
    select: {
      lifeJson: true,
      fame: true,
      adventurerRank: true,
      curGold: true,
      user: {
        select: { username: true, nickname: true, avatar: true, equippedBadge: true },
      },
    },
  });

  const rows: Row[] = sheets.map((s) => {
    const life = parseLifeState(s.lifeJson);
    return {
      username: s.user.username,
      nickname: s.user.nickname,
      avatar: s.user.avatar,
      badge: s.user.equippedBadge,
      fishingLv: life.fishing.level,
      fishingExp: life.fishing.exp,
      plantLv: life.plant.level,
      plantExp: life.plant.exp,
      cookingLv: life.cooking.level,
      cookingExp: life.cooking.exp,
      fame: s.fame,
      rank: s.adventurerRank,
      collection: life.collection.낚시.length + life.collection.채집.length + life.collection.채광.length,
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
      key: "cooking",
      label: "요리",
      icon: "🍳",
      entries: rankBy(rows, (r) => r.cookingLv * 1e9 + r.cookingExp, (r) => `Lv.${r.cookingLv}`),
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
      entries: rankBy(rows, (r) => r.collection, (r) => `${r.collection}종`),
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
