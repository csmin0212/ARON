import { getSessionUid } from "@/lib/auth";
import {
  getLocationPeople,
  getRecentMessages,
  getUserWorldState,
  resolveRiftContext,
  type RiftContext,
} from "@/lib/worldCache";
import type { ChatMessage } from "@/app/api/world/chat/route";
import type { PresencePerson } from "@/app/api/world/presence/route";

export type WorldSyncPayload = {
  messages: ChatMessage[];
  people: PresencePerson[];
  rift: RiftContext;
};

const EMPTY: WorldSyncPayload = { messages: [], people: [], rift: { mode: "none" } };

// 통합 폴링 엔드포인트 — 채팅·접속자·균열을 한 번에 돌려준다.
// 폴링 요청 수를 1/3 로 줄이고, 전부 캐시 계층을 쓰므로 평상시 DB 조회가 없다.
export async function GET(req: Request): Promise<Response> {
  const uid = await getSessionUid();
  if (!uid) return Response.json(EMPTY);

  const state = await getUserWorldState(uid);
  if (!state.locationId) return Response.json(EMPTY);

  const after = Number(new URL(req.url).searchParams.get("after") ?? 0);

  const [cached, people, rift] = await Promise.all([
    getRecentMessages(state.locationId),
    getLocationPeople(state.locationId),
    resolveRiftContext(uid, state.locationId),
  ]);

  const messages: ChatMessage[] = cached
    .filter((m) => m.createdAtMs >= state.enteredAtMs && (!after || m.id > after))
    .map((m) => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt,
      system: m.system,
      user: m.user,
    }));

  return Response.json({
    messages,
    people: people.map((p) => ({
      username: p.username,
      nickname: p.nickname,
      avatar: p.avatar,
      isMe: p.userId === uid,
    })),
    rift,
  } satisfies WorldSyncPayload);
}
