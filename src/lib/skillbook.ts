import "server-only";

import { prisma } from "./prisma";

// 서버가 정상 지급한 스킬북만 기록하는 토큰.
// InventoryEntry.meta 가 null 인 항목만 시트 동기화가 갱신/삭제하므로(charsheet.ts),
// meta 를 붙인 이 토큰은 플레이어가 시트를 위조·동기화해도 만들어지지 않는다 → 악용 방지.
export const SKILLBOOK_META = "skillbook";

// 해당 아이템 ID 가 전투스킬과 연결된 스킬북인지
export async function isSkillBookItem(itemId: string): Promise<boolean> {
  const cs = await prisma.combatSkill.findFirst({
    where: { sourceItem: itemId },
    select: { id: true },
  });
  return !!cs;
}

// 스킬북 토큰 지급 (던전 드랍 등 서버 경로에서만 호출)
export async function grantSkillBookToken(userId: string, itemId: string, qty = 1): Promise<void> {
  if (qty <= 0) return;
  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId, meta: SKILLBOOK_META },
  });
  if (existing) {
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  } else {
    await prisma.inventoryEntry.create({ data: { userId, itemId, qty, meta: SKILLBOOK_META } });
  }
}

// 정상 지급된 스킬북 토큰을 보유 중인지 (차감하지 않고 확인만)
export async function hasSkillBookToken(userId: string, itemIds: string[]): Promise<boolean> {
  if (itemIds.length === 0) return false;
  const token = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: { in: itemIds }, meta: SKILLBOOK_META, qty: { gt: 0 } },
    select: { id: true },
  });
  return !!token;
}

// 스킬북 토큰 1개 차감. 보유한 토큰이 있으면 차감하고 true, 없으면 false.
export async function consumeSkillBookToken(userId: string, itemIds: string[]): Promise<boolean> {
  if (itemIds.length === 0) return false;
  const token = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: { in: itemIds }, meta: SKILLBOOK_META, qty: { gt: 0 } },
  });
  if (!token) return false;
  if (token.qty > 1) {
    await prisma.inventoryEntry.update({ where: { id: token.id }, data: { qty: token.qty - 1 } });
  } else {
    await prisma.inventoryEntry.delete({ where: { id: token.id } });
  }
  return true;
}
