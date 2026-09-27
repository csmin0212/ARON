import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant } from "@/lib/achievements";
import { getUserWorldState } from "@/lib/worldCache";
import { profileHrefForPersonaSnapshot } from "@/lib/gmNpc";
import type { ChatMessage } from "@/app/api/world/chat/route";

// 한 번에 내보낼 최대 줄 수. 월드 로그는 24시간 뒤 정리되므로 사실상 그 안의 전부다.
const LOG_LIMIT = 2000;

// 로그 저장 — 예전에는 클라이언트가 들고 있는 메시지를 그대로 내보냈다.
// 그런데 화면용 캐시가 월드+시스템 합쳐 60줄이라, 저장본도 60줄에서 잘리고
// 대화가 시스템 메시지에 밀려 몇 줄 안 남는 일이 있었다.
// 이제 여기서 입장 이후 기록을 전부 다시 읽어 돌려준다.
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const state = await getUserWorldState(user.id);
  if (!state.locationId) return Response.json({ ok: true, messages: [] });

  const rows = await prisma.worldMessage.findMany({
    where: {
      locationId: state.locationId,
      createdAt: { gte: new Date(state.enteredAtMs) },
    },
    orderBy: { id: "asc" },
    take: LOG_LIMIT,
    select: {
      id: true,
      content: true,
      createdAt: true,
      system: true,
      kind: true,
      authorName: true,
      authorAvatar: true,
      user: {
        select: {
          username: true,
          nickname: true,
          avatar: true,
          gmNpcPersonasJson: true,
          activeNpcPersonaKey: true,
        },
      },
    },
  });

  const messages: ChatMessage[] = rows.map((m) => ({
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
  }));

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { achStatsJson: true },
  });
  if (sheet) {
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { achStatsJson: bumpStat(sheet.achStatsJson, "로그저장횟수") },
    });
    void checkAndGrant(user.id);
  }
  return Response.json({ ok: true, messages });
}
