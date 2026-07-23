import { getSessionUid } from "@/lib/auth";
import { getLocationPeople, getUserWorldState } from "@/lib/worldCache";

export type PresencePerson = {
  username: string;
  nickname: string;
  avatar: string | null;
  isMe: boolean;
};

// 현재 위치에 있는 모험가 목록 (실시간 폴링용)
// JWT 검증 + 캐시만 사용 — 평상시 DB 를 치지 않는다. isMe 만 uid 로 계산.
export async function GET() {
  const uid = await getSessionUid();
  if (!uid) return Response.json({ people: [] });

  const state = await getUserWorldState(uid);
  if (!state.locationId) return Response.json({ people: [] });

  const rows = await getLocationPeople(state.locationId);
  const people: PresencePerson[] = rows.map((r) => ({
    username: r.username,
    nickname: r.nickname,
    avatar: r.avatar,
    isMe: r.userId === uid,
  }));

  return Response.json({ people });
}
