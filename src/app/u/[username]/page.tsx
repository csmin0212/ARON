import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import { checkAndGrant } from "@/lib/achievements";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import CharacterTabs from "@/components/CharacterTabs";
import LifeSkillPanel from "@/components/LifeSkillPanel";
import ProfileHero from "@/components/ProfileHero";
import AchievementBook, { type AchView } from "@/components/AchievementBook";

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

  // 본인 프로필 열람 시 임계값 업적(명성·골드·레벨 등) 지연 판정
  if (isOwn) await checkAndGrant(profile.id);

  const [achs, earnedRows] = await Promise.all([
    prisma.achievement.findMany({ orderBy: { order: "asc" } }),
    prisma.userAchievement.findMany({ where: { userId: profile.id }, select: { achId: true } }),
  ]);
  const earnedSet = new Set(earnedRows.map((r) => r.achId));
  const achView: AchView[] = achs.map((a) => ({
    id: a.id,
    category: a.category,
    name: a.name,
    desc: a.desc,
    badge: a.badge,
    secret: a.secret,
    rewardTitle: a.rewardTitle,
    earned: earnedSet.has(a.id),
  }));

  const life = parseLifeState(profile.sheet?.lifeJson);
  const pendingCount = isOwn ? life.pending.length : 0;

  const tags = (
    profile.sheet
      ? [
          profile.sheet.charClass,
          profile.sheet.race,
          profile.sheet.attribute && `속성 ${profile.sheet.attribute}`,
        ]
      : []
  ).filter(Boolean) as string[];

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

  const achTab = (
    <AchievementBook
      achievements={achView}
      isOwn={isOwn}
      equippedTitle={profile.equippedTitle}
    />
  );

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      {/* 프로필 헤더 */}
      <ProfileHero
        nickname={profile.nickname}
        username={profile.username}
        avatar={profile.avatar}
        level={profile.sheet?.level}
        rank={profile.sheet?.adventurerRank}
        tags={tags}
        color={profile.profileColor}
        cover={profile.profileCover}
        title={profile.equippedTitle}
        badge={profile.equippedBadge}
        action={
          isOwn ? (
            <Link
              href="/profile"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle"
            >
              프로필 편집
            </Link>
          ) : undefined
        }
      />

      <CharacterTabs
        tabs={[
          { key: "sheet", label: "📜 캐릭터 시트", content: sheetTab },
          { key: "life", label: "🌿 생활 데이터", content: lifeTab },
          { key: "ach", label: "🏅 업적", content: achTab },
        ]}
        badges={{ life: pendingCount }}
      />
    </div>
  );
}
