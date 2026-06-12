// 게임 플레이 로직 — 채팅 명령(/채집 등)과 키워드 발화로 실행된다.
// 결과는 그 장소의 "시스템 메시지"로 채팅에 기록된다.
import "server-only";
import { prisma } from "./prisma";
import { rollDice } from "./dice";
import { AP_MAX, currentResetBoundary } from "./world";
import { pickDrop, type DropEntry } from "./gamedata";
import type { StatEntry } from "./charsheet";
import type { CharacterSheet } from "@/generated/prisma";

export const KIND_EMOJI: Record<string, string> = {
  채집: "🌿",
  낚시: "🎣",
  채굴: "⛏️",
  벌목: "🪓",
  사냥: "🏹",
  휴식: "🛏️",
  탐색: "🔍",
};

export function freshAp(
  ap: number | null,
  apResetAt: Date | null,
): { ap: number; apResetAt: Date } {
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

async function addItem(userId: string, itemId: string, qty: number): Promise<void> {
  const existing = await prisma.inventoryEntry.findFirst({ where: { userId, itemId, meta: null } });
  if (existing)
    await prisma.inventoryEntry.update({
      where: { id: existing.id },
      data: { qty: existing.qty + qty },
    });
  else await prisma.inventoryEntry.create({ data: { userId, itemId, qty } });
}

// 장소에 시스템 메시지 게시
export async function postSystem(locationId: string, content: string): Promise<void> {
  await prisma.worldMessage.create({ data: { locationId, system: true, content } });
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const diceText = (dice: number[], mod: number, total: number, dc: number) =>
  `🎲 ${dice.join("+")}${mod >= 0 ? "+" : ""}${mod} = ${total} (목표 ${dc})`;

// ── /명령 — 장소 행동 실행. 반환: 보낸 사람에게만 보여줄 오류/안내 ──
export async function runActionCommand(
  userId: string,
  nickname: string,
  sheet: CharacterSheet,
  command: string,
): Promise<{ error?: string }> {
  const locationId = sheet.locationId!;
  const actions = await prisma.locationAction.findMany({
    where: { locationId },
    orderBy: { order: "asc" },
  });

  const target = actions.find(
    (a) => norm(a.label ?? a.kind) === norm(command) || norm(a.kind) === norm(command),
  );
  if (!target) {
    const list = actions.map((a) => `/${a.label ?? a.kind}`).join(" · ");
    return {
      error: actions.length
        ? `여기서 가능한 행동: ${list}`
        : "이 장소에서 할 수 있는 행동이 없어요.",
    };
  }

  const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
  if (ap < target.apCost)
    return { error: `행동치가 부족해요. (필요 ⚡${target.apCost}, 보유 ⚡${ap})` };

  const label = target.label ?? target.kind;
  const emoji = KIND_EMOJI[target.kind] ?? "✨";

  // 판정
  let success = true;
  let rollLine = "";
  if (target.statLabel && target.dc != null) {
    const mod = statModOf(sheet.statsJson, target.statLabel);
    if (mod == null)
      return { error: `시트에서 【${target.statLabel}】 능력치를 찾지 못했어요. 프로필에서 다시 동기화해주세요.` };
    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    success = total >= target.dc;
    rollLine = ` — ${diceText(dice, mod, total, target.dc)}`;
    await prisma.roll.create({
      data: {
        userId,
        label: `${label} 판정 (${target.statLabel})`,
        dice: JSON.stringify(dice),
        modifier: mod,
        total,
        dc: target.dc,
        success,
      },
    });
  }

  // 보상 + AP 차감
  let resultLine: string;
  if (!success) {
    resultLine = ` 실패… ${target.failText ?? ""}`.trimEnd();
  } else {
    let drop: DropEntry;
    try {
      drop = pickDrop(JSON.parse(target.dropsJson) as DropEntry[]);
    } catch {
      return { error: "드랍테이블이 잘못됐어요. GM에게 알려주세요." };
    }
    if (drop.item === "골드" && drop.gold > 0) {
      await prisma.characterSheet.update({
        where: { userId },
        data: { curGold: (sheet.curGold ?? 0) + drop.gold },
      });
      resultLine = ` 성공! ✨ ${drop.gold}G 획득!`;
    } else if (drop.item === "꽝") {
      resultLine = " …허탕이었다.";
    } else {
      await addItem(userId, drop.item, drop.qty);
      const item = await prisma.item.findUnique({ where: { id: drop.item } });
      resultLine = ` 성공! ✨ ${item?.name ?? drop.item} x${drop.qty} 획득!`;
    }
  }

  await prisma.characterSheet.update({
    where: { userId },
    data: { ap: ap - target.apCost, apResetAt },
  });

  await postSystem(locationId, `${emoji} ${nickname}님의 ${label}${rollLine}${resultLine}`);
  return {};
}

// ── 키워드 발화 — 일반 채팅이 히든 키워드와 일치하면 발견 시도 ──
export async function tryKeywordSpeech(
  userId: string,
  nickname: string,
  sheet: CharacterSheet,
  content: string,
): Promise<{ notice?: string }> {
  const locationId = sheet.locationId!;
  const here = await prisma.location.findUnique({ where: { id: locationId } });
  if (!here) return {};

  let discovered: string[] = [];
  try {
    discovered = sheet.discoveredJson ? (JSON.parse(sheet.discoveredJson) as string[]) : [];
  } catch {
    discovered = [];
  }
  let hereConns: string[] = [];
  try {
    hereConns = here.connJson ? (JSON.parse(here.connJson) as string[]) : [];
  } catch {
    hereConns = [];
  }

  const hiddens = await prisma.location.findMany({ where: { hidden: true, keyword: { not: null } } });
  const target = hiddens.find((h) => {
    if (discovered.includes(h.id)) return false;
    if (norm(h.keyword!) !== norm(content)) return false;
    let hConns: string[] = [];
    try {
      hConns = h.connJson ? (JSON.parse(h.connJson) as string[]) : [];
    } catch {
      hConns = [];
    }
    return hereConns.includes(h.id) || hConns.includes(here.id);
  });
  if (!target) return {};

  const cond = (target.cond ?? "").trim();
  const discover = async () => {
    await prisma.characterSheet.update({
      where: { userId },
      data: { discoveredJson: JSON.stringify([...discovered, target.id]) },
    });
    await postSystem(
      locationId,
      `✨ ${nickname}님이 숨겨진 장소를 발견했다 — ${target.emoji ?? "📍"} ${target.name}!`,
    );
  };

  if (cond.startsWith("아이템")) {
    const itemName = cond.replace(/^아이템\s*[:：]\s*/, "").trim();
    const item = await prisma.item.findFirst({ where: { OR: [{ id: itemName }, { name: itemName }] } });
    const entry = item
      ? await prisma.inventoryEntry.findFirst({
          where: { userId, itemId: item.id, qty: { gt: 0 } },
        })
      : null;
    if (!entry) return { notice: "무언가 희미하게 반응하지만… 열쇠가 되어줄 무언가가 필요해 보인다." };
    await discover();
    return {};
  }

  if (cond.startsWith("판정")) {
    const cm = cond.match(/^판정\s*[:：]\s*(.+?)\s*[:：]\s*(\d+)$/);
    if (!cm) return { notice: "발견 조건 형식이 잘못됐어요. GM에게 알려주세요." };
    const statLabel = cm[1].trim();
    const dc = parseInt(cm[2], 10);
    const mod = statModOf(sheet.statsJson, statLabel);
    if (mod == null) return { notice: `시트에서 【${statLabel}】 능력치를 찾지 못했어요.` };

    const { ap, apResetAt } = freshAp(sheet.ap, sheet.apResetAt);
    if (ap < 1) return { notice: "무언가 느껴지지만… 탐색할 기력(행동치 1)이 없다." };

    const dice = rollDice(2);
    const total = dice[0] + dice[1] + mod;
    const success = total >= dc;
    await Promise.all([
      prisma.roll.create({
        data: {
          userId,
          label: `탐색 판정 (${statLabel})`,
          dice: JSON.stringify(dice),
          modifier: mod,
          total,
          dc,
          success,
        },
      }),
      prisma.characterSheet.update({ where: { userId }, data: { ap: ap - 1, apResetAt } }),
    ]);

    await postSystem(
      locationId,
      `🔍 ${nickname}님의 탐색 판정 — ${diceText(dice, mod, total, dc)} ${success ? "성공!" : "실패…"}`,
    );
    if (success) await discover();
    return {};
  }

  // 조건 없음 → 즉시 발견
  await discover();
  return {};
}
