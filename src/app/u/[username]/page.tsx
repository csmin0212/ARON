import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatFullDate } from "@/lib/format";
import type { SheetInventory } from "@/lib/googleSheets";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import { checkAndGrant } from "@/lib/achievements";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import CharacterTabs from "@/components/CharacterTabs";
import LifeSkillPanel, { type LifeTreeNodeView } from "@/components/LifeSkillPanel";
import ProfileHero from "@/components/ProfileHero";
import AchievementBook, { type AchView } from "@/components/AchievementBook";
import ProfileTradePanel, { type TradeOfferView } from "@/components/ProfileTradePanel";
import type { CollectionBookEntry } from "@/components/CollectionRankBook";

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
    prisma.cookingRecipe.findMany({ orderBy: { order: "asc" } }),
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
    earned: earnedSet.has(a.id),
  }));

  const life = parseLifeState(profile.sheet?.lifeJson);
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

  const treeNodeRows = await prisma.lifeSkillNode.findMany({ orderBy: { order: "asc" } });
  const treeNodes: LifeTreeNodeView[] = treeNodeRows.map((n) => {
    let prereq: string[] = [];
    try {
      if (n.prereqJson) prereq = JSON.parse(n.prereqJson) as string[];
    } catch {
      /* noop */
    }
    return {
      id: n.id,
      job: n.job as "낚시" | "채집" | "요리",
      name: n.name,
      rarity: n.rarity,
      cost: n.cost,
      prereq,
      row: n.row,
      col: n.col,
      description: n.description,
    };
  });
  const lifeTab = (
    <LifeSkillPanel life={life} isOwn={isOwn} cookingRecipes={cookingRecipes} treeNodes={treeNodes} />
  );

  const achTab = (
    <AchievementBook
      achievements={achView}
      isOwn={isOwn}
      equippedTitle={profile.equippedTitle}
      equippedBadge={profile.equippedBadge}
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
    </div>
  );
}
