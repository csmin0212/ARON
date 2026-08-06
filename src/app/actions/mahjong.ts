"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import { finishAndSettle, parseMatchState, tierConfigOf } from "@/lib/mahjongSettle";
import {
  DEFAULT_RULES_3P,
  DEFAULT_RULES_4P,
  createMatch,
  TIME_PRESETS,
  pump,
  performDiscard,
  declareAnkan,
  declareKakan,
  declareRiichi,
  declareKitaInMatch,
  declareKyuushu,
  submitCallResponse,
  checkWinAtDraw,
  settleHandWin,
  type MatchLength,
} from "@/lib/mahjong";

export type MahjongActionState = { ok: boolean; message: string };

export type TimePreset = "fast" | "normal" | "slow";
export type MahjongSettings = { matchLength: MatchLength; kuitan: boolean; timePreset: TimePreset };
const DEFAULT_SETTINGS: MahjongSettings = { matchLength: "tonpuusen", kuitan: true, timePreset: "normal" };

function parseSettings(json: string | null | undefined): MahjongSettings {
  if (!json) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(json) as Partial<MahjongSettings>;
    return {
      matchLength: parsed.matchLength === "hanchan" ? "hanchan" : "tonpuusen",
      kuitan: parsed.kuitan !== false,
      timePreset:
        parsed.timePreset === "fast" || parsed.timePreset === "slow" ? parsed.timePreset : "normal",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type PlazaCheck =
  | { ok: false; error: string }
  | { ok: true; sheet: { locationId: string | null; curGold: number | null }; location: { id: string; name: string } };

async function requirePlazaLocation(userId: string): Promise<PlazaCheck> {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { locationId: true, curGold: true },
  });
  if (!sheet) return { ok: false, error: "캐릭터 시트 연동이 필요합니다." };
  const location = sheet.locationId
    ? await prisma.location.findUnique({ where: { id: sheet.locationId }, select: { id: true, name: true } })
    : null;
  const atPlaza = `${location?.id ?? ""} ${location?.name ?? ""}`.includes("분수");
  if (!atPlaza || !location) return { ok: false, error: "마작은 분수 광장에서만 할 수 있어요." };
  return { ok: true, sheet, location };
}

export type MahjongTableSummary = {
  id: string;
  playerCount: number;
  tier: string;
  filled: number;
  hostNickname: string;
  matchLength: MatchLength;
  status: "waiting" | "playing";
  isHost: boolean;
};

