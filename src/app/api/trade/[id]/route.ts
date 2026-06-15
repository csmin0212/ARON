import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatFullDate } from "@/lib/format";
import type { TradeSideItem } from "@/app/actions/trade";

function parseTradeItems(value: string | null | undefined): TradeSideItem[] {
  try {
    const parsed = value ? (JSON.parse(value) as TradeSideItem[]) : [];
    return parsed.filter((item) => item.name && item.qty > 0);
  } catch {
    return [];
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  if (!trade) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (trade.fromUserId !== me.id && trade.toUserId !== me.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: trade.status,
    fromSide: {
      userId: trade.fromUser.id,
      nickname: trade.fromUser.nickname,
      username: trade.fromUser.username,
      items: parseTradeItems(trade.fromOfferJson),
      gold: trade.fromGold,
      confirmed: trade.fromConfirmed,
    },
    toSide: {
      userId: trade.toUser.id,
      nickname: trade.toUser.nickname,
      username: trade.toUser.username,
      items: parseTradeItems(trade.toOfferJson),
      gold: trade.toGold,
      confirmed: trade.toConfirmed,
    },
    messages: trade.messages.map((message) => ({
      id: message.id,
      nickname: message.user?.nickname ?? null,
      content: message.content,
      system: message.system,
      createdAt: formatFullDate(message.createdAt),
    })),
  });
}
