import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import WriteForm from "@/components/forms/WriteForm";

export const metadata = { title: "글 수정 · 아리안로드 온라인 갤러리" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = Number(id);
  if (!postId) notFound();

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) notFound();

  const user = await getCurrentUser();
  const isAnon = !post.authorId;

  // 회원 글은 본인만 수정 화면 진입 가능. 익명 글은 비밀번호로 제출 시 확인.
  if (!isAnon && (!user || user.id !== post.authorId)) {
    redirect(`/post/${postId}`);
  }

  const images = await prisma.image.findMany({
    where: { postId },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl animate-fadeup py-2">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-content">글 수정</h1>
        <Link
          href={`/post/${postId}`}
          className="text-sm font-semibold text-faint hover:text-content"
        >
          ← 돌아가기
        </Link>
      </div>

      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <WriteForm
          isLoggedIn={!!user}
          initial={{
            id: post.id,
            category: post.category,
            title: post.title,
            content: post.content,
            price: post.price,
            tradeType: post.tradeType,
            isAnon,
            images: images.map((img) => ({ id: img.id, url: `/api/image/${img.id}` })),
          }}
        />
      </div>
    </div>
  );
}
