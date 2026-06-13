import "server-only";

import { prisma } from "@/lib/prisma";
import { pushInventoryToSheet, type SheetInventory } from "@/lib/googleSheets";

function parseInv(value: string | null): SheetInventory {
  try {
    if (value) return JSON.parse(value) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

// DB(invJson·curGold) 기준으로 캐릭터 시트 휴대품을 시트에 반영.
// dirty 판정: 마지막 시트 반영(syncedAt) 이후 변경(updatedAt)이 있을 때만 — force로 무시 가능.
export async function pushInventoryForUser(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; skipped?: boolean }> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { sheetTab: true, invJson: true, curGold: true, syncedAt: true, updatedAt: true },
  });
  if (!sheet?.sheetTab) return { ok: false };

  if (!opts.force && sheet.syncedAt && sheet.updatedAt <= sheet.syncedAt) {
    return { ok: true, skipped: true };
  }

  const inv = parseInv(sheet.invJson);
  if (sheet.curGold != null) inv.gold = `${sheet.curGold}G`;

  const ok = await pushInventoryToSheet(sheet.sheetTab, inv);
  if (ok) {
    await prisma.characterSheet.update({
      where: { userId },
      data: { syncedAt: new Date() },
    });
  }
  return { ok };
}
