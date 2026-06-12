import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runActionCommand, tryKeywordSpeech } from "@/lib/play";

// 장소 채팅 — 자신이 있는 장소의, "진입 이후" 채팅만 읽고 쓸 수 있다.
// "/명령" 은 장소 행동 실행, 일반 발화는 히든 키워드와 일치 시 발견 시도.

export type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  system: boolean;
  user: { username: string; nickname: string; avatar: string | null } | null;
  charName: string | null;
};

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

type RawMsg = {
  id: number;
  content: string;
  createdAt: Date;
  system: boolean;
  user: {
    username: string;
    nickname: string;
    avatar: string | null;
    sheet: { sheetTab: string } | null;
  } | null;
};

function serialize(m: RawMsg): ChatMessage {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    system: m.system,
    user: m.user
      ? { username: m.user.username, nickname: m.user.nickname, avatar: m.user.avatar }
      : null,
    charName: m.user?.sheet?.sheetTab ?? null,
  };
}

// GET /api/world/chat?after=<id> — 내 위치의, 내 진입 이후 메시지
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true, enteredAt: true },
  });
  if (!sheet?.locationId) return Response.json({ messages: [] });

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const since = sheet.enteredAt ?? new Date(0);

  const rows = await prisma.worldMessage.findMany({
    where: {
      locationId: sheet.locationId,
      createdAt: { gte: since },
      ...(after ? { id: { gt: after } } : {}),
    },
    orderBy: { id: "asc" },
    take: 200,
    include: MSG_INCLUDE,
  });

  return Response.json({ messages: rows.map(serialize) });
}

// POST /api/world/chat  { content } — 발화 / "/명령"
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId)
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

  // "/명령" — 장소 행동
  if (content.startsWith("/")) {
    const command = content.slice(1).trim();
    if (!command) return Response.json({ error: "명령을 입력해주세요. (예: /낚시)" }, { status: 400 });
    const r = await runActionCommand(user.id, user.nickname, sheet, command);
    if (r.error) return Response.json({ error: r.error }, { status: 400 });
    return Response.json({ ok: true }); // 결과는 시스템 메시지로 — 클라이언트가 폴링으로 수신
  }

  // 일반 발화 — 저장 후 키워드 발동 검사
  const msg = await prisma.worldMessage.create({
    data: { locationId: sheet.locationId, userId: user.id, content },
    include: MSG_INCLUDE,
  });
  const kw = await tryKeywordSpeech(user.id, user.nickname, sheet, content);

  return Response.json({ message: serialize(msg), notice: kw.notice ?? null });
}
