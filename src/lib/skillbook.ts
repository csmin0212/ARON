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

export async function skillBookTokenItemIds(itemNameOrId: string): Promise<string[]> {
  const raw = itemNameOrId.trim();
  if (!raw) return [];
  const items = await prisma.item.findMany({
    where: { OR: [{ id: raw }, { name: raw }] },
    select: { id: true, name: true },
  });
  const candidates = [...new Set([raw, ...items.flatMap((item) => [item.id, item.name])])];
  const skills = await prisma.combatSkill.findMany({
    where: { sourceItem: { in: candidates } },
    select: { sourceItem: true },
  });
  return [...new Set(skills.map((skill) => skill.sourceItem).filter((id): id is string => !!id))];
}

export async function skillBookTokenQty(userId: string, itemNameOrId: string): Promise<number> {
  const itemIds = await skillBookTokenItemIds(itemNameOrId);
  if (itemIds.length === 0) return 0;
  const tokens = await prisma.inventoryEntry.findMany({
    where: { userId, itemId: { in: itemIds }, meta: SKILLBOOK_META, qty: { gt: 0 } },
    select: { qty: true },
  });
  return tokens.reduce((sum, token) => sum + Math.max(0, token.qty), 0);
}

export async function consumeSkillBookTokens(
  userId: string,
  itemNameOrId: string,
  qty: number,
): Promise<boolean> {
  if (qty <= 0) return true;
  const itemIds = await skillBookTokenItemIds(itemNameOrId);
  if (itemIds.length === 0) return true;
  const tokens = await prisma.inventoryEntry.findMany({
    where: { userId, itemId: { in: itemIds }, meta: SKILLBOOK_META, qty: { gt: 0 } },
    orderBy: { updatedAt: "asc" },
  });
  const total = tokens.reduce((sum, token) => sum + Math.max(0, token.qty), 0);
  if (total < qty) return false;

  let remaining = qty;
  await prisma.$transaction(
    tokens.flatMap((token) => {
      if (remaining <= 0) return [];
      const take = Math.min(token.qty, remaining);
      remaining -= take;
      return token.qty > take
        ? [prisma.inventoryEntry.update({ where: { id: token.id }, data: { qty: token.qty - take } })]
        : [prisma.inventoryEntry.delete({ where: { id: token.id } })];
    }),
  );
  return true;
}

export async function transferSkillBookTokens(
  fromUserId: string,
  toUserId: string,
  itemNameOrId: string,
  qty: number,
): Promise<number> {
  if (qty <= 0 || fromUserId === toUserId) return 0;
  const itemIds = await skillBookTokenItemIds(itemNameOrId);
  if (itemIds.length === 0) return 0;
  const tokens = await prisma.inventoryEntry.findMany({
    where: { userId: fromUserId, itemId: { in: itemIds }, meta: SKILLBOOK_META, qty: { gt: 0 } },
    orderBy: { updatedAt: "asc" },
  });

  let moved = 0;
  for (const token of tokens) {
    if (moved >= qty) break;
    const take = Math.min(token.qty, qty - moved);
    await prisma.$transaction(async (tx) => {
      if (token.qty > take) {
        await tx.inventoryEntry.update({ where: { id: token.id }, data: { qty: token.qty - take } });
      } else {
        await tx.inventoryEntry.delete({ where: { id: token.id } });
      }
      const existing = await tx.inventoryEntry.findFirst({
        where: { userId: toUserId, itemId: token.itemId, meta: SKILLBOOK_META },
      });
      if (existing) {
        await tx.inventoryEntry.update({ where: { id: existing.id }, data: { qty: existing.qty + take } });
      } else {
        await tx.inventoryEntry.create({
          data: { userId: toUserId, itemId: token.itemId, qty: take, meta: SKILLBOOK_META },
        });
      }
    });
    moved += take;
  }
  return moved;
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
