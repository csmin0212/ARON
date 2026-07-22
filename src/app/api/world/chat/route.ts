import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runActionCommand } from "@/lib/play";
import { bumpStat, checkAndGrant } from "@/lib/achievements";

export type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  system: boolean;
  user: { username: string; nickname: string; avatar: string | null } | null;
};

const MSG_INCLUDE = {
  user: {
    select: {
      username: true,
      nickname: true,
      avatar: true,
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
  };
}

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
    take: 60,
    include: MSG_INCLUDE,
  });

  return Response.json({ messages: rows.map(serialize) });
}

// 월드 로그(WorldMessage) 무한 증가 방지 — 가끔 오래된 메시지를 정리한다.
// 채팅 조회는 '입장 이후'만 읽으므로 하루 지난 로그를 지워도 활성 세션에 영향 없다.
const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
function maybeTrimOldMessages() {
  if (Math.random() >= 0.04) return; // ~25건당 1회
  const cutoff = new Date(Date.now() - CHAT_RETENTION_MS);
  void prisma.worldMessage.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => {});
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId)
    return Response.json({ error: "월드에 입장한 상태에서만 채팅할 수 있어요." }, { status: 400 });

  maybeTrimOldMessages();

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

  if (content.startsWith("/")) {
    const command = content.slice(1).trim();
    if (!command)
      return Response.json({ error: "명령을 입력해주세요. (예: /낚시)" }, { status: 400 });

    const result = await runActionCommand(user.id, user.nickname, sheet, command);
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true, refresh: true });
  }

  const msg = await prisma.worldMessage.create({
    data: { locationId: sheet.locationId, userId: user.id, content },
    include: MSG_INCLUDE,
  });
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { achStatsJson: bumpStat(sheet.achStatsJson, "월드채팅횟수") },
  });
  void checkAndGrant(user.id);

  return Response.json({
    message: serialize(msg),
    notice: null,
    refresh: false,
  });
}
