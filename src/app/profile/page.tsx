import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import { MASTER_SHEET_URL } from "@/lib/charsheet";
import ProfileForm from "@/components/forms/ProfileForm";
import SheetLinkForm from "@/components/forms/SheetLinkForm";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import ProfileHero from "@/components/ProfileHero";
import ProfileTradePanel, { type TradeOfferView } from "@/components/ProfileTradePanel";
import { checkAndGrant } from "@/lib/achievements";
import type { SheetInventory } from "@/lib/googleSheets";

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

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  await checkAndGrant(user.id); // 임계값 업적 지연 판정
  const [counts, sheet, incomingRows, outgoingRows] = await Promise.all([
    prisma.post.count({ where: { authorId: user.id } }),
    prisma.characterSheet.findUnique({ where: { userId: user.id } }),
    prisma.tradeOffer.findMany({
      where: { toUserId: user.id, status: "PENDING" },
      include: {
        fromUser: { select: { nickname: true, username: true } },
        toUser: { select: { nickname: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.tradeOffer.findMany({
      where: { fromUserId: user.id, status: "PENDING" },
      include: {
        fromUser: { select: { nickname: true, username: true } },
        toUser: { select: { nickname: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

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

      {/* 캐릭터 시트 */}
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

      <ProfileTradePanel
        targetUserId={user.id}
        targetNickname={user.nickname}
        isOwn
        offerableItems={parseOfferableItems(sheet?.invJson)}
        incoming={incomingRows.map(tradeView)}
        outgoing={outgoingRows.map(tradeView)}
      />

      {/* 프로필 편집 */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-extrabold text-content">프로필 편집</h2>
        <ProfileForm
          initialNickname={user.nickname}
          initialAvatar={user.avatar}
          initialStatus={user.profileStatus}
          initialColor={user.profileColor}
          initialCover={user.profileCover}
        />
      </div>
    </div>
  );
}
