import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getClientIp } from "@/lib/anon";
import { getCategory } from "@/lib/categories";
import { formatFullDate } from "@/lib/format";
import Avatar from "@/components/Avatar";
import VoteButtons from "@/components/VoteButtons";
import CommentThread, { type CommentNode } from "@/components/CommentThread";
import CommentForm from "@/components/CommentForm";
import PostActions from "@/components/PostActions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id: Number(id) },
    select: { title: true },
  });
  return { title: post ? `${post.title} · 아리안로드 온라인 갤러리` : "아리안로드 온라인 갤러리" };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) notFound();

  const found = await prisma.post.findUnique({ where: { id: postId } });
  if (!found) notFound();

  // 조회수 증가
  const post = await prisma.post.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
    include: { author: { select: { id: true, nickname: true, avatar: true } } },
  });

  const user = await getCurrentUser();
  const category = getCategory(post.category);

  const images = await prisma.image.findMany({
    where: { postId },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  // 댓글 + 트리 구성
  const comments = await prisma.comment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, nickname: true, avatar: true } } },
  });

  const nodeMap = new Map<number, CommentNode>();
  for (const c of comments) {
    nodeMap.set(c.id, {
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      isDeleted: c.isDeleted,
      isAuthorPost: c.isAuthorPost,
      member: c.author ? { nickname: c.author.nickname, avatar: c.author.avatar } : null,
      anonNick: c.anonNick,
      anonIp: c.anonIp,
      isMine: !!(user && c.authorId && c.authorId === user.id),
      anonHasPass: !c.authorId && !!c.anonPass,
      replies: [],
    });
  }
  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = nodeMap.get(c.id)!;
    if (c.parentId && nodeMap.has(c.parentId)) {
      nodeMap.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  // 추천 집계
  const ip = await getClientIp();
  const voterKey = user ? `u:${user.id}` : `ip:${ip}`;
  const [up, down, myVote] = await Promise.all([
    prisma.vote.count({ where: { postId, value: 1 } }),
    prisma.vote.count({ where: { postId, value: -1 } }),
    prisma.vote.findUnique({ where: { postId_voterKey: { postId, voterKey } } }),
  ]);

  const postIsMine = !!(user && post.authorId && post.authorId === user.id);
  const postAnonHasPass = !post.authorId && !!post.anonPass;

  return (
    <div className="animate-fadeup space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={post.category === "NOTICE" ? "/?tab=NOTICE" : "/"}
          className="text-sm font-semibold text-slate-400 transition hover:text-slate-600"
        >
          ← 목록으로
        </Link>
      </div>

      {/* 본문 카드 */}
      <article className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <header className="border-b border-line px-5 py-5 sm:px-7">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-bold ${category.color}`}
            >
              {category.emoji} {category.label}
            </span>
          </div>
          <h1 className="text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl">
            {post.title}
          </h1>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {post.author ? (
                <>
                  <Avatar name={post.author.nickname} avatar={post.author.avatar} size={32} />
                  <span className="text-sm font-bold text-slate-700">
                    {post.author.nickname}
                  </span>
                </>
              ) : (
                <>
                  <Avatar name="ㅇㅇ" anonymous size={32} />
                  <span className="text-sm font-bold text-slate-500">
                    {post.anonNick ?? "ㅇㅇ"}
                    <span className="ml-1 text-xs font-normal text-slate-300">
                      ({post.anonIp})
                    </span>
                  </span>
                </>
              )}
            </div>
            <div className="text-right text-xs text-slate-400">
              <div>{formatFullDate(post.createdAt)}</div>
              <div className="mt-0.5">조회 {post.views}</div>
            </div>
          </div>
        </header>

        <div className="post-content px-5 py-7 text-[15px] text-slate-800 sm:px-7">
          {post.content}
        </div>

        {images.length > 0 && (
          <div className="space-y-3 px-5 pb-7 sm:px-7">
            {images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={`/api/image/${img.id}`}
                alt="첨부 이미지"
                className="mx-auto max-w-full rounded-xl border border-line"
              />
            ))}
          </div>
        )}

        {/* 추천 */}
        <div className="px-5 py-6 sm:px-7">
          <VoteButtons postId={postId} initial={{ up, down, my: myVote?.value ?? 0 }} />
        </div>

        <div className="flex items-center justify-between border-t border-line bg-slate-50/60 px-5 py-3 sm:px-7">
          <Link
            href="/"
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            목록
          </Link>
          <PostActions postId={postId} isMine={postIsMine} anonHasPass={postAnonHasPass} />
        </div>
      </article>

      {/* 댓글 카드 */}
      <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-bold text-slate-700 sm:px-7">
          댓글 <span className="text-brand-500">{comments.length}</span>
        </h2>

        <div className="px-5 sm:px-7">
          <CommentThread nodes={roots} postId={postId} isLoggedIn={!!user} />
        </div>

        <div className="border-t border-line bg-slate-50/60 px-5 py-4 sm:px-7">
          <CommentForm postId={postId} isLoggedIn={!!user} />
        </div>
      </section>
    </div>
  );
}
