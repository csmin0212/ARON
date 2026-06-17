"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { postSystem } from "@/lib/play";
import {
  consumeSheetItem,
  readSheetClasses,
  writeSkillRowToSheet,
  type SheetInventory,
} from "@/lib/googleSheets";

export type SkillBookState = { ok?: string; error?: string } | undefined;

function parseInv(json: string | null): SheetInventory {
  try {
    if (json) return JSON.parse(json) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

// 스킬북(소모품) 사용 — 연결된 전투스킬을 캐릭터 시트에 기입하고 1개 소모.
// 시트 기입이 실패(중복·가득참)하면 아이템을 소모하지 않는다.
export async function useSkillBook(
  _prev: SkillBookState,
  formData: FormData,
): Promise<SkillBookState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const itemName = String(formData.get("itemName") ?? "").trim();
  if (!itemName) return { error: "아이템을 선택해주세요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.sheetTab) return { error: "캐릭터 시트 연동이 필요해요." };

  // 아이템 → 연결된 전투스킬 (출처아이템 = 아이템 ID)
  const items = await prisma.item.findMany({ where: { name: itemName }, select: { id: true } });
  const ids = items.map((i) => i.id);
  const skill = await prisma.combatSkill.findFirst({
    where: { sourceItem: { in: ids.length ? ids : [itemName] } },
  });
  if (!skill) return { error: "이 아이템에 연결된 스킬이 없어요." };

  // 보유 확인 (시트 인벤토리)
  const inv = parseInv(sheet.invJson);
  const line = inv.items.find((i) => i.name.trim() === itemName);
  if (!line || line.qty <= 0) return { error: `${itemName}이(가) 가방에 없어요.` };

  // 클래스 전용 — 스킬 분류(직업)가 내 클래스(메인/서브)와 맞아야 함
  const requiredClass = skill.category?.trim();
  if (requiredClass) {
    const myClasses = await readSheetClasses(sheet.sheetTab);
    const norm = (s: string) => s.replace(/\s+/g, "");
    const canLearn = myClasses.some((c) => norm(c) === norm(requiredClass));
    if (!canLearn) {
      return {
        error: `${requiredClass} 전용 스킬이에요. (내 클래스: ${myClasses.join(" / ") || "없음"})`,
      };
    }
  }

  // 시트에 스킬 기입 — 중복·가득참은 여기서 막고, 실패 시 소모하지 않음
  const write = await writeSkillRowToSheet(sheet.sheetTab, {
    name: skill.name,
    category: skill.category,
    subCategory: skill.subCategory,
    sl: skill.sl,
    slMax: skill.slMax,
    timing: skill.timing,
    range: skill.range,
    check: skill.check,
    target: skill.target,
    cost: skill.cost,
    condition: skill.condition,
    effect: skill.effect,
    critical: skill.critical,
  });
  if (!write.ok) return { error: write.error ?? "스킬을 시트에 기록하지 못했어요." };

  // 소모 — 시트 수량 칸 + invJson + DB 인벤토리
  await consumeSheetItem(sheet.sheetTab, itemName, 1);
  line.qty -= 1;
  const nextItems = inv.items.filter((i) => i.qty > 0);
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { invJson: JSON.stringify({ ...inv, items: nextItems }) },
  });
  for (const it of items) {
    const entry = await prisma.inventoryEntry.findFirst({
      where: { userId: user.id, itemId: it.id },
    });
    if (!entry) continue;
    if (entry.qty > 1) {
      await prisma.inventoryEntry.update({ where: { id: entry.id }, data: { qty: entry.qty - 1 } });
    } else {
      await prisma.inventoryEntry.delete({ where: { id: entry.id } });
    }
    break;
  }

  if (sheet.locationId) {
    void postSystem(sheet.locationId, `📖 ${user.nickname}님이 '${skill.name}' 스킬을 습득했다!`);
  }
  revalidatePath("/world");
  revalidatePath("/profile");
  return { ok: `'${skill.name}' 스킬을 습득했어요! 시트에 기록됐습니다.` };
}
