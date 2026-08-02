import { prisma } from "@/lib/prisma";
import { getCurrentUser, getSessionUid } from "@/lib/auth";
import {
  getRecentMessages,
  getUserWorldState,
  invalidateWorldMessages,
} from "@/lib/worldCache";
import { runActionCommand } from "@/lib/play";
import { logActivity } from "@/lib/activityLog";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { activeDisplayPersona, displaySnapshot, profileHrefForPersonaSnapshot } from "@/lib/gmNpc";

export type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  system: boolean;
  kind: string | null;
  user: { username: string; nickname: string; avatar: string | null; profileHref?: string | null } | null;
};

const MSG_INCLUDE = {
  user: {
    select: {
      username: true,
      nickname: true,
      avatar: true,
      gmNpcPersonasJson: true,
      activeNpcPersonaKey: true,
    },
  },
} as const;

type RawMsg = {
  id: number;
  content: string;
  createdAt: Date;
  system: boolean;
  kind: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  user: {
    username: string;
    nickname: string;
    avatar: string | null;
    gmNpcPersonasJson?: string | null;
    activeNpcPersonaKey?: string | null;
  } | null;
};

function serialize(m: RawMsg): ChatMessage {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    system: m.system,
    kind: m.kind,
    user: m.user
      ? {
          username: m.user.username,
          nickname: m.authorName ?? m.user.nickname,
          avatar: m.authorAvatar ?? m.user.avatar,
          profileHref: profileHrefForPersonaSnapshot(m.user, {
            authorName: m.authorName,
            authorAvatar: m.authorAvatar,
          }),
        }
      : null,
  };
}

export async function GET(req: Request) {
  // 폴링 핫패스 — JWT 검증 + 캐시만 사용해 평상시 DB 를 치지 않는다 (egress 절감).
  const uid = await getSessionUid();
  if (!uid) return Response.json({ error: "unauthorized" }, { status: 401 });

  const state = await getUserWorldState(uid);
  if (!state.locationId) return Response.json({ messages: [] });

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const cached = await getRecentMessages(state.locationId);
  const messages: ChatMessage[] = cached
    .filter((m) => m.createdAtMs >= state.enteredAtMs && (!after || m.id > after))
    .map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      system: m.system,
      kind: m.kind,
      user: m.user,
    }));

  return Response.json({ messages });
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

    const persona = activeDisplayPersona(user);
    const result = await runActionCommand(user.id, persona.name, sheet, command);
    if (result.error) return Response.json({ error: result.error }, { status: 400 });
    // 행동 로그(시스템 메시지)가 쌓였으니 이 장소 캐시를 즉시 갱신
    invalidateWorldMessages(sheet.locationId);
    return Response.json({ ok: true, refresh: true });
  }

  const msg = await prisma.worldMessage.create({
    data: { locationId: sheet.locationId, userId: user.id, content, ...displaySnapshot(user) },
    include: MSG_INCLUDE,
  });
  // 채팅은 24시간 뒤 지워지므로 대사는 활동 로그에 따로 남긴다.
  await logActivity({
    userId: user.id,
    actorName: activeDisplayPersona(user).name,
    locationId: sheet.locationId,
    kind: "대사",
    content,
  });
  invalidateWorldMessages(sheet.locationId);
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
