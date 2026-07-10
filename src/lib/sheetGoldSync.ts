import "server-only";

import { prisma } from "@/lib/prisma";
import { syncSheetGold } from "@/lib/googleSheets";

const GOLD_SYNC_KIND = "gold";
const GOLD_SYNC_DELAY_MS = 10_000;
const GOLD_SYNC_LIMIT = 20;

const localTimers = new Map<string, ReturnType<typeof setTimeout>>();

function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

function scheduleLocalGoldSync(userId: string, delayMs: number): void {
  const existing = localTimers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    localTimers.delete(userId);
    void processDueSheetGoldSyncs({ forceUserId: userId, limit: 1 });
  }, Math.max(0, delayMs) + 250);

  timer.unref?.();
  localTimers.set(userId, timer);
}

export async function enqueueSheetGoldSync(
  userId: string,
  opts: { delayMs?: number } = {},
): Promise<boolean> {
  const delayMs = opts.delayMs ?? GOLD_SYNC_DELAY_MS;
  const dueAt = new Date(Date.now() + Math.max(0, delayMs));
  try {
    await prisma.sheetSyncJob.upsert({
      where: { userId_kind: { userId, kind: GOLD_SYNC_KIND } },
      create: {
        userId,
        kind: GOLD_SYNC_KIND,
        status: "pending",
        dueAt,
      },
      update: {
        status: "pending",
        dueAt,
        lastError: null,
        lockedAt: null,
      },
    });
    scheduleLocalGoldSync(userId, delayMs);
    return true;
  } catch (error) {
    console.warn("Failed to enqueue sheet gold sync", error);
    return false;
  }
}

export async function processDueSheetGoldSyncs(
  opts: { limit?: number; forceUserId?: string } = {},
): Promise<{ processed: number; failed: number; skipped: number }> {
  const now = new Date();
  const jobs = await prisma.sheetSyncJob.findMany({
    where: opts.forceUserId
      ? { userId: opts.forceUserId, kind: GOLD_SYNC_KIND }
      : { kind: GOLD_SYNC_KIND, status: "pending", dueAt: { lte: now } },
    orderBy: { dueAt: "asc" },
    take: opts.limit ?? GOLD_SYNC_LIMIT,
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      await prisma.sheetSyncJob.update({
        where: { id: job.id },
        data: { status: "processing", lockedAt: new Date() },
      });

      const sheet = await prisma.characterSheet.findUnique({
        where: { userId: job.userId },
        select: { sheetTab: true, curGold: true },
      });

      if (!sheet?.sheetTab || sheet.curGold == null) {
        await prisma.sheetSyncJob.delete({ where: { id: job.id } });
        skipped += 1;
        continue;
      }

      const ok = await syncSheetGold(sheet.sheetTab, sheet.curGold);
      if (!ok) throw new Error("sheet gold write failed");

      await prisma.sheetSyncJob.delete({ where: { id: job.id } });
      processed += 1;
    } catch (error) {
      failed += 1;
      const attempts = job.attempts + 1;
      const delayMs = backoffMs(attempts);
      await prisma.sheetSyncJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          attempts,
          dueAt: new Date(Date.now() + delayMs),
          lastError: error instanceof Error ? error.message : String(error),
          lockedAt: null,
        },
      });
      scheduleLocalGoldSync(job.userId, delayMs);
    }
  }

  return { processed, failed, skipped };
}
