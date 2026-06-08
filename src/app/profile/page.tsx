import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import ProfileForm from "@/components/forms/ProfileForm";
import SheetLinkForm from "@/components/forms/SheetLinkForm";
import CharacterSheetCard from "@/components/CharacterSheetCard";

export const metadata = { title: "프로필 설정 · 아리안로드 온라인 갤러리" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const [counts, sheet] = await Promise.all([
    prisma.post.count({ where: { authorId: user.id } }),
    prisma.characterSheet.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div className="mx-auto max-w-md animate-fadeup space-y-5 py-4">
      <div>
        <h1 className="mb-1 text-2xl font-extrabold text-content">프로필 설정</h1>
        <p className="text-sm text-faint">
          @{user.username} · 작성한 글 {counts}개
        </p>
      </div>

      {sp.saved && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-600">
          ✅ 프로필이 저장되었어요.
        </p>
      )}

      {/* 프로필 (닉네임 / 아바타) */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <ProfileForm initialNickname={user.nickname} initialAvatar={user.avatar} />
      </div>

      {/* 캐릭터 시트 */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-content">캐릭터 시트</h2>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">
            맵 기능 연동 예정
          </span>
        </div>
        <p className="mb-4 text-sm text-faint">
          구글 스프레드시트 캐릭터 시트를 연결하면 능력치를 자동으로 불러와요.
        </p>

        {sheet && (
          <div className="mb-5 rounded-2xl border border-line bg-canvas p-4">
            <CharacterSheetCard sheet={sheet} />
          </div>
        )}

        <SheetLinkForm
          initialUrl={sheet?.sheetUrl}
          syncedAt={sheet?.syncedAt ? formatFullDate(sheet.syncedAt) : null}
        />
      </div>
    </div>
  );
}
