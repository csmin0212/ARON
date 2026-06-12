"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rollDice } from "@/lib/dice";
import { AP_MAX, currentResetBoundary } from "@/lib/world";
import { pickDrop, type DropEntry } from "@/lib/gamedata";
import type { StatEntry } from "@/lib/charsheet";

export type GameResult =
  | {
      ok: true;
      title: string;
      dice?: number[];
      modifier?: number;
      total?: number;
      dc?: number | null;
      success?: boolean;
      gainText: string | null; // "동굴송어 x1" | "15G" | null(꽝/실패)
      flavor: string | null;
      ap: number;
    }
  | { ok: false; error: string };

function freshAp(ap: number | null, apResetAt: Date | null): { ap: number; apResetAt: Date } {
  if (!apResetAt || apResetAt < currentResetBoundary()) return { ap: AP_MAX, apResetAt: new Date() };
  return { ap: ap ?? AP_MAX, apResetAt };
}

function statModOf(statsJson: string | null, label: string): number | null {
  if (!statsJson) return null;
  try {
    const stats = JSON.parse(statsJson) as StatEntry[];
    const s = stats.find((x) => x.label === label);
    return s ? (s.mod ?? 0) : null;
  } catch {
    return null;
  }
}

// 인벤토리에 아이템 추가 (스택)
async function addItem(userId: string, itemId: string, qty: number): Promise<void> {
  const existing = await prisma.inventoryEntry.findFirst({
    where: { userId, itemId, meta: null },
  });
  if (existing) {
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  } else {
    await prisma.inventoryEntry.create({ data: { userId, itemId, qty } });
  }
}

// ── 장소 행동 (채집/낚시/채굴…) ──
export async function performAction(actionId: number): Promise<GameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const [sheet, action] = await Promise.all([
    prisma.characterSheet.findUnique({ where: { userId: user.id } }),
    prisma.locationAction.findUnique({ where: { id: actionId } }),
  ]);
  if (!sheet?.locationId) return { ok: false, error: "월드에 입장한 상태가 아니에요." };
  if (!action || action.locationId !== sheet.locationId)
    return { ok: false, error: "이 장소에서 할 수 없는 행동이에요." };

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < action.apCost)
    return { ok: false, error: `행동치가 부족해요. (필요 ${action.apCost}, 보유 ${ap})` };

  const label = action.label ?? action.kind;

  // 판정
  let dice: number[] | undefined;
  let modifier: number | undefined;
  let total: number | undefined;
  let success = true;
  if (action.statLabel && action.dc != null) {
    const mod = statModOf(sheet.statsJson, action.statLabel);
    if (mod == null)
      return { ok: false, error: `시트에서 【${action.statLabel}】 능력치를 찾지 못했어요. 프로필에서 다시 동기화해주세요.` };
    dice = rollDice(2);
    modifier = mod;
    total = dice[0] + dice[1] + mod;
    success = total >= action.dc;
    await prisma.roll.create({
      data: {
        userId: user.id,
        label: `${label} 판정 (${action.statLabel})`,
        dice: JSON.stringify(dice),
        modifier: mod,
        total,
        dc: action.dc,
        success,
      },
    });
  }

  // 보상
  let gainText: string | null = null;
  let drop: DropEntry | null = null;
  if (success) {
    try {
      const drops = JSON.parse(action.dropsJson) as DropEntry[];
      drop = pickDrop(drops);
    } catch {
      return { ok: false, error: "드랍테이블이 잘못됐어요. GM에게 알려주세요." };
    }
    if (drop.item === "골드" && drop.gold > 0) {
      await prisma.characterSheet.update({
        where: { userId: user.id },
        data: { curGold: (sheet.curGold ?? 0) + drop.gold },
      });
      gainText = `${drop.gold}G`;
    } else if (drop.item !== "꽝") {
      await addItem(user.id, drop.item, drop.qty);
      const item = await prisma.item.findUnique({ where: { id: drop.item } });
      gainText = `${item?.name ?? drop.item} x${drop.qty}`;
    }
  }

  // 행동치 차감
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { ap: ap - action.apCost, apResetAt },
  });

  revalidatePath("/world");
  return {
    ok: true,
    title: label,
    dice,
    modifier,
    total,
    dc: action.dc,
    success,
    gainText,
    flavor: !success ? (action.failText ?? "아쉽게도 성과가 없었다…") : gainText ? null : "이번엔 허탕이었다.",
    ap: ap - action.apCost,
  };
}

