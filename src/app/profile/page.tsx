import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/forms/ProfileForm";

export const metadata = { title: "프로필 설정 · 아리안로드 온라인 갤러리" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const counts = await prisma.post.count({ where: { authorId: user.id } });

  return (
    <div className="mx-auto max-w-md animate-fadeup py-4">
      <h1 className="mb-1 text-2xl font-extrabold text-slate-800">프로필 설정</h1>
      <p className="mb-5 text-sm text-slate-400">
        @{user.username} · 작성한 글 {counts}개
      </p>

      {sp.saved && (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600">
          ✅ 프로필이 저장되었어요.
        </p>
      )}

      <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <ProfileForm initialNickname={user.nickname} initialAvatar={user.avatar} />
      </div>
    </div>
  );
}
