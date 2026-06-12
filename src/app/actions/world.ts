"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { AP_MAX, currentResetBoundary, fetchWorldRows } from "@/lib/world";
import { fetchItemsRows, fetchActionsRows } from "@/lib/gamedata";
import { postSystem } from "@/lib/play";

export type WorldActionState = { error?: string; ok?: string } | undefined;
export type WorldCleanupState = { error?: string; ok?: string } | undefined;

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
    data: { locationId: start.id, enteredAt: new Date(), ap, apResetAt },
  });
  await postSystem(start.id, `🌟 ${user.nickname}님이 월드에 입장하셨습니다!`);
  revalidatePath("/world");
}

// 이동 — 연결된 장소로만. 행동치 소모 없음(행동치는 채집·전투 등 행동 전용)
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

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: target, enteredAt: new Date() },
  });
  // 퇴장/입장 알림 (목적지는 노출하지 않음 — 히든 보호)
  await Promise.all([
    postSystem(here.id, `📤 ${user.nickname}님이 자리를 떠났습니다.`),
    postSystem(dest.id, `📥 ${user.nickname}님이 입장하셨습니다!`),
  ]);
  revalidatePath("/world");
}

// 시트 동기화 — GM 전용. 맵(필수) + 아이템/행동(선택) 탭 → DB 교체
export async function syncWorldMap(
  _prev: WorldActionState,
  _formData: FormData,
): Promise<WorldActionState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  // 1) 맵 (필수)
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
        keyword: r.keyword,
        cond: r.cond,
        isStart: r.isStart,
        order: i,
      })),
    }),
  ]);

  const parts: string[] = [`장소 ${rows.length}곳`];
  const warns: string[] = [];

  // 2) 아이템 (선택 — 실패해도 맵 동기화는 유지)
  let itemIds: Set<string> | null = null;
  try {
    const items = await fetchItemsRows();
    if (items) {
      await prisma.$transaction([
        prisma.item.deleteMany(),
        prisma.item.createMany({
          data: items.map((it, i) => ({ ...it, order: i })),
        }),
      ]);
      itemIds = new Set(items.map((it) => it.id));
      parts.push(`아이템 ${items.length}종`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "아이템 탭 오류");
  }

  // 3) 행동 (선택 — 아이템 도감 기준으로 드랍 검증)
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true } });
      itemIds = new Set(existing.map((it) => it.id));
    }
    const actions = await fetchActionsRows(itemIds);
    if (actions) {
      const locIds = new Set(rows.map((r) => r.id));
      for (const a of actions) {
        if (!locIds.has(a.locationId))
          throw new Error(`행동의 장소ID '${a.locationId}' 가 맵에 없어요.`);
      }
      await prisma.$transaction([
        prisma.locationAction.deleteMany(),
        prisma.locationAction.createMany({
          data: actions.map((a, i) => ({
            locationId: a.locationId,
            kind: a.kind,
            label: a.label,
            apCost: a.apCost,
            statLabel: a.statLabel,
            dc: a.dc,
            dropsJson: JSON.stringify(a.drops),
            failText: a.failText,
            order: i,
          })),
        }),
      ]);
      parts.push(`행동 ${actions.length}개`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "행동 탭 오류");
  }

  revalidatePath("/world");
  const okMsg = `동기화 완료 — ${parts.join(" · ")}`;
  return warns.length > 0 ? { ok: okMsg, error: `⚠ ${warns.join(" / ")}` } : { ok: okMsg };
}

export async function cleanupOldWorldMessages(
  _prev: WorldCleanupState,
  _formData: FormData,
): Promise<WorldCleanupState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const result = await prisma.worldMessage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  revalidatePath("/world");
  return { ok: `90일 지난 월드 채팅 ${result.count.toLocaleString("ko-KR")}개를 정리했어요.` };
}
