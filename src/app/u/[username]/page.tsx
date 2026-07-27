import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCookingRecipes } from "@/lib/gameCatalog";
import { getCurrentUser } from "@/lib/auth";
import { formatFullDate } from "@/lib/format";
import type { SheetInventory } from "@/lib/googleSheets";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import { collectionItems, lifeSkillMarketPrice } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { checkAndGrant } from "@/lib/achievements";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import CharacterTabs from "@/components/CharacterTabs";
import ProfileCard from "@/components/ProfileCard";
import ProfileContent, { HERO_CONTENT_STYLE } from "@/components/ProfileContent";
import { buildProfileIdentity, computeProfileValues } from "@/lib/profileValues";
import { parseProfileWidgets, resolveWidgets } from "@/lib/profileWidgets";
import LifeSkillPanel from "@/components/LifeSkillPanel";
import ProfileHero, { type ProfileAchievementBadge } from "@/components/ProfileHero";
import AchievementBook, { type AchView } from "@/components/AchievementBook";
import ProfileTradePanel, { type TradeOfferView } from "@/components/ProfileTradePanel";
import type { CollectionBookEntry } from "@/components/CollectionRankBook";
import {
  parseFeaturedAchievementIds,
  parseProfileVisibility,
} from "@/lib/profile";
import { isGmUsername } from "@/lib/gm";
import { parseGmNpcPersonas } from "@/lib/gmNpc";

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