export async function listMahjongTables(): Promise<MahjongTableSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const check = await requirePlazaLocation(user.id);
  if (!check.ok) return [];

  await cleanupStaleTables(check.location.id);

  const tables = await prisma.mahjongTable.findMany({
    where: { locationId: check.location.id, status: { in: ["waiting", "playing"] } },
    include: { seats: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  const hostIds = tables.map((t) => t.hostUserId);
  const hosts = await prisma.user.findMany({ where: { id: { in: hostIds } }, select: { id: true, nickname: true } });
  const hostMap = new Map(hosts.map((h) => [h.id, h.nickname]));

  return tables.map((t) => ({
    id: t.id,
    playerCount: t.playerCount,
    tier: t.tier,
    filled: t.seats.length,
    hostNickname: hostMap.get(t.hostUserId) ?? "???",
    matchLength: parseSettings(t.settingsJson).matchLength,
    status: t.status === "playing" ? "playing" : "waiting",
    isHost: t.hostUserId === user.id,
  }));
}

export async function createMahjongTable(
  _prev: MahjongActionState,
  formData: FormData,
): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const check = await requirePlazaLocation(user.id);
  if (!check.ok) return { ok: false, message: check.error };

  const playerCount = Number(formData.get("playerCount")) === 3 ? 3 : 4;
  const tierKey = String(formData.get("tier") ?? "low");
  const tier = tierConfigOf(playerCount, tierKey);
  const rawPreset = String(formData.get("timePreset") ?? "normal");
  const settings: MahjongSettings = {
    matchLength: formData.get("matchLength") === "hanchan" ? "hanchan" : "tonpuusen",
    kuitan: formData.get("kuitan") !== "off",
    timePreset: rawPreset === "fast" || rawPreset === "slow" ? rawPreset : "normal",
  };

  if ((check.sheet.curGold ?? 0) < tier.gold) {
    return { ok: false, message: "입장 골드가 부족합니다." };
  }

  const table = await prisma.mahjongTable.create({
    data: {
      hostUserId: user.id,
      locationId: check.location.id,
      playerCount,
      tier: tier.tier,
      status: "waiting",
      settingsJson: JSON.stringify(settings),
      seats: { create: [{ seatIndex: 0, userId: user.id, isReady: false }] },
    },
    select: { id: true },
  });

  revalidatePath("/world");
  redirect(`/mahjong/${table.id}`);
}

export async function joinMahjongTable(
  _prev: MahjongActionState,
  formData: FormData,
): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const tableId = String(formData.get("tableId") ?? "");
  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  if (!table || table.status !== "waiting") return { ok: false, message: "참가할 수 없는 방입니다." };
  if (table.seats.some((s) => s.userId === user.id)) redirect(`/mahjong/${tableId}`);

  const taken = new Set(table.seats.map((s) => s.seatIndex));
  let seatIndex = -1;
  for (let i = 0; i < table.playerCount; i++) {
    if (!taken.has(i)) {
      seatIndex = i;
      break;
    }
  }
  if (seatIndex === -1) return { ok: false, message: "자리가 가득 찼습니다." };

  await prisma.mahjongSeat.create({ data: { tableId, seatIndex, userId: user.id } });
  redirect(`/mahjong/${tableId}`);
}

export async function leaveMahjongTable(tableId: string): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId } });
  if (!table || table.status !== "waiting") return { ok: false, message: "시작된 방은 나갈 수 없습니다." };
  await prisma.mahjongSeat.deleteMany({ where: { tableId, userId: user.id } });

  // 사람이 아무도 안 남으면 방을 지운다 — 안 그러면 빈 방이 목록에 계속 떠 있는다
  const rest = await prisma.mahjongSeat.findMany({ where: { tableId }, select: { userId: true } });
  if (!rest.some((s) => s.userId)) {
    await prisma.mahjongTable.delete({ where: { id: tableId } });
  }
  revalidatePath("/world");
  revalidatePath(`/mahjong/${tableId}`);
  return { ok: true, message: "방을 나갔습니다." };
}

// 방장이 직접 방을 없앤다(대기 중일 때만). GM 은 진행이 꼬인 방도 정리할 수 있다.
export async function deleteMahjongTable(tableId: string): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId } });
  if (!table) return { ok: true, message: "이미 없는 방입니다." };

  const gm = isGmUsername(user.username);
  if (table.hostUserId !== user.id && !gm) return { ok: false, message: "방장만 없앨 수 있어요." };
  if (table.status === "playing" && !gm) return { ok: false, message: "진행 중인 방은 없앨 수 없어요." };
  // 끝난 판은 전적이 걸려 있다 — 지우면 승률·등급이 사라지므로 GM 도 막는다
  if (table.status === "finished") return { ok: false, message: "끝난 판은 전적 기록이라 지울 수 없어요." };

  await prisma.mahjongRecord.deleteMany({ where: { tableId } });
  await prisma.mahjongTable.delete({ where: { id: tableId } }); // 좌석은 Cascade 로 함께 삭제
  revalidatePath("/world");
  return { ok: true, message: "방을 없앴습니다." };
}

// 목록을 열 때마다 찌꺼기 방을 치운다(별도 크론 없이 — starword 지연 정산과 같은 방식).
//  · 사람이 하나도 안 남은 대기방
//  · 6시간 넘게 대기 중인 방
async function cleanupStaleTables(locationId: string): Promise<void> {
  const stale = await prisma.mahjongTable.findMany({
    where: { locationId, status: "waiting" },
    include: { seats: { select: { userId: true } } },
  });
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  const doomed = stale
    .filter((t) => !t.seats.some((s) => s.userId) || t.createdAt.getTime() < cutoff)
    .map((t) => t.id);
  if (doomed.length === 0) return;
  await prisma.mahjongRecord.deleteMany({ where: { tableId: { in: doomed } } });
  await prisma.mahjongTable.deleteMany({ where: { id: { in: doomed } } });
}

