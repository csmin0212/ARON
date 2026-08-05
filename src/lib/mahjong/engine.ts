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
  timeBankMs: number; // 기본시간을 넘겨 쓴 만큼 깎이는 판당 적립시간(작혼과 동일)
  missedRonTemp: boolean; // 론을 넘겨서 생긴 일시 후리텐 — 내가 다음 패를 버리면 풀린다
  missedRonPermanent: boolean; // 리치 후 론을 넘겼다 — 그 판 끝까지 론 불가
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

// 방금 성립한 울기 — "누가 누구에게서 무엇을 받았는지"를 화면에 잠깐 띄우기 위한 정보
export interface LastCall {
  seat: number;
  fromSeat: number;
  type: "pon" | "chi" | "minkan";
  tile: Tile;
  at: number;
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
  lastCall: LastCall | null;
  result: HandResult | null;
  turnStartedAt: number | null; // 현재 차례가 시작된 시각 — 소모 시간 계산용
  turnDeadline: number | null; // 기본시간+적립시간이 끝나는 시각. 넘기면 자동 츠모기리
  aiPauseUntil: number | null; // AI가 한 번에 여러 턴을 몰아치지 않게 — 한 수씩 보이도록 텀을 둔다
}

export function createGame(
  rules: RuleConfig,
  points: number[],
  seatWinds: WindKind[],
  timeBankMs = 0,
): GameState {
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
    timeBankMs,
    missedRonTemp: false,
    missedRonPermanent: false,
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
    lastCall: null,
    result: null,
    turnStartedAt: null,
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
