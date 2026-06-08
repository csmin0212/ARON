import Link from "next/link";
import Avatar from "./Avatar";
import { getCategory } from "@/lib/categories";
import { formatListDate } from "@/lib/format";

export type ListPost = {
  id: number;
  category: string;
  title: string;
  createdAt: Date;
  views: number;
  commentCount: number;
  recommendCount: number;
  author: { nickname: string; avatar: string | null } | null;
  anonNick: string | null;
  anonIp: string | null;
  hasImage?: boolean;
  pinned?: boolean;
};

function CategoryBadge({ category }: { category: string }) {
  const c = getCategory(category);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ${c.color}`}
    >
      {c.label}
    </span>
  );
}

function AuthorCell({ post }: { post: ListPost }) {
  if (post.author) {
    return (
      <span className="flex items-center gap-1.5">
        <Avatar name={post.author.nickname} avatar={post.author.avatar} size={20} />
        <span className="truncate font-medium text-content">{post.author.nickname}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-faint">
      <Avatar name="ㅇㅇ" anonymous size={20} />
      <span className="truncate">
        {post.anonNick ?? "ㅇㅇ"}
        <span className="ml-0.5 text-[11px] text-faint2">({post.anonIp})</span>
      </span>
    </span>
  );
}

function Row({ post }: { post: ListPost }) {
  return (
    <li className={post.pinned ? "bg-brand-50/60" : "transition hover:bg-subtle/80"}>
      <Link href={`/post/${post.id}`} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        {/* 번호 / 핀 */}
        <span className="hidden w-10 shrink-0 text-center text-xs text-faint2 sm:block">
          {post.pinned ? "📌" : post.id}
        </span>

        <CategoryBadge category={post.category} />

        {/* 제목 + (모바일) 메타 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-medium text-content">{post.title}</span>
            {post.hasImage && <span className="shrink-0 text-xs">🖼</span>}
            {post.commentCount > 0 && (
              <span className="shrink-0 text-xs font-bold text-brand-500">
                [{post.commentCount}]
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-faint sm:hidden">
            <AuthorCell post={post} />
            <span>·</span>
            <span>{formatListDate(post.createdAt)}</span>
            <span>· 조회 {post.views}</span>
            {post.recommendCount > 0 && (
              <span className="font-semibold text-rose-400">· 추천 {post.recommendCount}</span>
            )}
          </div>
        </div>

        {/* 데스크탑 컬럼 */}
        <span className="hidden w-36 shrink-0 truncate text-xs sm:flex">
          <AuthorCell post={post} />
        </span>
        <span className="hidden w-12 shrink-0 text-center text-xs text-faint sm:block">
          {formatListDate(post.createdAt)}
        </span>
        <span className="hidden w-12 shrink-0 text-center text-xs text-faint sm:block">
          {post.views}
        </span>
        <span
          className={`hidden w-12 shrink-0 text-center text-xs font-semibold sm:block ${
            post.recommendCount > 0 ? "text-rose-500" : "text-faint2"
          }`}
        >
          {post.recommendCount}
        </span>
      </Link>
    </li>
  );
}

export default function PostList({ posts }: { posts: ListPost[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {/* 헤더 (데스크탑) */}
      <div className="hidden items-center gap-3 border-b border-line bg-subtle/70 px-4 py-2.5 text-[11px] font-bold text-faint sm:flex">
        <span className="w-10 text-center">번호</span>
        <span className="w-[34px]">말머리</span>
        <span className="flex-1">제목</span>
        <span className="w-36">글쓴이</span>
        <span className="w-12 text-center">작성일</span>
        <span className="w-12 text-center">조회</span>
        <span className="w-12 text-center">추천</span>
      </div>

      {posts.length === 0 ? (
        <div className="px-4 py-16 text-center text-sm text-faint">
          아직 게시글이 없어요. 첫 글의 주인공이 되어보세요! ✨
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((p) => (
            <Row key={p.id} post={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