export async function fillWithAi(tableId: string): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  if (!table || table.status !== "waiting") return { ok: false, message: "채울 수 없는 방입니다." };
  if (table.hostUserId !== user.id) return { ok: false, message: "방장만 채울 수 있어요." };

  const taken = new Set(table.seats.map((s) => s.seatIndex));
  const creates = [];
  for (let i = 0; i < table.playerCount; i++) {
    if (!taken.has(i)) creates.push({ tableId, seatIndex: i, isAi: true, isReady: true, userId: null });
  }
  if (creates.length > 0) await prisma.mahjongSeat.createMany({ data: creates });
  return { ok: true, message: "AI로 채웠어요." };
}

async function startTable(
  tableId: string,
  playerCount: 3 | 4,
  tierKey: string,
  settingsJson: string | null,
  seats: { seatIndex: number; userId: string | null; isAi: boolean }[],
): Promise<MahjongActionState> {
  const tier = tierConfigOf(playerCount, tierKey);
  const settings = parseSettings(settingsJson);
  const baseRules = playerCount === 3 ? DEFAULT_RULES_3P : DEFAULT_RULES_4P;
  const rules = { ...baseRules, kuitan: settings.kuitan };
  const humanSeats = seats.filter((s) => s.userId);

  try {
    await prisma.$transaction(async (tx) => {
      for (const s of humanSeats) {
        const result = await tx.characterSheet.updateMany({
          where: { userId: s.userId!, curGold: { gte: tier.gold } },
          data: { curGold: { decrement: tier.gold } },
        });
        if (result.count === 0) throw new Error("INSUFFICIENT_GOLD");
        await tx.mahjongSeat.updateMany({
          where: { tableId, seatIndex: s.seatIndex },
          data: { entryGold: tier.gold },
        });
      }
    });
  } catch {
    return { ok: false, message: "골드가 부족한 참가자가 있어 시작할 수 없습니다." };
  }

  humanSeats.forEach((s) => void enqueueSheetGoldSync(s.userId!));

  const match = createMatch(
    rules,
    tier.startPoints,
    seats.map((s) => ({ seat: s.seatIndex, userId: s.userId, isAi: s.isAi })),
    { matchLength: settings.matchLength, timeRule: TIME_PRESETS[settings.timePreset] },
  );
  pump(match);

  await prisma.mahjongTable.update({
    where: { id: tableId },
    data: { status: "playing", matchStateJson: JSON.stringify(match) },
  });

  return { ok: true, message: "게임을 시작합니다!" };
}

export async function setReady(tableId: string, ready: boolean): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };
  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  if (!table || table.status !== "waiting") return { ok: false, message: "이미 시작된 방입니다." };
  const mySeat = table.seats.find((s) => s.userId === user.id);
  if (!mySeat) return { ok: false, message: "이 방에 참가하지 않았습니다." };

  await prisma.mahjongSeat.update({ where: { id: mySeat.id }, data: { isReady: ready } });

  const seats = await prisma.mahjongSeat.findMany({ where: { tableId } });
  const filled = seats.length === table.playerCount;
  const allReady = filled && seats.every((s) => s.isReady);
  if (!allReady) return { ok: true, message: "준비 상태를 변경했습니다." };

  return startTable(
    table.id,
    table.playerCount as 3 | 4,
    table.tier,
    table.settingsJson,
    seats.map((s) => ({ seatIndex: s.seatIndex, userId: s.userId, isAi: s.isAi })),
  );
}

