import type { Meld, RuleConfig, Tile, WindKind } from "./types";
import { dealWall, drawTile, type Wall } from "./wall";
import { shanten } from "./shanten";
import { toCounts } from "./tiles";

export interface PlayerState {
  seat: number;
  isAi: boolean;
  hand: Tile[];
  melds: Meld[];
  discards: Tile[];
  riichi: boolean;
  riichiTurn: number | null;
  points: number;
  isDealer: boolean;
  seatWind: WindKind;
  kitaCount: number;
}

export interface CallOptions {
  ron: boolean;
  pon: boolean;
  kan: boolean;
  chi: boolean;
}

export interface CallWindow {
  discardSeat: number;
  tile: Tile;
  eligibleSeats: number[]; // 사람이라 응답을 기다려야 하는 좌석만
  options: Record<number, CallOptions>; // eligibleSeats 각각이 실제로 낼 수 있는 콜
  responses: Record<number, "pass" | "pon" | "chi" | "kan" | "ron">;
  deadline: number; // epoch ms
}

export interface HandResult {
  type: "win" | "draw";
  winners?: number[];
  loserSeat?: number | null;
}

export interface GameState {
  rules: RuleConfig;
  wall: Wall;
  players: PlayerState[];
  turn: number;
  roundWind: WindKind;
  honba: number;
  kyotaku: number;
  turnCount: number;
  finished: boolean;
  pendingCall: CallWindow | null;
  lastDiscard: { seat: number; tile: Tile } | null;
  result: HandResult | null;
  turnDeadline: number | null; // 사람 차례가 너무 오래 비어있으면(이탈) AI 휴리스틱으로 대신 진행
  aiPauseUntil: number | null; // AI가 한 번에 여러 턴을 몰아치지 않게 — 한 수씩 보이도록 텀을 둔다
}

export function createGame(rules: RuleConfig, points: number[], seatWinds: WindKind[]): GameState {
  const { hands, wall } = dealWall(rules.playerCount);
  const players: PlayerState[] = hands.map((hand, i) => ({
    seat: i,
    isAi: false,
    hand,
    melds: [],
    discards: [],
    riichi: false,
    riichiTurn: null,
    points: points[i] ?? 0,
    isDealer: seatWinds[i] === 27,
    seatWind: seatWinds[i],
    kitaCount: 0,
  }));
  return {
    rules,
    wall,
    players,
    turn: players.findIndex((p) => p.isDealer),
    roundWind: 27,
    honba: 0,
    kyotaku: 0,
    turnCount: 0,
    finished: false,
    pendingCall: null,
    lastDiscard: null,
    result: null,
    turnDeadline: null,
    aiPauseUntil: null,
  };
}

// 드로우 실패(벽 소진)는 유국(황패) — 호출부에서 state.finished를 보고 정산으로 넘어간다.
export function drawForCurrentPlayer(state: GameState): Tile | null {
  const tile = drawTile(state.wall);
  if (!tile) {
    state.finished = true;
    return null;
  }
  state.players[state.turn].hand.push(tile);
  state.turnCount++;
  return tile;
}

export function discard(state: GameState, seat: number, tileIndex: number): Tile {
  const player = state.players[seat];
  const [tile] = player.hand.splice(tileIndex, 1);
  player.discards.push(tile);
  return tile;
}

export function currentShanten(state: GameState, seat: number): number {
  const player = state.players[seat];
  return shanten(toCounts(player.hand), player.melds.length);
}
