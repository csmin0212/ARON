import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isValidCategory, BEST_THRESHOLD } from "@/lib/categories";
import Banner from "@/components/Banner";
import CategoryTabs from "@/components/CategoryTabs";
import SearchBar from "@/components/SearchBar";
import PostList, { type ListPost } from "@/components/PostList";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 20;

const POST_SELECT = {
  id: true,
  category: true,
  title: true,
  createdAt: true,
  views: true,
  anonNick: true,
  anonIp: true,
  author: { select: { nickname: true, avatar: true } },
  _count: { select: { comments: true, images: true } },
} as const;

type RawPost = {
  id: number;
  category: string;
  title: string;
  createdAt: Date;
  views: number;
  anonNick: string | null;
  anonIp: string | null;
  author: { nickname: string; avatar: string | null } | null;
  _count: { comments: number; images: number };
};

function normalize(p: RawPost, recMap: Map<number, number>, pinned = false): ListPost {
  return {
    id: p.id,
    category: p.category,
    title: p.title,
    createdAt: p.createdAt,
    views: p.views,
    commentCount: p._count.comments,
    recommendCount: recMap.get(p.id) ?? 0,
    author: p.author,
    anonNick: p.anonNick,
    anonIp: p.anonIp,
    hasImage: p._count.images > 0,
    pinned,
  };
}

// 게시글 id 묶음의 추천(value=1) 수 일괄 집계
async function recommendMap(ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const grouped = await prisma.vote.groupBy({
    by: ["postId"],
    where: { postId: { in: ids }, value: 1 },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.postId, g._count._all]));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const query = (sp.q ?? "").trim();
  const tab = sp.tab && isValidCategory(sp.tab) ? sp.tab : sp.tab === "BEST" ? "BEST" : "ALL";

  let items: ListPost[] = [];
  let total = 0;
  let heading: React.ReactNode = null;
  let makeHref: (p: number) => string;

  if (query) {
    // 🔍 검색 모드
    const where = {
      OR: [{ title: { contains: query } }, { content: { contains: query } }],
    };
    const [count, rows] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: POST_SELECT,
      }),
    ]);
    total = count;
    const recMap = await recommendMap(rows.map((r) => r.id));
    items = rows.map((r) => normalize(r, recMap));
    makeHref = (p) => `/?q=${encodeURIComponent(query)}&page=${p}`;
    heading = (
      <p className="text-sm text-slate-500">
        <span className="font-bold text-brand-600">‘{query}’</span> 검색 결과{" "}
        <span className="font-bold">{total}</span>건
      </p>
    );
  } else if (tab === "BEST") {
    // 🔥 개념글 모드 — 추천 BEST_THRESHOLD 이상
    const grouped = await prisma.vote.groupBy({
      by: ["postId"],
      where: { value: 1 },
      _count: { value: true },
      having: { value: { _count: { gte: BEST_THRESHOLD } } },
    });
    grouped.sort((a, b) => b._count.value - a._count.value);
    total = grouped.length;
    const recMap = new Map(grouped.map((g) => [g.postId, g._count.value]));
    const pageIds = grouped
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((g) => g.postId);
    const rows = await prisma.post.findMany({
      where: { id: { in: pageIds } },
      select: POST_SELECT,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    items = pageIds
      .map((id) => byId.get(id))
      .filter((r): r is RawPost => !!r)
      .map((r) => normalize(r, recMap));
    makeHref = (p) => `/?tab=BEST&page=${p}`;
    heading = (
      <p className="text-sm text-slate-500">
        🔥 추천 <span className="font-bold text-rose-500">{BEST_THRESHOLD}개</span> 이상 받은
        개념글
      </p>
    );
  } else {
    // 일반 목록 (탭/카테고리)
    const regularWhere =
      tab === "ALL" ? { category: { not: "NOTICE" } } : { category: tab };

    const pinnedRaw =
      tab === "NOTICE"
        ? []
        : await prisma.post.findMany({
            where: { category: "NOTICE" },
            orderBy: { createdAt: "desc" },
            take: 3,
            select: POST_SELECT,
          });

    const [count, rows] = await Promise.all([
      prisma.post.count({ where: regularWhere }),
      prisma.post.findMany({
        where: regularWhere,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: POST_SELECT,
      }),
    ]);
    total = count;
    const recMap = await recommendMap([...pinnedRaw, ...rows].map((p) => p.id));
    items = [
      ...pinnedRaw.map((p) => normalize(p, recMap, true)),
      ...rows.map((p) => normalize(p, recMap)),
    ];
    makeHref = (p) => (tab === "ALL" ? `/?page=${p}` : `/?tab=${tab}&page=${p}`);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="animate-fadeup">
      <Banner />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CategoryTabs current={query ? "" : tab} />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <SearchBar initial={query} />
          <Link
            href="/write"
            className="shrink-0 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
          >
            ✏️ 글쓰기
          </Link>
        </div>
      </div>

      {heading && <div className="mb-2 px-1">{heading}</div>}

      <PostList posts={items} />

      <Pagination current={page} totalPages={totalPages} makeHref={makeHref} />
    </div>
  );
}
