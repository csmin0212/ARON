"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { fetchWorldRows, regenFatigue } from "@/lib/world";
import { fetchItemsRows, fetchActionsRows, fetchDungeonsRows } from "@/lib/gamedata";
import { postSystem } from "@/lib/play";
import type { ActionRow } from "@/lib/gamedata";
import { lifeSkillKindOf, type LifeSkillKind } from "@/lib/lifeSkillData";

export type WorldActionState = { error?: string; ok?: string } | undefined;
export type WorldCleanupState = { error?: string; ok?: string } | undefined;

// 현재 피로도 계산 (lazy 자연 회복)
function freshAp(ap: number | null, apResetAt: Date | null): { ap: number; apResetAt: Date } {
  const r = regenFatigue(ap, apResetAt);
  return { ap: r.value, apResetAt: r.at };
}

function actionKey(action: Pick<ActionRow, "locationId" | "kind" | "label">): string {
  return `${action.locationId}::${action.label ?? action.kind}`.replace(/\s+/g, "");
}

function hasLifeAction(
  existing: ActionRow[],
  locationId: string,
  kind: LifeSkillKind,
): boolean {
  return existing.some(
    (action) =>
      action.locationId === locationId && lifeSkillKindOf(action.kind, action.label) === kind,
  );
}

function autoLifeActions(
  rows: Awaited<ReturnType<typeof fetchWorldRows>>,
  existing: ActionRow[],
): ActionRow[] {
  const seen = new Set(existing.map(actionKey));
  const actions: ActionRow[] = [];
  for (const row of rows) {
    const candidates: ActionRow[] = [];
    if (row.life?.gather?.enabled && !hasLifeAction(existing, row.id, "채집")) {
      candidates.push({
        locationId: row.id,
        kind: "채집",
        label: "채집",
        apCost: 1,
        statLabel: null,
        dc: null,
        drops: [{ item: "꽝", qty: 1, gold: 0, weight: 1 }],
        failText: null,
      });
    }
    if (row.life?.fish?.enabled && !hasLifeAction(existing, row.id, "낚시")) {
      candidates.push({
        locationId: row.id,
        kind: "낚시",
        label: "낚시",
        apCost: 1,
        statLabel: null,
        dc: null,
        drops: [{ item: "꽝", qty: 1, gold: 0, weight: 1 }],
        failText: null,
      });
    }
    for (const action of candidates) {
      const key = actionKey(action);
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
  }
  return actions;
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
  // 일반 이동으로 균열을 벗어나면 멤버십 해제
  await prisma.riftMember.deleteMany({ where: { userId: user.id } });
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
  void _prev;
  void _formData;
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
        lifeJson: r.life ? JSON.stringify(r.life) : null,
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
      itemIds = new Set(items.flatMap((it) => [it.id, it.name]));
      parts.push(`아이템 ${items.length}종`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "아이템 탭 오류");
  }

  // 3) 행동 (선택 — 아이템 도감 기준으로 드랍 검증)
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true, name: true } });
      itemIds = new Set(existing.flatMap((it) => [it.id, it.name]));
    }
    const sheetActions = (await fetchActionsRows(itemIds)) ?? [];
    const actions = [...sheetActions, ...autoLifeActions(rows, sheetActions)];
    if (actions.length > 0) {
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

  // 4) 던전 (선택)
  try {
    if (!itemIds) {
      const existing = await prisma.item.findMany({ select: { id: true, name: true } });
      itemIds = new Set(existing.flatMap((it) => [it.id, it.name]));
    }
    const dungeons = await fetchDungeonsRows(itemIds);
    if (dungeons) {
      const locIds = new Set(rows.map((r) => r.id));
      const valid = dungeons.filter((d) => locIds.has(d.locationId));
      const skipped = dungeons.length - valid.length;
      await prisma.$transaction([
        prisma.dungeon.deleteMany(),
        prisma.dungeon.createMany({
          data: valid.map((d, i) => ({
            id: d.id,
            name: d.name,
            locationId: d.locationId,
            dc: d.dc,
            exp: d.exp,
            expMax: d.expMax,
            dropsJson: JSON.stringify(d.drops),
            floor: d.floor,
            order: i,
          })),
        }),
      ]);
      parts.push(`던전 ${valid.length}개`);
      if (skipped > 0) warns.push(`던전 ${skipped}개는 장소가 맵에 없어 건너뜀`);
    }
  } catch (e) {
    warns.push(e instanceof Error ? e.message : "던전 탭 오류");
  }

  revalidatePath("/world");
  const okMsg = `동기화 완료 — ${parts.join(" · ")}`;
  return warns.length > 0 ? { ok: okMsg, error: `⚠ ${warns.join(" / ")}` } : { ok: okMsg };
}

export async function cleanupOldWorldMessages(
  _prev: WorldCleanupState,
  _formData: FormData,
): Promise<WorldCleanupState> {
  void _prev;
  void _formData;
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
