import "server-only";

import { prisma } from "@/lib/prisma";

// 활동 로그 — 대사·제작·채집 등 캐릭터가 한 일을 영구 보관한다.
// 월드 채팅(WorldMessage)은 24시간 뒤 지워지므로, 서버 기록으로 남겨야 할 것은 여기로 온다.
//
// 원칙: 기록 실패가 게임 진행을 막으면 안 된다. 호출부는 await 하되,
// 여기서 예외를 삼켜 게임 진행과 채팅 응답을 보호한다.

export const ACTIVITY_KINDS = [
  "대사",
  "제작",
  "강화",
  "채집",
  "낚시",
  "채광",
  "요리",
  "연금",
  "거래",
  "던전",
  "이동",
  "시스템",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityLogInput = {
  userId?: string | null;
  actorName?: string | null;
  locationId?: string | null;
  kind?: ActivityKind;
  content: string;
  meta?: Record<string, unknown> | null;
};

const CONTENT_MAX = 500;

export async function logActivity(input: ActivityLogInput): Promise<void> {
  const content = input.content.trim();
  if (!content) return;

  try {
    await prisma.activityLog.create({
      data: {
        userId: input.userId ?? null,
        actorName: input.actorName ?? null,
        locationId: input.locationId ?? null,
        kind: input.kind ?? "시스템",
        content: content.slice(0, CONTENT_MAX),
        metaJson: input.meta ? JSON.stringify(input.meta) : null,
      },
    });
  } catch {
    // 로그가 안 남는다고 플레이가 막히면 안 된다.
  }
}