// ── 키워드 탐색 (히든 장소 발견) ──
export async function tryKeyword(keywordRaw: string): Promise<GameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const keyword = keywordRaw.trim();
  if (!keyword) return { ok: false, error: "키워드를 입력해주세요." };

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });
  if (!sheet?.locationId) return { ok: false, error: "월드에 입장한 상태가 아니에요." };

  const here = await prisma.location.findUnique({ where: { id: sheet.locationId } });
  if (!here) return { ok: false, error: "현재 위치를 찾을 수 없어요." };

  let discovered: string[] = [];
  try {
    discovered = sheet.discoveredJson ? (JSON.parse(sheet.discoveredJson) as string[]) : [];
  } catch {
    discovered = [];
  }

  // 후보: 현재 장소와 연결된 히든 장소 (이쪽→저쪽 or 저쪽→이쪽)
  let hereConns: string[] = [];
  try {
    hereConns = here.connJson ? (JSON.parse(here.connJson) as string[]) : [];
  } catch {
    hereConns = [];
  }
  const hiddens = await prisma.location.findMany({ where: { hidden: true } });
  const candidates = hiddens.filter((h) => {
    if (discovered.includes(h.id)) return false;
    let hConns: string[] = [];
    try {
      hConns = h.connJson ? (JSON.parse(h.connJson) as string[]) : [];
    } catch {
      hConns = [];
    }
    return hereConns.includes(h.id) || hConns.includes(here.id);
  });

  const target = candidates.find(
    (c) => c.keyword && c.keyword.trim().toLowerCase() === keyword.toLowerCase(),
  );

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);

  if (!target) {
    return {
      ok: true,
      title: "탐색",
      gainText: null,
      flavor: "주변을 살펴봤지만, 아무 일도 일어나지 않았다.",
      ap,
      success: undefined,
    };
  }

  // 조건 검사
  const cond = (target.cond ?? "").trim();

  if (cond.startsWith("아이템:")) {
    const itemName = cond.slice(4).replace(/^:/, "").trim();
    // 아이템 ID 또는 이름으로 보유 확인
    const item = await prisma.item.findFirst({
      where: { OR: [{ id: itemName }, { name: itemName }] },
    });
    const entry = item
      ? await prisma.inventoryEntry.findFirst({
          where: { userId: user.id, itemId: item.id, qty: { gt: 0 } },
        })
      : null;
    if (!entry) {
      return {
        ok: true,
        title: "탐색",
        gainText: null,
        flavor: "무언가 반응이 있지만… 열쇠가 되어줄 무언가가 필요해 보인다.",
        ap,
        success: undefined,
      };
    }
  } else if (cond.startsWith("판정:")) {
    const cm = cond.match(/^판정\s*[:：]\s*(.+?)\s*[:：]\s*(\d+)$/);
    if (!cm) return { ok: false, error: "발견 조건 형식이 잘못됐어요. GM에게 알려주세요." };
    const statLabel = cm[1].trim();
    const dc = parseInt(cm[2], 10);
    const mod = statModOf(sheet.statsJson, statLabel);
    if (mod == null)
      return { ok: false, error: `시트에서 【${statLabel}】 능력치를 찾지 못했어요.` };
    if (ap < 1) return { ok: false, error: "행동치가 부족해요. (탐색 판정에 1 필요)" };

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    const success = total >= dc;
    await Promise.all([
      prisma.roll.create({
        data: {
          userId: user.id,
          label: `탐색 판정 (${statLabel})`,
          dice: JSON.stringify(dice),
          modifier: mod,
          total,
          dc,
          success,
        },
      }),
      prisma.characterSheet.update({
        where: { userId: user.id },
        data: { ap: ap - 1, apResetAt },
      }),
    ]);

    if (!success) {
      return {
        ok: true,
        title: "탐색 판정",
        dice,
        modifier: mod,
        total,
        dc,
        success: false,
        gainText: null,
        flavor: "분명 이 근처인데… 끝내 찾지 못했다.",
        ap: ap - 1,
      };
    }

    // 성공 → 발견
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { discoveredJson: JSON.stringify([...discovered, target.id]) },
    });
    revalidatePath("/world");
    return {
      ok: true,
      title: "탐색 판정",
      dice,
      modifier: mod,
      total,
      dc,
      success: true,
      gainText: `새로운 장소 발견 — ${target.emoji ?? "📍"} ${target.name}`,
      flavor: null,
      ap: ap - 1,
    };
  }

  // 조건 없음(또는 아이템 보유 확인 통과) → 즉시 발견
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { discoveredJson: JSON.stringify([...discovered, target.id]) },
  });
  revalidatePath("/world");
  return {
    ok: true,
    title: "탐색",
    success: true,
    gainText: `새로운 장소 발견 — ${target.emoji ?? "📍"} ${target.name}`,
    flavor: null,
    ap,
  };
}
