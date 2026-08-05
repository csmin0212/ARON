import type { MahjongTable, MahjongSeat } from "@/generated/prisma";
import {
  legalActionsFor,
  tenpaiInfoFor,
  type LegalActions,
  type MatchState,
  type Meld,
  type ScoreResult,
  type TenpaiInfo,
  type Tile,
} from "@/lib/mahjong";

export type MahjongSeatView = {
  seatIndex: number;
  userId: string | null;
  nickname: string | null;
  isAi: boolean;
  isReady: boolean;
};

export type MahjongPlayerView = {
  seat: number;
  handCount: number;
  myHand: Tile[] | null; // 본인만 실제 패, 남은 개수만 노출
  melds: Meld[];
  discards: Tile[];
  riichi: boolean;
  points: number;
  seatWind: number;
  isDealer: boolean;
  kitaCount: number;
};

export type MahjongHandView = {
  turn: number;
  roundWind: number;
  roundNumber: number;
  honba: number;
  kyotaku: number;
  dealerSeat: number;
  wallRemaining: number;
  doraIndicators: number[];
  players: MahjongPlayerView[];
  pendingCall:
    | {
        discardSeat: number;
        tile: Tile;
        eligibleSeats: number[];
        deadline: number;
        myResponse: string | null;
        myOptions: { ron: boolean; pon: boolean; kan: boolean; chi: boolean } | null;
      }
    | null;
  lastDiscard: { seat: number; tile: Tile } | null;
  lastCall: { seat: number; fromSeat: number; type: "pon" | "chi" | "minkan"; tile: Tile } | null;
  legalActions: LegalActions | null;
  tenpai: TenpaiInfo | null; // 내 텐파이 정보(대기·잔여 매수·후리텐) — 관전자는 null
  turnDeadline: number | null;
  timeBaseSec: number;
  timeBankMs: number[]; // 좌석별 남은 적립시간
  result: { type: "win" | "draw"; winners?: number[]; loserSeat?: number | null } | null;
};

export type MahjongSnapshot = {
  id: string;
  status: string;
  playerCount: number;
  tier: string;
  hostUserId: string;
  seats: MahjongSeatView[];
  mySeatIndex: number | null;
  hand: MahjongHandView | null;
  finalResult: MatchState["finalResult"];
  lastHandSummary: MahjongHandSummaryView | null;
};

export type MahjongHandSummaryView = {
  type: "win" | "draw";
  winners: { seat: number; score: ScoreResult; pointsWon: number }[];
  loserSeat: number | null;
  deltas: number[];
  pointsAfter: number[];
};

export function buildMahjongSnapshot(
  table: MahjongTable & { seats: MahjongSeat[] },
  match: MatchState | null,
  nicknames: Map<string, string>,
  viewerUserId: string | null,
): MahjongSnapshot {
  const seats: MahjongSeatView[] = table.seats
    .slice()
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => ({
      seatIndex: s.seatIndex,
      userId: s.userId,
      nickname: s.userId ? (nicknames.get(s.userId) ?? "???") : "AI",
      isAi: s.isAi,
      isReady: s.isReady,
    }));

  const mySeat = table.seats.find((s) => s.userId === viewerUserId);
  const mySeatIndex = mySeat ? mySeat.seatIndex : null;

  let hand: MahjongHandView | null = null;
  if (match?.hand) {
    const gameHand = match.hand;
    const players: MahjongPlayerView[] = gameHand.players.map((p) => ({
      seat: p.seat,
      handCount: p.hand.length,
      myHand: p.seat === mySeatIndex ? p.hand : null,
      melds: p.melds,
      discards: p.discards,
      riichi: p.riichi,
      points: p.points,
      seatWind: p.seatWind,
      isDealer: p.isDealer,
      kitaCount: p.kitaCount,
    }));

    hand = {
      turn: gameHand.turn,
      roundWind: match.roundWind,
      roundNumber: match.roundNumber,
      honba: match.honba,
      kyotaku: match.kyotaku,
      dealerSeat: match.dealerSeat,
      wallRemaining: gameHand.wall.liveTiles.length,
      doraIndicators: gameHand.wall.doraIndicators,
      players,
      pendingCall: gameHand.pendingCall
        ? {
            discardSeat: gameHand.pendingCall.discardSeat,
            tile: gameHand.pendingCall.tile,
            eligibleSeats: gameHand.pendingCall.eligibleSeats,
            deadline: gameHand.pendingCall.deadline,
            myResponse:
              mySeatIndex !== null ? (gameHand.pendingCall.responses[mySeatIndex] ?? null) : null,
            myOptions:
              mySeatIndex !== null ? (gameHand.pendingCall.options[mySeatIndex] ?? null) : null,
          }
        : null,
      lastDiscard: gameHand.lastDiscard,
      lastCall: gameHand.lastCall
        ? {
            seat: gameHand.lastCall.seat,
            fromSeat: gameHand.lastCall.fromSeat,
            type: gameHand.lastCall.type,
            tile: gameHand.lastCall.tile,
          }
        : null,
      legalActions: mySeatIndex !== null ? legalActionsFor(match, mySeatIndex) : null,
      tenpai: mySeatIndex !== null ? tenpaiInfoFor(match, mySeatIndex) : null,
      turnDeadline: gameHand.turnDeadline,
      timeBaseSec: match.timeRule.baseSec,
      timeBankMs: gameHand.players.map((p) => p.timeBankMs),
      result: gameHand.result,
    };
  }

  return {
    id: table.id,
    status: table.status,
    playerCount: table.playerCount,
    tier: table.tier,
    hostUserId: table.hostUserId,
    seats,
    mySeatIndex,
    hand,
    finalResult: match?.finalResult ?? null,
    lastHandSummary: match?.lastHandSummary
      ? {
          type: match.lastHandSummary.type,
          winners: match.lastHandSummary.winners,
          loserSeat: match.lastHandSummary.loserSeat,
          deltas: match.lastHandSummary.deltas,
          pointsAfter: match.lastHandSummary.pointsAfter,
        }
      : null,
  };
}
