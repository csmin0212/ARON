import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatFullDate } from "@/lib/format";
import type { SheetInventory } from "@/lib/googleSheets";
import TradeRoom from "@/components/TradeRoom";
import type { TradeSideItem, TradeSource } from "@/app/actions/trade";
import { parseLifeState } from "@/lib/lifeSkillPerks";

export const metadata: Metadata = { title: "거래방 · 아리안로드 온라인 갤러리" };

function parseInv(value: string | null | undefined): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

function parseTradeItems(value: string | null | undefined): TradeSideItem[] {
  try {
    const parsed = value ? (JSON.parse(value) as TradeSideItem[]) : [];
    return parsed.filter((item) => item.name && item.qty > 0);
  } catch {
    return [];
  }
}

type OfferableItem = {
  name: string;
  qty: number;
  effect?: string | null;
  weight?: number | null;
  source: TradeSource;
};

function offerableItems(
  invJson: string | null | undefined,
  lifeJson: string | null | undefined,
): OfferableItem[] {
  const out: OfferableItem[] = [];

  // 기본 가방
  const inv = parseInv(invJson);
  const byName = new Map<string, OfferableItem>();
  for (const item of inv.items) {
    if (!item.name || item.qty <= 0) continue;
    const key = `${item.name}\u0000${item.effect ?? ""}\u0000${item.weight ?? ""}`;
    const existing = byName.get(key);
    if (existing) existing.qty += item.qty;
    else byName.set(key, { name: item.name, qty: item.qty, effect: item.effect, weight: item.weight, source: "basic" });
  }
  out.push(...[...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "ko")));

  // 생활 가방 (낚시 · 채집 · 채광)
  const life = parseLifeState(lifeJson);
  for (const kind of ["낚시", "채집", "채광"] as const) {
    const items = life.bags[kind].items
      .filter((it) => it.qty > 0)
      .map((it) => ({
        name: it.name,
        qty: it.qty,
        effect: `R${it.rank} · ${it.text}`,
        weight: it.weight,
        source: kind,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
    out.push(...items);
  }

  return out;
}

export default async function TradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");

  const { id } = await params;
  const trade = await prisma.tradeOffer.findUnique({
    where: { id },
    include: {
      fromUser: { select: { id: true, username: true, nickname: true } },
      toUser: { select: { id: true, username: true, nickname: true } },
      messages: {
        include: { user: { select: { nickname: true } } },
        orderBy: { createdAt: "asc" },
        take: 100,
      },
    },
  });
  if (!trade) notFound();
  if (trade.fromUserId !== me.id && trade.toUserId !== me.id) notFound();

  const mySheet = await prisma.characterSheet.findUnique({
    where: { userId: me.id },
    select: { invJson: true, lifeJson: true, curGold: true },
  });

  return (
    <TradeRoom
      tradeId={trade.id}
      status={trade.status}
      currentUserId={me.id}
      currentGold={mySheet?.curGold ?? 0}
      offerableItems={offerableItems(mySheet?.invJson, mySheet?.lifeJson)}
      fromSide={{
        userId: trade.fromUser.id,
        nickname: trade.fromUser.nickname,
        username: trade.fromUser.username,
        items: parseTradeItems(trade.fromOfferJson),
        gold: trade.fromGold,
        confirmed: trade.fromConfirmed,
      }}
      toSide={{
        userId: trade.toUser.id,
        nickname: trade.toUser.nickname,
        username: trade.toUser.username,
        items: parseTradeItems(trade.toOfferJson),
        gold: trade.toGold,
        confirmed: trade.toConfirmed,
      }}
      messages={trade.messages.map((message) => ({
        id: message.id,
        nickname: message.user?.nickname ?? null,
        content: message.content,
        system: message.system,
        createdAt: formatFullDate(message.createdAt),
      }))}
    />
  );
}
