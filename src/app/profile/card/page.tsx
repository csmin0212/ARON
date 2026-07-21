import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildProfileCardData } from "@/lib/profileCardData";
import { normalizeCardStyle } from "@/lib/profileCard";
import ProfileCardStudio from "@/components/ProfileCardStudio";

export const metadata = { title: "프로필 카드 · 아리안로드 온라인 갤러리" };

export default async function ProfileCardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });

  const data = buildProfileCardData(user, sheet, {
    title: user.equippedTitle,
    badge: user.equippedBadge,
  });

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Profile Card</p>
          <h1 className="text-2xl font-extrabold text-content">프로필 카드 꾸미기</h1>
        </div>
        <Link
          href="/profile"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle"
        >
          ← 프로필
        </Link>
      </div>

      {sp.saved && (
        <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600">
          ✅ 카드 디자인이 저장됐어요. 공개 프로필 상단에 표시됩니다.
        </p>
      )}

      <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-6">
        <ProfileCardStudio
          data={data}
          initialStyle={normalizeCardStyle(user.profileCardStyle)}
          hasSheet={Boolean(sheet)}
        />
      </div>
    </div>
  );
}
