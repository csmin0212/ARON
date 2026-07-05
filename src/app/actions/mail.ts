"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { appendSheetGold, appendSheetItem, type SheetInventory } from "@/lib/googleSheets";
import { grantSkillBookToken, isSkillBookItem } from "@/lib/skillbook";

export type MailState = { ok?: string; error?: string } | undefined;

function parseInv(json: string | null): SheetInventory {
  try {
    if (json) return JSON.parse(json) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

async function incDbItem(userId: string, name: string, qty: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { OR: [{ id: name }, { name }] } });
  if (!item) return;
  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId: item.id, meta: null },
  });
  if (existing) {
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  } else {
    await prisma.inventoryEntry.create({ data: { userId, itemId: item.id, qty } });
  }
}

// GM — 우편 발송. userId 가 있으면 그 캐릭터에게만, 없으면 전체.
export async function sendMail(_prev: MailState, formData: FormData): Promise<MailState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const recipientId = String(formData.get("userId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const senderName = String(formData.get("senderName") ?? "").trim() || "GM";
  const gold = Math.max(0, parseInt(String(formData.get("gold") ?? "0"), 10) || 0);
  const itemName = String(formData.get("itemName") ?? "").trim() || null;
  const itemQty = itemName
    ? Math.max(1, parseInt(String(formData.get("itemQty") ?? "1"), 10) || 1)
    : 0;

  if (!subject) return { error: "제목을 입력해주세요." };

  const recipientIds = recipientId
    ? [recipientId]
    : (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);
  if (recipientIds.length === 0) return { error: "받는 사람이 없어요." };

  await prisma.mail.createMany({
    data: recipientIds.map((rid) => ({
      recipientId: rid,
      senderName,
      subject,
      body,
      gold,
      itemName,
      itemQty,
    })),
  });

  revalidatePath("/mail");
  revalidatePath("/", "layout");
  return {
    ok: recipientId
      ? "우편을 보냈어요."
      : `전체 ${recipientIds.length.toLocaleString("ko-KR")}명에게 우편을 보냈어요.`,
  };
}

// 우편 첨부 수령 — 골드·아이템을 인벤토리/시트에 지급
export async function claimMail(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const mail = await prisma.mail.findUnique({ where: { id } });
  if (!mail || mail.recipientId !== user.id || mail.claimedAt) return;

  const hasAttach = mail.gold > 0 || (!!mail.itemName && mail.itemQty > 0);
  if (hasAttach) {
    const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
    if (sheet?.sheetTab) {
      const inv = parseInv(sheet.invJson);
      let curGold = sheet.curGold ?? 0;

      if (mail.gold > 0) {
        curGold += mail.gold;
        inv.gold = `${curGold}G`;
        void appendSheetGold(sheet.sheetTab, mail.gold);
      }

      if (mail.itemName && mail.itemQty > 0) {
        const catalog = await prisma.item.findFirst({
          where: { OR: [{ id: mail.itemName }, { name: mail.itemName }] },
          select: { id: true, name: true, desc: true },
        });
        // 스냅샷 메타(경매 반송 등) — 강화 장비의 효과·중량은 카탈로그가 아니라 스냅샷이 정본
        let meta: { effect?: string | null; weight?: number | null } = {};
        try {
          if (mail.itemMetaJson) meta = JSON.parse(mail.itemMetaJson) as typeof meta;
        } catch {
          meta = {};
        }
        const itemName = mail.itemMetaJson ? mail.itemName : (catalog?.name ?? mail.itemName);
        const effect = meta.effect ?? catalog?.desc ?? null;
        const weight = meta.weight ?? 1;
        const found = inv.items.find((i) => i.name.trim() === itemName.trim());
        if (found) {
          found.qty += mail.itemQty;
          if (!found.effect && effect) found.effect = effect;
        } else {
          inv.items.push({ name: itemName, effect, weight, qty: mail.itemQty });
        }
        void appendSheetItem(sheet.sheetTab, itemName, mail.itemQty, {
          effect,
          weight,
        });
        await incDbItem(user.id, catalog?.id ?? mail.itemName, mail.itemQty);
        const bookId = catalog?.id ?? mail.itemName;
        if (await isSkillBookItem(bookId)) await grantSkillBookToken(user.id, bookId, mail.itemQty);
      }

      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { invJson: JSON.stringify(inv), curGold, gold: `${curGold}G` },
      });
    }
  }

  await prisma.mail.update({
    where: { id },
    data: { claimedAt: new Date(), readAt: mail.readAt ?? new Date() },
  });
  revalidatePath("/mail");
  revalidatePath("/world");
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

export async function markMailRead(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.mail.updateMany({
    where: { id, recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/mail");
  revalidatePath("/", "layout");
}

export async function markAllMailRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.mail.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/mail");
  revalidatePath("/", "layout");
}

// 우편 삭제 — 미수령 첨부가 남아 있으면 거부(보상 분실 방지)
export async function deleteMail(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const mail = await prisma.mail.findUnique({ where: { id } });
  if (!mail || mail.recipientId !== user.id) return;
  const unclaimed = !mail.claimedAt && (mail.gold > 0 || (!!mail.itemName && mail.itemQty > 0));
  if (unclaimed) return; // 첨부를 먼저 수령해야 삭제 가능
  await prisma.mail.delete({ where: { id } });
  revalidatePath("/mail");
  revalidatePath("/", "layout");
}
