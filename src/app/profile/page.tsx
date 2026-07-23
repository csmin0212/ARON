import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import { MASTER_SHEET_URL } from "@/lib/charsheet";
import ProfileForm from "@/components/forms/ProfileForm";
import SheetLinkForm from "@/components/forms/SheetLinkForm";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import type { ProfileAchievementBadge } from "@/components/ProfileHero";
import { checkAndGrant } from "@/lib/achievements";
import {
  parseFeaturedAchievementIds,
  parseProfileVisibility,
} from "@/lib/profile";
import { computeProfileValues, buildProfileIdentity } from "@/lib/profileValues";
import { parseProfileWidgets } from "@/lib/profileWidgets";
import { normalizeCardStyle } from "@/lib/profileCard";
import { ownedSkinsForSheet } from "@/lib/cardSkinUnlock";

export const metadata = { title: "프로필 설정 · 아리안로드 온라인 갤러리" };

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
    prisma.characterSheet.findUnique({
      where: { userId: user.id },
      // 프로필 편집 화면은 표시·위젯용 컬럼만 필요 — 월드 전용 대용량 JSON 제외.
      omit: {
        invJson: true,
        guildQuestJson: true,
        housingJson: true,
        weeklyIncomeJson: true,
        sheetSkillsJson: true,
        achStatsJson: true,
        probeJson: true,
        visitedJson: true,
        discoveredJson: true,
        pendingCatchJson: true,
        pendingGatherJson: true,
        pendingMineJson: true,
        pendingBrewJson: true,
      },
    }),
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
  const visibility = parseProfileVisibility(user.profileVisibilityJson);
  const section = sp.section === "sheet" ? "sheet" : "edit";

  // 프로필 폼 미리보기용 — 위젯 값·정체성(본인이라 전부 열람)
  const widgetValues = await computeProfileValues({
    userId: user.id,
    sheet,
    postCount: counts,
    canViewSheet: true,
    includeCollection: true,
  });
  const previewIdentity = buildProfileIdentity(user, sheet, { canViewSheet: true });
  const baseIdentity = {
    level: previewIdentity.level,
    rank: previewIdentity.rank,
    rankPct: previewIdentity.rankPct,
    charClass: previewIdentity.charClass,
    race: previewIdentity.race,
    attribute: previewIdentity.attribute,
  };

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/profile?section=sheet"
          className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 ${
            section === "sheet" ? "border-brand-300 bg-brand-50/60" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Sheet Sync</p>
          <h2 className="mt-1 text-lg font-extrabold text-content">시트 연동</h2>
        </Link>
        <Link
          href="/profile?section=edit"
          className={`rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 ${
            section === "edit" ? "border-brand-300 bg-brand-50/60" : "border-line bg-surface"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-faint">Profile</p>
          <h2 className="mt-1 text-lg font-extrabold text-content">프로필 편집</h2>
        </Link>
      </div>

      {sp.saved && (
        <p className="rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600">
          ✅ 프로필이 저장되었어요.
        </p>
      )}

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
            initialMain={user.profileMain === "card" ? "card" : "hero"}
            initialCardStyle={normalizeCardStyle(user.profileCardStyle)}
            initialWidgets={parseProfileWidgets(user.profileWidgetsJson)}
            initialOwnedSkins={ownedSkinsForSheet(user.ownedCardSkinsJson, sheet)}
            initialGold={sheet?.curGold ?? 0}
            baseIdentity={baseIdentity}
            values={widgetValues}
          />
        </div>
      )}
    </div>
  );
}
