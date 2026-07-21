import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import { MASTER_SHEET_URL } from "@/lib/charsheet";
import ProfileForm from "@/components/forms/ProfileForm";
import SheetLinkForm from "@/components/forms/SheetLinkForm";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import ProfileHero, { type ProfileAchievementBadge } from "@/components/ProfileHero";
import { checkAndGrant } from "@/lib/achievements";
import {
  parseFeaturedAchievementIds,
  parseProfileVisibility,
} from "@/lib/profile";

export const metadata = { title: "프로필 설정 · 아리안로드 온라인 갤러리" };

function HeroStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-subtle px-3 py-2.5 text-center">
      <p className="text-[11px] font-bold text-faint">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-extrabold ${
          accent ? "text-emerald-500" : "text-content"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; section?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  await checkAndGrant(user.id); // 임계값 업적 지연 판정
  const [counts, sheet, earnedRows] = await Promise.all([
    prisma.post.count({ where: { authorId: user.id } }),
    prisma.characterSheet.findUnique({ where: { userId: user.id } }),
    prisma.userAchievement.findMany({ where: { userId: user.id }, select: { achId: true } }),
  ]);
  const earnedIds = earnedRows.map((row) => row.achId);
  const achievementOptions: ProfileAchievementBadge[] =
    earnedIds.length > 0
      ? await prisma.achievement.findMany({
          where: { id: { in: earnedIds } },
          orderBy: { order: "asc" },
          select: { id: true, name: true, badge: true, rewardTitle: true },
        })
      : [];
  const savedFeaturedIds = parseFeaturedAchievementIds(user.featuredAchievementsJson);
  const legacyFeaturedId =
    savedFeaturedIds.length === 0
      ? achievementOptions.find(
          (achievement) =>
            (achievement.rewardTitle ?? null) === user.equippedTitle &&
            (achievement.badge ?? null) === user.equippedBadge,
        )?.id
      : undefined;
  const featuredIds = savedFeaturedIds.length > 0 ? savedFeaturedIds : legacyFeaturedId ? [legacyFeaturedId] : [];
  const featuredAchievements = featuredIds
    .map((id) => achievementOptions.find((achievement) => achievement.id === id))
    .filter((achievement): achievement is ProfileAchievementBadge => Boolean(achievement));
  const visibility = parseProfileVisibility(user.profileVisibilityJson);
  const section = sp.section === "sheet" ? "sheet" : "edit";

  const rank = sheet?.adventurerRank ?? null;
  const tags = (
    sheet
      ? [sheet.charClass, sheet.race, sheet.attribute && `속성 ${sheet.attribute}`]
      : []
  ).filter(Boolean) as string[];
  const gold =
    sheet?.curGold != null ? `${sheet.curGold.toLocaleString()}G` : sheet?.gold ?? null;

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      {/* 히어로 헤더 */}
      <ProfileHero
        nickname={user.nickname}
        username={user.username}
        avatar={user.avatar}
        status={user.profileStatus}
        level={sheet?.level}
        rank={rank}
        tags={tags}
        color={user.profileColor}
        cover={user.profileCover}
        title={user.equippedTitle}
        badge={user.equippedBadge}
        featuredAchievements={featuredAchievements}
        footer={
          <div className="grid grid-cols-3 gap-2">
            <HeroStat label="작성한 글" value={`${counts}`} />
            <HeroStat label="레벨" value={sheet?.level != null ? `Lv.${sheet.level}` : "-"} />
            <HeroStat label="소지금" value={gold ?? "-"} accent />
          </div>
        }
      />

      {sp.saved && (
        <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600">
          ✅ 프로필이 저장되었어요.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/profile?section=sheet"
          className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 ${
            section === "sheet" ? "border-brand-300 bg-brand-50/60" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Sheet Sync</p>
          <h2 className="mt-1 text-lg font-extrabold text-content">시트 연동</h2>
          <p className="mt-1 text-sm text-muted">
            구글 스프레드시트 캐릭터 시트를 연결하고 동기화합니다.
          </p>
        </Link>
        <Link
          href="/profile?section=edit"
          className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 ${
            section === "edit" ? "border-brand-300 bg-brand-50/60" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Profile</p>
          <h2 className="mt-1 text-lg font-extrabold text-content">프로필 편집</h2>
          <p className="mt-1 text-sm text-muted">
            배너, 아바타, 공개 범위, 대표 업적을 꾸밉니다.
          </p>
        </Link>
        <Link
          href="/profile/card"
          className="group relative overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300"
        >
          <div
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-70 blur-2xl transition group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%)",
            }}
          />
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Profile Card</p>
          <h2 className="mt-1 flex items-center gap-1.5 text-lg font-extrabold text-content">
            프로필 카드
            <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
              New
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            게임처럼 꾸미는 캐릭터 명함 · 6가지 디자인.
          </p>
        </Link>
      </div>

      {section === "sheet" && (
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-content">캐릭터 시트</h2>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600">
              구글 시트 연동
            </span>
          </div>
          <p className="mb-4 text-sm text-faint">
            구글 스프레드시트 캐릭터 시트를 연결하면 능력치를 자동으로 불러와요.
          </p>

          {sheet && (
            <div className="mb-5 rounded-2xl border border-line bg-canvas p-4">
              <CharacterSheetCard sheet={{ ...sheet, charName: user.nickname }} />
            </div>
          )}

          <SheetLinkForm
            initialTab={sheet?.sheetTab}
            syncedAt={sheet?.syncedAt ? formatFullDate(sheet.syncedAt) : null}
            masterUrl={MASTER_SHEET_URL}
          />
        </div>
      )}

      {section === "edit" && (
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-extrabold text-content">프로필 편집</h2>
          <ProfileForm
            initialUsername={user.username}
            initialNickname={user.nickname}
            initialAvatar={user.avatar}
            initialStatus={user.profileStatus}
            initialColor={user.profileColor}
            initialCover={user.profileCover}
            initialVisibility={visibility}
            achievementOptions={achievementOptions}
            initialFeaturedAchievementIds={featuredIds}
          />
        </div>
      )}
    </div>
  );
}
