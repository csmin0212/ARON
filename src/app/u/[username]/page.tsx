import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import Avatar from "@/components/Avatar";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import CharacterTabs from "@/components/CharacterTabs";
import LifeSkillPanel from "@/components/LifeSkillPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username: decodeURIComponent(username) },
    select: { nickname: true },
  });
  return { title: user ? `${user.nickname} · 캐릭터` : "캐릭터" };
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const uname = decodeURIComponent(username);

  const profile = await prisma.user.findUnique({
    where: { username: uname },
    include: { sheet: true },
  });
  if (!profile) notFound();

  const me = await getCurrentUser();
  const isOwn = me?.id === profile.id;

  const life = parseLifeState(profile.sheet?.lifeJson);
  const pendingCount = isOwn ? life.pending.length : 0;

  // ── 탭 내용 ──
  const sheetTab = (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">캐릭터 시트</h2>
      {profile.sheet ? (
        <CharacterSheetCard sheet={{ ...profile.sheet, charName: profile.nickname }} />
      ) : (
        <p className="py-6 text-center text-sm text-faint">
          아직 캐릭터 시트를 연동하지 않았어요.
          {isOwn && (
            <>
              {" "}
              <Link href="/profile" className="font-semibold text-brand-600 hover:underline">
                지금 연동하기
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );

  const lifeTab = <LifeSkillPanel life={life} isOwn={isOwn} />;

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <Avatar name={profile.nickname} avatar={profile.avatar} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-content">{profile.nickname}</h1>
          <p className="text-sm text-faint">@{profile.username}</p>
        </div>
        {isOwn && (
          <Link
            href="/profile"
            className="ml-auto rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle"
          >
            프로필 편집
          </Link>
        )}
      </div>

      <CharacterTabs
        tabs={[
          { key: "sheet", label: "📜 캐릭터 시트", content: sheetTab },
          { key: "life", label: "🌿 생활 데이터", content: lifeTab },
        ]}
        badges={{ life: pendingCount }}
      />
    </div>
  );
}
