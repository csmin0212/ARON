"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { AP_MAX, MOVE_COST, currentResetBoundary, fetchWorldRows } from "@/lib/world";

export type WorldActionState = { error?: string; ok?: string } | undefined;

// 현재 행동치 계산 (회복 시점 지났으면 가득 채워서 반환)
function freshAp(ap: number | null, apResetAt: Date | null): { ap: number; apResetAt: Date } {
  if (!apResetAt || apResetAt < currentResetBoundary()) {
    return { ap: AP_MAX, apResetAt: new Date() };
  }
  return { ap: ap ?? AP_MAX, apResetAt };
}

// 월드 입장 — 시작 장소로 배치
export async function enterWorld(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet) return;

  const start = await prisma.location.findFirst({ where: { isStart: true } });
  if (!start) return;

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: start.id, ap, apResetAt },
  });
  revalidatePath("/world");
}

// 이동 — 연결된 장소로만, 행동치 소모
export async function moveTo(formData: FormData): Promise<void> {
  const target = String(formData.get("target") ?? "").trim();
  if (!target) return;

  const user = await getCurrentUser();
  if (!user) return;

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return;

  const [here, dest] = await Promise.all([
    prisma.location.findUnique({ where: { id: sheet.locationId } }),
    prisma.location.findUnique({ where: { id: target } }),
  ]);
  if (!here || !dest) return;

  // 연결 검증
  let conns: string[] = [];
  try {
    conns = here.connJson ? (JSON.parse(here.connJson) as string[]) : [];
  } catch {
    conns = [];
  }
  if (!conns.includes(target)) return;

  // 히든 장소는 발견한 경우에만 (발견 시스템은 C단계 — 지금은 차단)
  if (dest.hidden) {
    let discovered: string[] = [];
    try {
      discovered = sheet.discoveredJson ? (JSON.parse(sheet.discoveredJson) as string[]) : [];
    } catch {
      discovered = [];
    }
    if (!discovered.includes(target)) return;
  }

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < MOVE_COST) return; // UI에서 비활성화되지만 이중 방어

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: target, ap: ap - MOVE_COST, apResetAt },
  });
  revalidatePath("/world");
}

// 맵 동기화 — GM 전용. 시트 "맵" 탭 → Location 테이블 교체
export async function syncWorldMap(
  _prev: WorldActionState,
  _formData: FormData,
): Promise<WorldActionState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  let rows;
  try {
    rows = await fetchWorldRows();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "맵을 불러오지 못했어요." };
  }

  await prisma.$transaction([
    prisma.location.deleteMany(),
    prisma.location.createMany({
      data: rows.map((r, i) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        desc: r.desc,
        image: r.image,
        connJson: JSON.stringify(r.conns),
        hidden: r.hidden,
        isStart: r.isStart,
        order: i,
      })),
    }),
  ]);

  revalidatePath("/world");
  return { ok: `맵 동기화 완료 — 장소 ${rows.length}곳` };
}
