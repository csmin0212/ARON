"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import {
  appendSheetGold,
  appendSheetItem,
  inventoryWeightTotal,
  type SheetInventory,
} from "@/lib/googleSheets";
import {
  addLifeBagItem,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  type LifeState,
} from "@/lib/lifeSkillPerks";
import { findLifeSkillItem, lifeSkillItemKind, type LifeSkillKind } from "@/lib/lifeSkillData";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
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

type MailItemMeta = {
  effect?: string | null;
  weight?: number | null;
  rank?: number | null;
  text?: string | null;
  source?: string | null;
  category?: string | null;
};

function parseLifeEffectSnapshot(effect: string | null | undefined): { rank: number | null; text: string | null } {
  if (!effect) return { rank: null, text: null };
  const match = effect.match(/^R(\d+)\s*·\s*(.*)$/);
  if (!match) return { rank: null, text: effect };
  return {
    rank: Number(match[1]),
    text: match[2]?.trim() || null,
  };
}

function mailError(message: string): never {
  redirect(`/mail?error=${encodeURIComponent(message)}`);
}

function destinationBag(meta: MailItemMeta, itemName: string): LifeSkillKind | null {
  if (meta.source === "낚시" || meta.source === "채집" || meta.source === "채광") return meta.source;
  const kindByName = lifeSkillItemKind(itemName);
  if (kindByName) return kindByName;
  if (meta.category === "어획물") return "낚시";
  if (meta.category === "채집품") return "채집";
  return null;
}

function addLifeBagItems(
  life: LifeState,
  kind: LifeSkillKind,
  item: { name: string; weight: number; rank: number; text: string },
  qty: number,
): void {
  for (let i = 0; i < qty; i++) addLifeBagItem(life, kind, item);
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
      const life = parseLifeState(sheet.lifeJson);
      let curGold = sheet.curGold ?? 0;

      if (mail.gold > 0) {
        curGold += mail.gold;
        inv.gold = `${curGold}G`;
      }

      if (mail.itemName && mail.itemQty > 0) {
        const catalog = await prisma.item.findFirst({
          where: { OR: [{ id: mail.itemName }, { name: mail.itemName }] },
          select: { id: true, name: true, desc: true, weight: true },
        });
        // 스냅샷 메타(경매 반송 등) — 강화 장비의 효과·중량은 카탈로그가 아니라 스냅샷이 정본
        let meta: MailItemMeta = {};
        try {
          if (mail.itemMetaJson) meta = JSON.parse(mail.itemMetaJson) as typeof meta;
        } catch {
          meta = {};
        }
        const itemName = mail.itemMetaJson ? mail.itemName : (catalog?.name ?? mail.itemName);
        const effect = meta.effect ?? catalog?.desc ?? null;
        await loadLifeItems();
        const bagKind = destinationBag(meta, itemName);
        const lifeItem = bagKind ? findLifeSkillItem(bagKind, itemName) : null;
        const effectSnapshot = parseLifeEffectSnapshot(effect);
        const weight = meta.weight ?? lifeItem?.weight ?? catalog?.weight ?? 1;

        if (bagKind) {
          const bag = life.bags[bagKind];
          const nextWeight = lifeBagWeight(bag) + weight * mail.itemQty;
          const maxWeight = lifeBagLimit(life, bagKind);
          if (nextWeight > maxWeight) {
            mailError(`${bag.name} 중량이 부족합니다. (${nextWeight}/${maxWeight})`);
          }
          addLifeBagItems(
            life,
            bagKind,
            {
              name: itemName,
              weight,
              rank: meta.rank ?? effectSnapshot.rank ?? lifeItem?.rank ?? 0,
              text: meta.text ?? effectSnapshot.text ?? lifeItem?.text ?? effect ?? "",
            },
            mail.itemQty,
          );
        } else {
          const curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight ?? 0;
          const nextWeight = curWeight + weight * mail.itemQty;
          if (inv.maxWeight != null && nextWeight > inv.maxWeight) {
            mailError(`가방 중량이 부족합니다. (${nextWeight}/${inv.maxWeight})`);
          }
          const found = inv.items.find((i) => i.name.trim() === itemName.trim());
          if (found) {
            found.qty += mail.itemQty;
            if (!found.effect && effect) found.effect = effect;
            found.weight ??= weight;
          } else {
            inv.items.push({ name: itemName, effect, weight, qty: mail.itemQty });
          }
          inv.curWeight = inventoryWeightTotal(inv.items) ?? inv.curWeight;
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
          data: {
            invJson: JSON.stringify(inv),
            lifeJson: JSON.stringify(life),
            curGold,
            gold: `${curGold}G`,
          },
        });
      }
      if (mail.gold > 0) void appendSheetGold(sheet.sheetTab, mail.gold);
      if (!mail.itemName || mail.itemQty <= 0) {
        await prisma.characterSheet.update({
          where: { userId: user.id },
          data: { invJson: JSON.stringify(inv), lifeJson: JSON.stringify(life), curGold, gold: `${curGold}G` },
        });
      }
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
