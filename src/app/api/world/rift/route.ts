import { getSessionUid } from "@/lib/auth";
import { getUserWorldState, resolveRiftContext } from "@/lib/worldCache";

// 타입은 캐시 계층에 있고, 기존 임포트 경로 호환을 위해 여기서 다시 내보낸다.
export type { RiftContext, RiftPerson } from "@/lib/worldCache";

// 균열 상태 (실시간 폴링용) — JWT 검증 + 캐시만 사용해 평상시 DB 를 치지 않는다.
export async function GET(): Promise<Response> {
  const uid = await getSessionUid();
  if (!uid) return Response.json({ mode: "none" });

  const state = await getUserWorldState(uid);
  return Response.json(await resolveRiftContext(uid, state.locationId));
}