export type MahjongPlayAction =
  // 버릴 패는 인덱스가 아니라 '무슨 패인지'로 보낸다. 인덱스로 보내면 화면이 조금만
  // 뒤처져도(자동 버림·울기 해소·다음 판) 엉뚱한 패가 버려진다.
  | { type: "discard"; kind: number; aka?: boolean; drawn?: boolean }
  | { type: "tsumo" }
  | { type: "riichi"; kind: number; aka?: boolean }
  | { type: "ankan"; kind: number }
  | { type: "kakan" }
  | { type: "kita" }
  | { type: "kyuushu" }
  | { type: "call"; response: "pon" | "chi" | "kan" | "ron" | "pass" };

// 손패에서 실제 위치를 찾는다. 뽑은 패로 지정했으면 맨 뒤(=방금 뽑은 자리)를 우선한다.
function findTileIndex(
  hand: { kind: number; aka: boolean }[],
  want: { kind: number; aka?: boolean; drawn?: boolean },
): number {
  if (want.drawn) {
    const last = hand.length - 1;
    if (last >= 0 && hand[last].kind === want.kind) return last;
  }
  const exact = hand.findIndex((t) => t.kind === want.kind && t.aka === (want.aka ?? false));
  if (exact >= 0) return exact;
  return hand.findIndex((t) => t.kind === want.kind);
}

export async function submitPlayerAction(tableId: string, action: MahjongPlayAction): Promise<MahjongActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "로그인이 필요합니다." };

  const table = await prisma.mahjongTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  if (!table || table.status !== "playing" || !table.matchStateJson) {
    return { ok: false, message: "진행 중인 대국이 아닙니다." };
  }
  const mySeat = table.seats.find((s) => s.userId === user.id);
  if (!mySeat) return { ok: false, message: "이 방에 참가하지 않았습니다." };

  const match = parseMatchState(table.matchStateJson);
  if (!match) return { ok: false, message: "대국 정보를 읽지 못했습니다." };
  pump(match);

  const seat = mySeat.seatIndex;
  const hand = match.hand;

  if (action.type === "call") {
    submitCallResponse(match, seat, action.response);
  } else if (hand && hand.turn === seat && !hand.pendingCall) {
    switch (action.type) {
      case "discard": {
        const idx = findTileIndex(hand.players[seat].hand, action);
        if (idx < 0) return { ok: false, message: "이미 지나간 패입니다. 화면을 갱신했어요." };
        performDiscard(match, seat, idx);
        break;
      }
      case "tsumo": {
        const score = checkWinAtDraw(match);
        if (score) settleHandWin(match, [{ seat, score }], null);
        break;
      }
      case "riichi": {
        // 리치는 버릴 패를 고르면서 선언한다 — declareRiichi 안에서 버림까지 처리
        const idx = findTileIndex(hand.players[seat].hand, action);
        if (idx < 0) return { ok: false, message: "이미 지나간 패입니다. 화면을 갱신했어요." };
        if (!declareRiichi(match, seat, idx)) {
          return { ok: false, message: "그 패로는 리치를 걸 수 없어요." };
        }
        break;
      }
      case "ankan":
        declareAnkan(match, seat, action.kind);
        break;
      case "kakan":
        declareKakan(match, seat);
        break;
      case "kita":
        declareKitaInMatch(match, seat);
        break;
      case "kyuushu":
        declareKyuushu(match, seat);
        break;
    }
  }

  pump(match);

  if (match.finished) {
    // 폴링 쪽에서도 끝날 수 있어서 정산은 공용 함수가 한 번만 통과시킨다
    await finishAndSettle(
      {
        id: table.id,
        tier: table.tier,
        playerCount: table.playerCount,
        seats: table.seats.map((s) => ({
          seatIndex: s.seatIndex,
          userId: s.userId,
          isAi: s.isAi,
          entryGold: s.entryGold,
        })),
      },
      match,
    );
  } else {
    await prisma.mahjongTable.update({
      where: { id: tableId },
      data: { matchStateJson: JSON.stringify(match) },
    });
  }

  return { ok: true, message: "" };
}
