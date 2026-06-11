import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// 장소 채팅 — 자신이 있는 장소의 채팅만 읽고 쓸 수 있다.

export type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  user: { username: string; nickname: string; avatar: string | null };
  charName: string | null;
};

async function myLocation(userId: string): Promise<string | null> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { locationId: true },
  });
  return sheet?.locationId ?? null;
}

function serialize(
  m: {
    id: number;
    content: string;
    createdAt: Date;
    user: {
      username: string;
      nickname: string;
      avatar: string | null;
      sheet: { sheetTab: string } | null;
    };
  },
): ChatMessage {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    user: {
      username: m.user.username,
      nickname: m.user.nickname,
      avatar: m.user.avatar,
    },
    charName: m.user.sheet?.sheetTab ?? null,
  };
}

const MSG_INCLUDE = {
  user: {
    select: {
      username: true,
      nickname: true,
      avatar: true,
      sheet: { select: { sheetTab: true } },
    },
  },
} as const;

// GET /api/world/chat?after=<id>  → 내 위치의 메시지 (after 이후만, 없으면 최근 50개)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const locationId = await myLocation(user.id);
  if (!locationId) return Response.json({ messages: [] });

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);

  const rows = after
    ? await prisma.worldMessage.findMany({
        where: { locationId, id: { gt: after } },
        orderBy: { id: "asc" },
        take: 100,
        include: MSG_INCLUDE,
      })
    : (
        await prisma.worldMessage.findMany({
          where: { locationId },
          orderBy: { id: "desc" },
          take: 50,
          include: MSG_INCLUDE,
        })
      ).reverse();

  return Response.json({ messages: rows.map(serialize) });
}

// POST /api/world/chat  { content }  → 내 위치에 메시지 전송
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const locationId = await myLocation(user.id);
  if (!locationId)
    return Response.json({ error: "월드에 입장한 상태에서만 채팅할 수 있어요." }, { status: 400 });

  let content = "";
  try {
    const body = (await req.json()) as { content?: string };
    content = String(body.content ?? "").trim();
  } catch {
    /* fallthrough */
  }
  if (!content) return Response.json({ error: "내용을 입력해주세요." }, { status: 400 });
  if (content.length > 500)
    return Response.json({ error: "메시지는 500자 이하로 입력해주세요." }, { status: 400 });

  const msg = await prisma.worldMessage.create({
    data: { locationId, userId: user.id, content },
    include: MSG_INCLUDE,
  });

  return Response.json({ message: serialize(msg) });
}