function parseOfferableItems(invJson: string | null | undefined) {
  try {
    const inv = invJson ? (JSON.parse(invJson) as SheetInventory) : null;
    const byName = new Map<string, { name: string; qty: number; effect?: string | null; weight?: number | null }>();
    for (const item of inv?.items ?? []) {
      if (!item.name || item.qty <= 0) continue;
      const existing = byName.get(item.name);
      if (existing) existing.qty += item.qty;
      else byName.set(item.name, { name: item.name, qty: item.qty, effect: item.effect, weight: item.weight });
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  } catch {
    return [];
  }
}

function parseRecipeIngredients(value: string): { name: string; qty: number }[] {
  try {
    const parsed = JSON.parse(value) as { name?: string; qty?: number }[];
    return parsed
      .filter((item) => item.name && item.qty && item.qty > 0)
      .map((item) => ({ name: item.name!, qty: item.qty! }));
  } catch {
    return [];
  }
}

function recipeRankNumber(rank: string | null | undefined): number {
  const match = String(rank ?? "").match(/R\s*(\d+)/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

function pct(found: number, total: number): number {
  return total > 0 ? Math.round((found / total) * 100) : 0;
}

function PrivateProfileBlock() {
  return (
    <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
      <p className="text-sm font-bold text-muted">비공개 상태입니다.</p>
    </div>
  );
}

function CollectionProgressPanel({
  rows,
}: {
  rows: { label: string; emoji: string; found: number; total: number; isPrivate?: boolean }[];
}) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-lg font-extrabold text-content">도감 완성률</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const value = pct(row.found, row.total);
          return (
            <div key={row.label} className="rounded-2xl bg-subtle/60 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-content">
                  {row.emoji} {row.label}
                </p>
                <p className="text-sm font-black text-brand-600">
                  {row.isPrivate ? "비공개" : `${value}%`}
                </p>
              </div>
              {row.isPrivate ? (
                <p className="mt-2 text-xs font-medium text-faint">비공개 상태입니다.</p>
              ) : (
                <>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-400"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-right text-[11px] font-bold text-faint">
                    {row.found} / {row.total}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tradeView(offer: {
  id: string;
  offerItemName: string | null;
  offerItemQty: number;
  offerGold: number;
  requestGold: number;
  message: string | null;
  createdAt: Date;
  fromUser: { nickname: string; username: string };
  toUser: { nickname: string; username: string };
}): TradeOfferView {
  return {
    id: offer.id,
    fromNickname: offer.fromUser.nickname,
    fromUsername: offer.fromUser.username,
    toNickname: offer.toUser.nickname,
    toUsername: offer.toUser.username,
    offerItemName: offer.offerItemName,
    offerItemQty: offer.offerItemQty,
    offerGold: offer.offerGold,
    requestGold: offer.requestGold,
    message: offer.message,
    createdAt: formatFullDate(offer.createdAt),
  };
}

export default async function CharacterPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams?: Promise<{ npc?: string }>;
}) {
  const { username } = await params;
  const sp = searchParams ? await searchParams : {};
  const uname = decodeURIComponent(username);

  const profile = await prisma.user.findUnique({
    where: { username: uname },
    // 공개 프로필은 시트의 표시용 컬럼만 필요 — 월드 전용 대용량 JSON은 제외해 egress 절감.
    include: {
      sheet: {
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
      },
    },
  });
  if (!profile) notFound();

  const npcKey = String(sp.npc ?? "").trim();
  const npcPersona =
    npcKey && isGmUsername(profile.username)
      ? parseGmNpcPersonas(profile.gmNpcPersonasJson).find((persona) => persona.key === npcKey)
      : null;
  const isNpcProfile = Boolean(npcPersona);
  const displayProfile = npcPersona
    ? {
        ...profile,
        nickname: npcPersona.name,
        username: npcPersona.key,
        avatar: npcPersona.avatar ?? profile.avatar,
        profileStatus: null,
      }
    : profile;

  const me = await getCurrentUser();
  const isOwn = !isNpcProfile && me?.id === profile.id;

  // 본인 프로필 열람 시 임계값 업적(명성·골드·레벨 등) 지연 판정
  if (isOwn) await checkAndGrant(profile.id);

  const [achs, earnedRows, mySheet, incomingRows, outgoingRows, recipes, discoveredRecipes] = await Promise.all([
    prisma.achievement.findMany({ orderBy: { order: "asc" } }),
    prisma.userAchievement.findMany({ where: { userId: profile.id }, select: { achId: true } }),
    me
      ? prisma.characterSheet.findUnique({ where: { userId: me.id }, select: { invJson: true } })
      : Promise.resolve(null),
    me
      ? prisma.tradeOffer.findMany({
          where: isOwn
            ? { toUserId: me.id, status: "PENDING" }
            : { fromUserId: profile.id, toUserId: me.id, status: "PENDING" },
          include: {
            fromUser: { select: { nickname: true, username: true } },
            toUser: { select: { nickname: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    me
      ? prisma.tradeOffer.findMany({
          where: isOwn
            ? { fromUserId: me.id, status: "PENDING" }
            : { fromUserId: me.id, toUserId: profile.id, status: "PENDING" },
          include: {
            fromUser: { select: { nickname: true, username: true } },
            toUser: { select: { nickname: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    getCookingRecipes(),
    prisma.userRecipe.findMany({ where: { userId: profile.id }, select: { recipeId: true } }),
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
    rewardFame: a.rewardFame,
    earned: earnedSet.has(a.id),
  }));

  const life = parseLifeState(profile.sheet?.lifeJson);
  await loadLifeItems();
  // 도감 어획물/채집물 카탈로그를 서버에서 계산(시트 동기화본 반영) → 클라로 prop 전달.
  const lifeEntries: CollectionBookEntry[] = collectionItems(false).map(({ kind, item }) => ({
    kind,
    name: item.name,
    rank: item.rank,
    rarity: item.rarity,
    price: lifeSkillMarketPrice(kind, item),
    weight: item.weight,
    text: item.text,
    discovered: life.collection[kind].includes(item.name),
    count: life.catchCounts[kind][item.name] ?? 0,
  }));
  const discoveredRecipeIds = new Set(discoveredRecipes.map((recipe) => recipe.recipeId));
  const cookingRecipes: CollectionBookEntry[] = recipes.map((recipe) => ({
    kind: "요리",
    id: recipe.id,
    name: recipe.name,
    rank: recipeRankNumber(recipe.rank),
    rarity: recipe.rank,
    category: recipe.category,
    ingredients: parseRecipeIngredients(recipe.ingredientsJson)
      .map((ingredient) => `${ingredient.name}x${ingredient.qty}`)
      .join(", "),
    resultName: recipe.resultName,
    price: recipe.sellPrice,
    weight: recipe.weight,
    text: recipe.effect || "특별한 효과는 없습니다.",
    count: discoveredRecipeIds.has(recipe.id) ? 1 : 0,
    discovered: recipe.isPublic || discoveredRecipeIds.has(recipe.id),
  }));
  const pendingCount = isOwn ? life.pending.length : 0;
  const visibility = parseProfileVisibility(profile.profileVisibilityJson);
  const canViewSheet = !isNpcProfile && (isOwn || visibility.sheet);
  const canViewLifeProfile = !isNpcProfile && (isOwn || visibility.lifeProfile);
  const canViewCollection = !isNpcProfile && (isOwn || visibility.collection);
  const canViewSkills = !isNpcProfile && (isOwn || visibility.skills);
  const canViewAchievements = !isNpcProfile && (isOwn || visibility.achievements);

  const achievementOptions: ProfileAchievementBadge[] = achs
    .filter((achievement) => earnedSet.has(achievement.id))
    .map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      badge: achievement.badge,
      rewardTitle: achievement.rewardTitle,
    }));
  const savedFeaturedIds = parseFeaturedAchievementIds(profile.featuredAchievementsJson);
  const legacyFeaturedId =
    savedFeaturedIds.length === 0
      ? achievementOptions.find(
          (achievement) =>
            (achievement.rewardTitle ?? null) === profile.equippedTitle &&
            (achievement.badge ?? null) === profile.equippedBadge,
        )?.id
      : undefined;
  const featuredIds = savedFeaturedIds.length > 0 ? savedFeaturedIds : legacyFeaturedId ? [legacyFeaturedId] : [];
  const featuredAchievements = canViewAchievements
    ? featuredIds
        .map((id) => achievementOptions.find((achievement) => achievement.id === id))
        .filter((achievement): achievement is ProfileAchievementBadge => Boolean(achievement))
    : [];

  const tags = (
    profile.sheet && canViewSheet
      ? [
          profile.sheet.charClass,
          profile.sheet.race,
          profile.sheet.attribute && `속성 ${profile.sheet.attribute}`,
        ]
      : []
  ).filter(Boolean) as string[];

  // ── 프로필 헤더(메인/카드) 정체성 + 내용물 위젯 ──
  const mainForm = profile.profileMain === "card" ? "card" : "hero";
  const headerWidgetKeys = parseProfileWidgets(profile.profileWidgetsJson);
  const headerPostCount = await prisma.post.count({
    where: isNpcProfile ? { authorId: profile.id, authorName: npcPersona!.name } : { authorId: profile.id },
  });
  const headerValues = await computeProfileValues({
    userId: profile.id,
    sheet: isNpcProfile ? null : profile.sheet,
    postCount: headerPostCount,
    canViewSheet,
    includeCollection: headerWidgetKeys.includes("collection"),
    canViewCollection,
  });
  const headerIdentity = buildProfileIdentity(displayProfile, isNpcProfile ? null : profile.sheet, {
    title: canViewAchievements ? profile.equippedTitle : null,
    badge: canViewAchievements ? profile.equippedBadge : null,
    canViewSheet,
  });
  const headerWidgets = resolveWidgets(headerWidgetKeys, headerValues);

  // ── 탭 내용 ──
  const sheetTab = (
    canViewSheet ? (
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-extrabold text-content">캐릭터 시트</h2>
        {profile.sheet ? (
          <CharacterSheetCard sheet={{ ...profile.sheet, charName: displayProfile.nickname }} />
        ) : (
          <p className="py-6 text-center text-sm text-faint">
            아직 캐릭터 시트를 연동하지 않았어요.
            {isOwn && (
              <>
                {" "}
                <Link href="/profile?section=sheet" className="font-semibold text-brand-600 hover:underline">
                  지금 연동하기
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    ) : (
      <PrivateProfileBlock />
    )
  );

  const lifeTab = (
    <LifeSkillPanel
      life={life}
      isOwn={isOwn}
      canViewProfile={canViewLifeProfile}
      canViewSkills={canViewSkills}
    />
  );

  const collectionRows = [
    {
      label: "업적",
      emoji: "🏅",
      found: achView.filter((achievement) => achievement.earned).length,
      total: achView.length,
      isPrivate: !canViewAchievements,
    },
    ...(["낚시", "채집", "채광"] as const).map((kind) => {
      const group = lifeEntries.filter((entry) => entry.kind === kind);
      return {
        label: `${kind} 도감`,
        emoji: kind === "낚시" ? "🎣" : kind === "채집" ? "🌿" : "⛏️",
        found: group.filter((entry) => entry.discovered).length,
        total: group.length,
      };
    }),
    {
      label: "요리 도감",
      emoji: "🍳",
      found: cookingRecipes.filter((entry) => entry.discovered).length,
      total: cookingRecipes.length,
    },
  ];
  const collectionTab = canViewCollection ? (
    <CollectionProgressPanel rows={collectionRows} />
  ) : (
    <PrivateProfileBlock />
  );

  const achTab = (
    canViewAchievements ? (
      <AchievementBook
        achievements={achView}
        isOwn={isOwn}
        equippedTitle={profile.equippedTitle}
        equippedBadge={profile.equippedBadge}
        selectedAchievementIds={featuredIds}
      />
    ) : (
      <PrivateProfileBlock />
    )
  );

  const editLink = isOwn ? (
    <Link
      href="/profile?section=edit"
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle"
    >
      프로필 편집
    </Link>
  ) : undefined;

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      {/* 프로필 헤더 — profileMain 에 따라 메인 프로필(hero) 또는 프로필 카드 하나만 노출 */}
      {mainForm === "card" ? (
        <div className="space-y-2">
          {editLink && <div className="flex justify-end">{editLink}</div>}
          <ProfileCard
            identity={headerIdentity}
            widgets={headerWidgets}
            style={profile.profileCardStyle}
            featuredAchievements={featuredAchievements}
          />
        </div>
      ) : (
        <ProfileHero
          nickname={displayProfile.nickname}
          username={displayProfile.username}
          avatar={displayProfile.avatar}
          status={displayProfile.profileStatus}
          level={headerIdentity.level}
          rank={headerIdentity.rank}
          tags={tags}
          color={profile.profileColor}
          cover={profile.profileCover}
          title={canViewAchievements ? profile.equippedTitle : null}
          badge={canViewAchievements ? profile.equippedBadge : null}
          featuredAchievements={featuredAchievements}
          action={editLink}
          footer={
            headerWidgets.length > 0 ? (
              <ProfileContent widgets={headerWidgets} style={HERO_CONTENT_STYLE} />
            ) : undefined
          }
        />
      )}

      {!isNpcProfile && (
        <>
      <CharacterTabs
        tabs={[
          { key: "sheet", label: "📜 캐릭터 시트", content: sheetTab },
          { key: "life", label: "🌿 생활 데이터", content: lifeTab },
          { key: "collection", label: "📖 도감", content: collectionTab },
          { key: "ach", label: "🏅 업적", content: achTab },
        ]}
        badges={{ life: pendingCount }}
      />

      {me ? (
        <ProfileTradePanel
          targetUserId={profile.id}
          targetNickname={profile.nickname}
          isOwn={isOwn}
          offerableItems={parseOfferableItems(mySheet?.invJson)}
          incoming={incomingRows.map(tradeView)}
          outgoing={outgoingRows.map(tradeView)}
        />
      ) : (
        <div className="rounded-3xl border border-line bg-surface p-5 text-sm text-faint shadow-sm">
          로그인하면 이 캐릭터에게 거래를 제안할 수 있어요.
        </div>
      )}
        </>
      )}
    </div>
  );
}
