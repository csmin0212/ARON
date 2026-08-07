import type { Meld, MeldType, RuleConfig, ScoreResult, Tile, WinContext, WindKind } from "./types";
import { WIND_KINDS } from "./types";
import {
  createGame,
  discard as engineDiscard,
  drawForCurrentPlayer,
  type AbortReason,
  type GameState,
  type PlayerState,
} from "./engine";
import { drawRinshan, revealNextDora, revealUraDora } from "./wall";
import { scoreWin, paymentsFor } from "./scoring";
import { umaFor, isChiAllowed, declareKita as sanmaDeclareKita } from "./sanma";
import { shanten } from "./shanten";
import { WINDS, isSuited, isTerminalOrHonor, numOf, toCounts } from "./tiles";
import { chooseDiscard, shouldCallKan, shouldCallPon } from "./ai";

const AI_TURN_DELAY_MS = 800; // AI 한 수마다 텀 — 각자 한 장씩 내는 흐름이 눈에 보이도록

// 차례가 넘어갈 때는 반드시 둘 다 초기화해야 한다.
// turnStartedAt 만 남으면 다음 사람 차례에 새 제한시간이 안 잡혀서
// (turnDeadline=null → Date.now() < null 이 false) 패를 받자마자 자동으로 버려진다.
function resetTurnClock(hand: GameState): void {
  hand.turnStartedAt = null;
  hand.turnDeadline = null;
}

export interface MatchPlayerMeta {
  seat: number;
  userId: string | null;
  isAi: boolean;
  points: number;
}

export interface FinalResult {
  seat: number;
  userId: string | null;
  isAi: boolean;
  rawPoints: number;
  uma: number;
  finalPoints: number;
  placement: number;
}

export type MatchLength = "tonpuusen" | "hanchan";

export interface TimeRule {
  baseSec: number; // 매 턴 주어지는 기본시간
  bankSec: number; // 판당 적립시간 — 기본시간을 넘겨 쓴 만큼 깎인다
}

export const TIME_PRESETS: Record<string, TimeRule> = {
  fast: { baseSec: 3, bankSec: 10 },
  normal: { baseSec: 5, bankSec: 20 },
  slow: { baseSec: 10, bankSec: 30 },
};

export interface MatchState {
  rules: RuleConfig;
  matchLength: MatchLength;
  timeRule: TimeRule;
  players: MatchPlayerMeta[];
  roundWind: WindKind;
  roundNumber: number;
  dealerSeat: number;
  honba: number;
  kyotaku: number;
  hand: GameState | null;
  finished: boolean;
  handSeq: number;
  finalResult: FinalResult[] | null;
  lastHandSummary: HandSummary | null;
}

export interface HandSummary {
  seq: number; // 판마다 증가 — 내용이 똑같은 결과가 연달아 나와도 서로 다른 판으로 구분된다
  type: "win" | "draw" | "abort";
  abortReason?: AbortReason;
  winners: { seat: number; score: ScoreResult; pointsWon: number }[];
  loserSeat: number | null;
  deltas: number[]; // 좌석별 점수 증감 — 누가 누구에게 얼마를 줬는지 화면에 그대로 보여준다
  pointsAfter: number[];
}

function seatWindsFor(playerCount: number, dealerSeat: number): WindKind[] {
  const winds = WIND_KINDS.slice(0, playerCount);
  return Array.from({ length: playerCount }, (_, seat) => winds[(seat - dealerSeat + playerCount) % playerCount]);
}

export function createMatch(
  rules: RuleConfig,
  startPoints: number,
  seatAssignments: { seat: number; userId: string | null; isAi: boolean }[],
  opts: { matchLength?: MatchLength; timeRule?: TimeRule } = {},
): MatchState {
  const players = seatAssignments
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((a) => ({ ...a, points: startPoints }));
  const match: MatchState = {
    rules,
    matchLength: opts.matchLength ?? "tonpuusen",
    timeRule: opts.timeRule ?? TIME_PRESETS.normal,
    players,
    roundWind: WINDS.E,
    roundNumber: 1,
    dealerSeat: 0,
    honba: 0,
    kyotaku: 0,
    hand: null,
    finished: false,
    handSeq: 0,
    finalResult: null,
    lastHandSummary: null,
  };
  match.hand = buildHand(match);
  return match;
}

function buildHand(match: MatchState): GameState {
  const winds = seatWindsFor(match.rules.playerCount, match.dealerSeat);
  const points = match.players.map((p) => p.points);
  // 적립시간은 매 판 새로 채워진다(작혼과 동일)
  const game = createGame(match.rules, points, winds, match.timeRule.bankSec * 1000);
  game.roundWind = match.roundWind;
  game.honba = match.honba;
  game.kyotaku = match.kyotaku;
  game.players.forEach((p, i) => {
    p.isAi = match.players[i].isAi;
  });
  return game;
}

function syncPointsBack(match: MatchState): void {
  if (!match.hand) return;
  match.hand.players.forEach((p) => {
    match.players[p.seat].points = p.points;
  });
}

function advanceDealer(match: MatchState): void {
  match.dealerSeat = (match.dealerSeat + 1) % match.rules.playerCount;
  match.roundNumber += 1;
}

function advanceOrFinish(match: MatchState): void {
  // 토비 — 한 명이라도 점수가 마이너스면 그 자리에서 대국 종료
  if (match.players.some((p) => p.points < 0)) {
    finishMatch(match);
    return;
  }
  if (match.roundNumber > match.rules.playerCount) {
    if (match.matchLength === "hanchan" && match.roundWind === WINDS.E) {
      match.roundWind = WINDS.S;
      match.roundNumber = 1;
      match.dealerSeat = 0;
      match.hand = buildHand(match);
      return;
    }
    finishMatch(match);
  } else {
    match.hand = buildHand(match);
  }
}

function finishMatch(match: MatchState): void {
  const uma = umaFor(match.rules.playerCount);
  const ranked = match.players.slice().sort((a, b) => b.points - a.points || a.seat - b.seat);
  if (match.kyotaku > 0 && ranked.length > 0) {
    ranked[0].points += match.kyotaku * 1000;
    match.kyotaku = 0;
  }
  const results: FinalResult[] = ranked.map((p, idx) => ({
    seat: p.seat,
    userId: p.userId,
    isAi: p.isAi,
    rawPoints: p.points,
    uma: uma[idx],
    finalPoints: p.points + uma[idx],
    placement: idx + 1,
  }));
  match.finalResult = results.sort((a, b) => a.seat - b.seat);
  match.finished = true;
  match.hand = null;
}

// ── 후리텐: 자기 손패 기준으로 어떤 패라도 대기 형태를 이룬 적이 있으면 그 패들 전부 론 불가 ──
// 지금 손패가 기다리는 패 종류들(대기)
export function waitKinds(player: PlayerState): number[] {
  const out: number[] = [];
  for (let kind = 0; kind < 34; kind++) {
    const probe = toCounts([...player.hand, { kind, aka: false }]);
    if (shanten(probe, player.melds.length) === -1) out.push(kind);
  }
  return out;
}

// 후리텐 — 셋 다 론을 막는다.
//  1) 내 버림패에 내 대기패가 하나라도 있으면 (영구)
//  2) 론을 안 받고 넘긴 경우, 내 다음 버림까지 (일시)
//  3) 리치 후에 론을 넘겼으면 그 판 끝까지 (영구)
// 대기는 항상 13장 기준으로 본다. 내 차례라 14장을 들고 있으면 방금 뽑은 패를 빼고 계산한다.
// (이걸 안 하면 15장짜리 형태를 풀게 돼서 대기·후리텐이 전부 엉뚱해진다)
function waitBaseOf(player: PlayerState): PlayerState {
  if (player.hand.length % 3 === 2) return { ...player, hand: player.hand.slice(0, -1) };
  return player;
}

export function isFuriten(hand: GameState, seat: number): boolean {
  const player = hand.players[seat];
  if (player.missedRonPermanent) return true;
  if (player.missedRonTemp) return true;
  const waits = waitKinds(waitBaseOf(player));
  if (waits.length === 0) return false;
  const discardedKinds = new Set(player.discards.map((t) => t.kind));
  return waits.some((k) => discardedKinds.has(k));
}

export function buildWinContext(
  match: MatchState,
  winnerSeat: number,
  winTile: Tile,
  tsumo: boolean,
  extras: Partial<Pick<WinContext, "ippatsu" | "haitei" | "houtei" | "rinshan" | "chankan">> = {},
): WinContext {
  const hand = match.hand!;
  const player = hand.players[winnerSeat];
  if (player.riichi) revealUraDora(hand.wall);
  return {
    winTile,
    tsumo,
    seatWind: player.seatWind,
    roundWind: match.roundWind,
    riichi: player.riichi,
    doubleRiichi: player.riichi && player.doubleRiichi,
    ippatsu: extras.ippatsu ?? (player.riichi && player.ippatsuActive),
    haitei: extras.haitei ?? false,
    houtei: extras.houtei ?? false,
    rinshan: extras.rinshan ?? false,
    chankan: extras.chankan ?? false,
    doraIndicators: hand.wall.doraIndicators,
    uraDoraIndicators: player.riichi ? hand.wall.uraDoraIndicators : [],
    melds: player.melds,
    concealedTiles: tsumo ? [...player.hand] : [...player.hand, winTile],
    honba: match.honba,
    kyotaku: match.kyotaku,
    rules: match.rules,
    kitaCount: player.kitaCount,
  };
}

export function checkWinAtDraw(match: MatchState): ScoreResult | null {
  const hand = match.hand!;
  const seat = hand.turn;
  const player = hand.players[seat];
  const winTile = player.hand[player.hand.length - 1];
  // 천화(친)·지화(자) — 아무도 울지 않은 첫 순바에서 내가 아직 한 장도 안 버린 상태의 첫 쯔모
  const firstDraw = hand.firstGoAround && player.discards.length === 0 && !player.rinshanActive;
  const ctx = buildWinContext(match, seat, winTile, true, {
    haitei: hand.wall.liveTiles.length === 0 && !player.rinshanActive,
    rinshan: player.rinshanActive,
  });
  ctx.tenhou = firstDraw && player.isDealer;
  ctx.chiihou = firstDraw && !player.isDealer;
  return scoreWin(ctx, player.isDealer);
}

function checkWinAtDiscard(
  match: MatchState,
  seat: number,
  discardedTile: Tile,
  opts: { ignoreFuriten?: boolean; chankan?: boolean } = {},
): ScoreResult | null {
  const hand = match.hand!;
  const player = hand.players[seat];
  if (!opts.ignoreFuriten && isFuriten(hand, seat)) return null;
  const ctx = buildWinContext(match, seat, discardedTile, false, {
    houtei: !opts.chankan && hand.wall.liveTiles.length === 0,
    chankan: opts.chankan ?? false,
  });
  return scoreWin(ctx, player.isDealer);
}

function applyWinPayment(
  match: MatchState,
  winnerSeat: number,
  scoreResult: ScoreResult,
  loserSeat: number | null,
  honba: number,
): number {
  const hand = match.hand!;
  const winner = hand.players[winnerSeat];
  const tsumo = loserSeat === null;
  const payment = paymentsFor(scoreResult.basePoints, winner.isDealer, tsumo, honba, match.rules.playerCount);
  let gained = 0;
  if (tsumo) {
    hand.players.forEach((p) => {
      if (p.seat === winnerSeat) return;
      const share = p.isDealer ? payment.fromDealer : payment.fromNonDealer;
      p.points -= share;
      winner.points += share;
      gained += share;
    });
  } else if (loserSeat !== null) {
    hand.players[loserSeat].points -= payment.ronPayer;
    winner.points += payment.ronPayer;
    gained = payment.ronPayer;
  }
  return gained;
}

export function settleHandWin(
  match: MatchState,
  wins: { seat: number; score: ScoreResult }[],
  loserSeat: number | null,
): void {
  const hand = match.hand;
  if (!hand || wins.length === 0) return;
  const before = hand.players.map((p) => p.points);
  // 혼바는 방총자에게서 머리 잡은 한 명만 받는다(더블론에서 중복 지급되던 문제)
  const gains = wins.map((w, i) => applyWinPayment(match, w.seat, w.score, loserSeat, i === 0 ? match.honba : 0));
  const kyotakuBonus = match.kyotaku * 1000;
  hand.players[wins[0].seat].points += kyotakuBonus;
  gains[0] += kyotakuBonus;
  match.kyotaku = 0;
  syncPointsBack(match);

  const anyDealerWin = wins.some((w) => hand.players[w.seat].isDealer);
  if (anyDealerWin) {
    match.honba += 1;
  } else {
    match.honba = 0;
    advanceDealer(match);
  }

  hand.finished = true;
  hand.result = { type: "win", winners: wins.map((w) => w.seat), loserSeat };
  match.handSeq += 1;
  match.lastHandSummary = {
    seq: match.handSeq,
    type: "win",
    winners: wins.map((w, i) => ({ ...w, pointsWon: gains[i] })),
    loserSeat,
    deltas: hand.players.map((p, i) => p.points - before[i]),
    pointsAfter: hand.players.map((p) => p.points),
  };
  advanceOrFinish(match);
}

function hasTenpaiDiscard(hand: Tile[], meldCount: number): boolean {
  for (let i = 0; i < hand.length; i++) {
    const remaining = [...hand.slice(0, i), ...hand.slice(i + 1)];
    if (shanten(toCounts(remaining), meldCount) === 0) return true;
  }
  return false;
}

// 도중 유국 — 점수 이동 없이 무르고, 같은 친으로 혼바만 올려 다시 돌린다
export function settleHandAbort(match: MatchState, reason: AbortReason): void {
  const hand = match.hand;
  if (!hand || hand.finished) return;
  hand.finished = true;
  hand.result = { type: "abort", abortReason: reason };
  match.honba += 1;
  match.handSeq += 1;
  match.lastHandSummary = {
    seq: match.handSeq,
    type: "abort",
    abortReason: reason,
    winners: [],
    loserSeat: null,
    deltas: hand.players.map(() => 0),
    pointsAfter: hand.players.map((p) => p.points),
  };
  // 친은 그대로 — 라운드 수를 올리지 않고 같은 국을 다시 한다
  match.hand = buildHand(match);
}

export function settleHandDraw(match: MatchState): void {
  const hand = match.hand;
  if (!hand) return;
  const before = hand.players.map((p) => p.points);
  const playerCount = match.rules.playerCount;
  const tenpaiSeats: number[] = [];
  hand.players.forEach((p, seat) => {
    if (hasTenpaiDiscard([...p.hand], p.melds.length) || shanten(toCounts(p.hand), p.melds.length) === -1) {
      tenpaiSeats.push(seat);
    }
  });
  const notenSeats = hand.players.map((_, i) => i).filter((i) => !tenpaiSeats.includes(i));
  const dealerTenpai = tenpaiSeats.includes(match.dealerSeat);

  if (tenpaiSeats.length > 0 && tenpaiSeats.length < playerCount) {
    const pool = 3000;
    const gain = Math.floor(pool / tenpaiSeats.length);
    const pay = Math.floor(pool / notenSeats.length);
    tenpaiSeats.forEach((seat) => {
      hand.players[seat].points += gain;
    });
    notenSeats.forEach((seat) => {
      hand.players[seat].points -= pay;
    });
  }
  syncPointsBack(match);

  match.honba += 1;
  if (!dealerTenpai) advanceDealer(match);

  hand.finished = true;
  hand.result = { type: "draw" };
  match.handSeq += 1;
  match.lastHandSummary = {
    seq: match.handSeq,
    type: "draw",
    winners: [],
    loserSeat: null,
    deltas: hand.players.map((p, i) => p.points - before[i]),
    pointsAfter: hand.players.map((p) => p.points),
  };
  advanceOrFinish(match);
}

export function performDiscard(
  match: MatchState,
  seat: number,
  tileIndex: number,
  opts: { riichiDeclaration?: boolean } = {},
): void {
  const hand = match.hand;
  if (!hand) return;
  const player = hand.players[seat];
  // 리치를 '건 뒤'에는 뽑은 패를 그대로 버린다(츠모기리) — 손패를 못 바꾸므로 선택권이 없다.
  // 단 리치를 거는 그 버림은 본인이 고른 패여야 한다. declareRiichi 가 riichi 를 켜고
  // 부르기 때문에, 이걸 구분 안 하면 고른 패 대신 쯔모패가 버려진다.
  const forcedTsumogiri = player.riichi && opts.riichiDeclaration !== true;
  const finalIndex = forcedTsumogiri ? player.hand.length - 1 : tileIndex;
  consumeTurnTime(match, seat);
  const tile = engineDiscard(hand, seat, finalIndex);
  hand.lastDiscard = { seat, tile };
  hand.lastCall = null;
  player.missedRonTemp = false; // 내가 버렸으니 일시 후리텐은 풀린다
  player.rinshanActive = false; // 영상패를 버렸든 아니든 린샨 상태는 여기서 끝
  // 내 이전 일발 구간은 이번 버림으로 끝난다. 이번이 리치 선언이면 여기서 새 구간이 시작된다.
  player.ippatsuActive = opts.riichiDeclaration === true;
  if (opts.riichiDeclaration === true) player.riichiDiscardIndex = player.discards.length - 1;
  resetTurnClock(hand);

  // 첫 순바 종료 판정 + 사풍연타(첫 4장이 같은 바람이면 도중 유국)
  const totalDiscards = hand.players.reduce((n, p) => n + p.discards.length, 0);
  if (hand.firstGoAround && totalDiscards >= hand.players.length) {
    if (isSuufonRenda(hand)) {
      settleHandAbort(match, "suufonrenda");
      return;
    }
    hand.firstGoAround = false;
  }
  // 사가리치 — 전원이 리치를 걸면 도중 유국
  if (hand.players.every((p) => p.riichi)) {
    settleHandAbort(match, "suuchariichi");
    return;
  }

  openCallWindowIfNeeded(match, seat, tile);
}

// 첫 바퀴에 전원이 같은 바람패를 버렸는가
function isSuufonRenda(hand: GameState): boolean {
  const firsts = hand.players.map((p) => p.discards[0]);
  if (firsts.some((t) => !t)) return false;
  if (hand.players.some((p) => p.melds.length > 0)) return false;
  const k = firsts[0].kind;
  return k >= WINDS.E && k <= WINDS.N && firsts.every((t) => t.kind === k);
}

// 이번 차례에 기본시간을 넘겨 쓴 만큼 적립시간에서 깎는다
function consumeTurnTime(match: MatchState, seat: number): void {
  const hand = match.hand;
  if (!hand || hand.turnStartedAt === null) return;
  const used = Date.now() - hand.turnStartedAt;
  const over = used - match.timeRule.baseSec * 1000;
  if (over > 0) {
    const p = hand.players[seat];
    p.timeBankMs = Math.max(0, p.timeBankMs - over);
  }
}

function hasChiShape(hand: Tile[], discardKind: number): boolean {
  if (!isSuited(discardKind)) return false;
  const counts = toCounts(hand);
  const n = numOf(discardKind);
  const suitBase = discardKind - (n - 1);
  const has = (num: number) => num >= 1 && num <= 9 && counts[suitBase + num - 1] > 0;
  return (has(n - 2) && has(n - 1)) || (has(n - 1) && has(n + 1)) || (has(n + 1) && has(n + 2));
}

function findChiPair(hand: Tile[], discardKind: number): [number, number] | null {
  const n = numOf(discardKind);
  const suitBase = discardKind - (n - 1);
  const counts = toCounts(hand);
  const combos: [number, number][] = [
    [n - 2, n - 1],
    [n - 1, n + 1],
    [n + 1, n + 2],
  ];
  for (const [a, b] of combos) {
    if (a >= 1 && a <= 9 && b >= 1 && b <= 9 && counts[suitBase + a - 1] > 0 && counts[suitBase + b - 1] > 0) {
      return [suitBase + a - 1, suitBase + b - 1];
    }
  }
  return null;
}

type CallResponse = "pass" | "pon" | "chi" | "kan" | "ron";

function aiDecideCall(
  player: PlayerState,
  tile: Tile,
  opts: { canRon: boolean; canPon: boolean; canKan: boolean; canChi: boolean },
): CallResponse {
  if (opts.canRon) return "ron";
  const counts = toCounts(player.hand);
  if (opts.canKan && shouldCallKan(counts, tile.kind)) return "kan";
  if (opts.canPon && shouldCallPon(counts, player.melds.length, tile.kind)) return "pon";
  if (opts.canChi) return "chi";
  return "pass";
}

function openCallWindowIfNeeded(match: MatchState, discardSeat: number, tile: Tile): void {
  const hand = match.hand!;
  const n = hand.players.length;
  const responses: Record<number, CallResponse> = {};
  const eligible: number[] = [];
  const options: Record<number, { ron: boolean; pon: boolean; kan: boolean; chi: boolean }> = {};

  hand.players.forEach((p) => {
    if (p.seat === discardSeat) return;
    const canRon = checkWinAtDiscard(match, p.seat, tile) !== null;
    const counts = toCounts(p.hand);
    // 리치한 사람은 손패를 못 바꾼다 — 론만 가능하고 퐁·치·깡은 불가
    const canPon = !p.riichi && counts[tile.kind] >= 2;
    const canKan = !p.riichi && counts[tile.kind] >= 3;
    const canChi =
      !p.riichi &&
      isChiAllowed(match.rules.playerCount) &&
      p.seat === (discardSeat + 1) % n &&
      hasChiShape(p.hand, tile.kind);
    if (!canRon && !canPon && !canKan && !canChi) return;
    if (p.isAi) {
      responses[p.seat] = aiDecideCall(p, tile, { canRon, canPon, canKan, canChi });
    } else {
      eligible.push(p.seat);
      options[p.seat] = { ron: canRon, pon: canPon, kan: canKan, chi: canChi };
    }
  });

  if (eligible.length === 0) {
    resolveCallResponses(match, discardSeat, tile, responses);
    return;
  }

  hand.pendingCall = {
    discardSeat,
    tile,
    eligibleSeats: eligible,
    options,
    responses,
    deadline: Date.now() + 10_000,
  };
}

function applyMultiRon(match: MatchState, discardSeat: number, tile: Tile, ronSeats: number[]): void {
  const hand = match.hand!;
  const n = hand.players.length;
  const ordered = ronSeats
    .slice()
    .sort((a, b) => ((a - discardSeat + n) % n) - ((b - discardSeat + n) % n));
  const wins = ordered.map((seat) => ({ seat, score: checkWinAtDiscard(match, seat, tile)! }));
  hand.pendingCall = null;
  settleHandWin(match, wins, discardSeat);
}

function applyCallMeld(
  match: MatchState,
  callerSeat: number,
  discardSeat: number,
  tile: Tile,
  type: Extract<MeldType, "pon" | "minkan" | "chi">,
): void {
  const hand = match.hand!;
  const caller = hand.players[callerSeat];
  const removeTiles: Tile[] = [];

  if (type === "chi") {
    const pair = findChiPair(caller.hand, tile.kind);
    if (!pair) return;
    pair.forEach((k) => {
      const idx = caller.hand.findIndex((t) => t.kind === k);
      if (idx >= 0) removeTiles.push(caller.hand.splice(idx, 1)[0]);
    });
  } else {
    const need = type === "minkan" ? 3 : 2;
    for (let i = 0; i < need; i++) {
      const idx = caller.hand.findIndex((t) => t.kind === tile.kind);
      if (idx >= 0) removeTiles.push(caller.hand.splice(idx, 1)[0]);
    }
  }

  const meldTiles = [...removeTiles, tile];
  const meldKind = type === "chi" ? Math.min(tile.kind, ...removeTiles.map((t) => t.kind)) : tile.kind;
  const meld: Meld = { type, kind: meldKind, tiles: meldTiles, calledFrom: discardSeat };
  caller.melds.push(meld);

  hand.lastDiscard = null;
  hand.pendingCall = null;
  hand.turn = callerSeat;
  resetTurnClock(hand);
  hand.lastCall = { seat: callerSeat, fromSeat: discardSeat, type, tile, at: Date.now() };
  // 울고 바로 버리면 한 화면에 겹쳐 보인다 — 울린 걸 볼 수 있게 한 박자 쉰다
  hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
  // 울음이 끼면 일발은 깨지고 첫 순바도 끝난다
  hand.players.forEach((p) => {
    p.ippatsuActive = false;
  });
  hand.firstGoAround = false;

  if (type === "minkan") {
    hand.kanCount += 1;
    revealNextDora(hand.wall);
    const rinshan = drawRinshan(hand.wall);
    if (rinshan) {
      caller.hand.push(rinshan);
      caller.rinshanActive = true;
    }
    if (checkSuukaikan(match)) return;
  }
}

// 사간류국 — 깡이 4개가 됐는데 한 사람이 독점한 게 아니면 도중 유국
function checkSuukaikan(match: MatchState): boolean {
  const hand = match.hand;
  if (!hand || hand.kanCount < 4) return false;
  const byPlayer = hand.players.map((p) => p.melds.filter((m) => m.type !== "pon" && m.type !== "chi").length);
  if (byPlayer.some((n) => n >= 4)) return false; // 스칸츠(역만) 노림 — 유국 아님
  settleHandAbort(match, "suukaikan");
  return true;
}

function resolveCallResponses(
  match: MatchState,
  discardSeat: number,
  tile: Tile,
  responses: Record<number, CallResponse>,
): void {
  const hand = match.hand!;
  const ronSeats = Object.entries(responses)
    .filter(([, v]) => v === "ron")
    .map(([k]) => Number(k));

  // 론이 가능했는데 안 잡은 사람은 후리텐이 붙는다(리치 중이면 그 판 내내)
  for (const [key, res] of Object.entries(responses)) {
    const s = Number(key);
    if (res === "ron") continue;
    if (checkWinAtDiscard(match, s, tile, { ignoreFuriten: true }) === null) continue;
    const p = hand.players[s];
    if (p.riichi) p.missedRonPermanent = true;
    else p.missedRonTemp = true;
  }
  if (ronSeats.length >= 3) {
    settleHandAbort(match, "sanchahou"); // 삼가화 — 세 명이 동시에 론하면 그 판을 무른다
    return;
  }
  if (ronSeats.length > 0) {
    applyMultiRon(match, discardSeat, tile, ronSeats);
    return;
  }
  const kanSeat = Object.entries(responses).find(([, v]) => v === "kan")?.[0];
  const ponSeat = Object.entries(responses).find(([, v]) => v === "pon")?.[0];
  const chiSeat = Object.entries(responses).find(([, v]) => v === "chi")?.[0];

  hand.pendingCall = null;

  if (kanSeat !== undefined) {
    applyCallMeld(match, Number(kanSeat), discardSeat, tile, "minkan");
    return;
  }
  if (ponSeat !== undefined) {
    applyCallMeld(match, Number(ponSeat), discardSeat, tile, "pon");
    return;
  }
  if (chiSeat !== undefined) {
    applyCallMeld(match, Number(chiSeat), discardSeat, tile, "chi");
    return;
  }
  hand.turn = (discardSeat + 1) % hand.players.length;
  resetTurnClock(hand);
}

export function submitCallResponse(match: MatchState, seat: number, response: CallResponse): void {
  const hand = match.hand;
  if (!hand || !hand.pendingCall) return;
  if (!hand.pendingCall.eligibleSeats.includes(seat)) return;
  hand.pendingCall.responses[seat] = response;
  const allResponded = hand.pendingCall.eligibleSeats.every((s) => s in hand.pendingCall!.responses);
  if (!allResponded) return;
  const { discardSeat, tile, responses, chankan } = hand.pendingCall;
  if (chankan) resolveChankan(match, chankan.seat, chankan.meldIndex, tile, responses);
  else resolveCallResponses(match, discardSeat, tile, responses);
}

export function declareAnkan(match: MatchState, seat: number, kind: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  const counts = toCounts(player.hand);
  if (counts[kind] < 4) return false;
  // 리치 중이면 대기가 안 변하는 안깡만 허용
  if (player.riichi && !canAnkanWhileRiichi(player, kind)) return false;
  const removed: Tile[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = player.hand.findIndex((t) => t.kind === kind);
    removed.push(player.hand.splice(idx, 1)[0]);
  }
  player.melds.push({ type: "ankan", kind, tiles: removed });
  hand.kanCount += 1;
  hand.firstGoAround = false;
  hand.players.forEach((p) => {
    p.ippatsuActive = false;
  });
  revealNextDora(hand.wall);
  const rinshan = drawRinshan(hand.wall);
  if (rinshan) {
    player.hand.push(rinshan);
    player.rinshanActive = true;
  }
  resetTurnClock(hand); // 깡 후에는 새 시간으로 다시 센다
  checkSuukaikan(match);
  return true;
}

export function declareKakan(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  const justDrawn = player.hand[player.hand.length - 1];
  const meldIndex = player.melds.findIndex((m) => m.type === "pon" && m.kind === justDrawn.kind);
  if (meldIndex < 0) return false;
  player.hand.pop();
  resetTurnClock(hand);

  // 창깡 — 이 패로 론이 되는 사람이 있으면 먼저 물어본다. 아무도 안 잡으면 그때 가깡을 완성.
  if (openChankanWindow(match, seat, meldIndex, justDrawn)) return true;
  completeKakan(match, seat, meldIndex, justDrawn);
  return true;
}

function completeKakan(match: MatchState, seat: number, meldIndex: number, tile: Tile): void {
  const hand = match.hand!;
  const player = hand.players[seat];
  const meld = player.melds[meldIndex];
  if (!meld) return;
  meld.type = "kakan";
  meld.tiles.push(tile);
  hand.kanCount += 1;
  hand.firstGoAround = false;
  hand.players.forEach((p) => {
    p.ippatsuActive = false;
  });
  revealNextDora(hand.wall);
  const rinshan = drawRinshan(hand.wall);
  if (rinshan) {
    player.hand.push(rinshan);
    player.rinshanActive = true;
  }
  checkSuukaikan(match);
}

// 가깡 패를 론으로 가로챌 수 있는 사람에게 물어본다. 사람이 하나도 없으면 즉시 정리.
function openChankanWindow(match: MatchState, kanSeat: number, meldIndex: number, tile: Tile): boolean {
  const hand = match.hand!;
  const responses: Record<number, CallResponse> = {};
  const eligible: number[] = [];
  const options: Record<number, { ron: boolean; pon: boolean; kan: boolean; chi: boolean }> = {};

  hand.players.forEach((p) => {
    if (p.seat === kanSeat) return;
    if (checkWinAtDiscard(match, p.seat, tile, { chankan: true }) === null) return;
    if (p.isAi) responses[p.seat] = "ron";
    else {
      eligible.push(p.seat);
      options[p.seat] = { ron: true, pon: false, kan: false, chi: false };
    }
  });

  const aiRon = Object.keys(responses).length > 0;
  if (eligible.length === 0 && !aiRon) return false;

  if (eligible.length === 0) {
    resolveChankan(match, kanSeat, meldIndex, tile, responses);
    return true;
  }
  hand.pendingCall = {
    discardSeat: kanSeat,
    tile,
    eligibleSeats: eligible,
    options,
    responses,
    deadline: Date.now() + Math.max(8000, match.timeRule.baseSec * 1000 + 3000),
    chankan: { seat: kanSeat, meldIndex },
  };
  return true;
}

function resolveChankan(
  match: MatchState,
  kanSeat: number,
  meldIndex: number,
  tile: Tile,
  responses: Record<number, CallResponse>,
): void {
  const hand = match.hand!;
  hand.pendingCall = null;
  const ronSeats = Object.entries(responses)
    .filter(([, v]) => v === "ron")
    .map(([k]) => Number(k));
  if (ronSeats.length === 0) {
    completeKakan(match, kanSeat, meldIndex, tile);
    return;
  }
  const n = hand.players.length;
  const ordered = ronSeats.slice().sort((a, b) => ((a - kanSeat + n) % n) - ((b - kanSeat + n) % n));
  const wins = ordered.map((seat) => ({
    seat,
    score: checkWinAtDiscard(match, seat, tile, { chankan: true })!,
  }));
  settleHandWin(match, wins, kanSeat);
}

// 리치는 "버릴 패를 고르면서" 선언한다(작혼과 동일). tileIndex 를 버려도 텐파이가 유지돼야 한다.
// 1000점을 공탁으로 내고, 그 판이 끝날 때 화료자가 가져간다.
export function declareRiichi(match: MatchState, seat: number, tileIndex: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  if (player.riichi) return false;
  if (player.melds.some((m) => m.type !== "ankan")) return false;
  if (player.points < 1000) return false;
  // 후보는 '종류'로 판정한다 — riichiDiscardIndexes 는 같은 종류를 한 번만 담기 때문에,
  // 같은 패가 두 장(적도라 포함) 있으면 뒤쪽 인덱스를 골랐다고 거절하면 안 된다.
  const target = player.hand[tileIndex];
  if (!target) return false;
  const riichiKinds = new Set(riichiDiscardIndexes(player).map((i) => player.hand[i].kind));
  if (!riichiKinds.has(target.kind)) return false;

  player.points -= 1000;
  match.players[seat].points = player.points;
  match.kyotaku += 1;
  hand.kyotaku = match.kyotaku;
  player.riichi = true;
  player.riichiTurn = hand.turnCount;
  // 첫 순바(아무도 안 울고, 내가 아직 한 장도 안 버림)에 걸면 더블리치
  player.doubleRiichi = hand.firstGoAround && player.discards.length === 0;
  // 일발 구간은 이 버림 직후부터 — 중간에 누가 울면 applyCallMeld 에서 깨진다
  performDiscard(match, seat, tileIndex, { riichiDeclaration: true });
  return true;
}

// 리치를 걸 수 있는 버림패 후보 — 버린 뒤에도 텐파이가 유지되는 패들
export function riichiDiscardIndexes(player: PlayerState): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < player.hand.length; i++) {
    const kind = player.hand[i].kind;
    if (seen.has(kind)) continue;
    seen.add(kind);
    const remaining = [...player.hand.slice(0, i), ...player.hand.slice(i + 1)];
    if (shanten(toCounts(remaining), player.melds.length) === 0) out.push(i);
  }
  return out;
}

export function declareKitaInMatch(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall || match.rules.playerCount !== 3) return false;
  const player = hand.players[seat];
  const result = sanmaDeclareKita(player.hand, hand.wall);
  if (!result) return false;
  player.kitaCount += 1;
  resetTurnClock(hand);
  return true;
}

export interface LegalActions {
  canTsumo: boolean;
  riichiKinds: number[]; // 리치를 걸 수 있는 버림패 '종류'(인덱스는 스냅샷이 어긋나면 위험)
  canKyuushu: boolean; // 구종구패 — 첫 순바에 요구패가 9종 이상이면 무를 수 있다
  canRiichi: boolean;
  riichiTiles: number[]; // 리치를 걸며 버릴 수 있는 손패 인덱스 — 눌러서 고른다
  ankanKinds: number[];
  canKakan: boolean;
  canKita: boolean;
}

export function legalActionsFor(match: MatchState, seat: number): LegalActions {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall || hand.finished) {
    return {
      canTsumo: false,
      canKyuushu: false,
      canRiichi: false,
      riichiTiles: [],
      riichiKinds: [],
      ankanKinds: [],
      canKakan: false,
      canKita: false,
    };
  }
  const player = hand.players[seat];
  const counts = toCounts(player.hand);
  const ankanKinds: number[] = [];
  counts.forEach((c, kind) => {
    if (c < 4) return;
    if (player.riichi) {
      if (canAnkanWhileRiichi(player, kind)) ankanKinds.push(kind);
    } else {
      ankanKinds.push(kind);
    }
  });
  const canKakan =
    !player.riichi &&
    player.melds.some((m) => m.type === "pon" && m.kind === player.hand[player.hand.length - 1]?.kind);
  const riichiTiles = declareRiichiPreview(match, seat) ? riichiDiscardIndexes(player) : [];
  const riichiKinds = [...new Set(riichiTiles.map((i) => player.hand[i].kind))];
  return {
    canTsumo: checkWinAtDraw(match) !== null,
    canKyuushu: canDeclareKyuushu(match, seat),
    canRiichi: riichiTiles.length > 0,
    riichiTiles,
    riichiKinds,
    ankanKinds,
    canKakan,
    canKita: match.rules.playerCount === 3 && player.hand.some((t) => t.kind === WINDS.N),
  };
}

function declareRiichiPreview(match: MatchState, seat: number): boolean {
  const hand = match.hand!;
  const player = hand.players[seat];
  if (player.riichi) return false;
  if (player.melds.some((m) => m.type !== "ankan")) return false;
  if (player.points < 1000) return false;
  return hasTenpaiDiscard(player.hand, player.melds.length);
}

// 구종구패 — 첫 순바(아무도 안 울고 내가 아직 안 버림)에 요구패가 9종 이상
export function canDeclareKyuushu(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  if (!hand.firstGoAround || player.discards.length > 0) return false;
  if (player.hand.length % 3 !== 2) return false; // 뽑은 직후에만
  const kinds = new Set(player.hand.filter((t) => isTerminalOrHonor(t.kind)).map((t) => t.kind));
  return kinds.size >= 9;
}

export function declareKyuushu(match: MatchState, seat: number): boolean {
  if (!canDeclareKyuushu(match, seat)) return false;
  settleHandAbort(match, "kyuushu");
  return true;
}

// 리치 중 안깡 — 작혼과 같은 제약:
//  1) 방금 뽑은 패로만 (송깡 금지)  2) 안깡 전후로 대기가 완전히 같아야 한다
export function canAnkanWhileRiichi(player: PlayerState, kind: number): boolean {
  const drawn = player.hand[player.hand.length - 1];
  if (!drawn || drawn.kind !== kind) return false;
  const counts = toCounts(player.hand);
  if (counts[kind] < 4) return false;

  const before: PlayerState = { ...player, hand: player.hand.slice(0, -1) };
  const after: PlayerState = {
    ...player,
    hand: player.hand.filter((t) => t.kind !== kind),
    melds: [...player.melds, { type: "ankan", kind, tiles: [] }],
  };
  const a = waitKinds(before).join(",");
  const b = waitKinds(after).join(",");
  return a.length > 0 && a === b;
}

// 텐파이 정보 — 무엇을 기다리는지 + 그 패가 몇 장 남았는지(보이는 패를 빼고 계산)
export interface TenpaiInfo {
  // hasYaku: 그 패로 론했을 때 역이 붙는지. 구조상 텐파이여도 역이 없으면 화료가 안 된다.
  waits: { kind: number; remaining: number; hasYaku: boolean }[];
  furiten: boolean;
}

export function tenpaiInfoFor(match: MatchState, seat: number): TenpaiInfo | null {
  const hand = match.hand;
  if (!hand) return null;
  const player = hand.players[seat];
  // 14장 들고 있으면(내 차례) 한 장 뺀 최선의 대기를 보여준다
  const base =
    player.hand.length % 3 === 2
      ? bestWaitAfterDiscard(player)
      : waitKinds(player).map((kind) => ({ kind }));
  if (base.length === 0) return null;

  const seen = new Array(34).fill(0);
  hand.players.forEach((p) => {
    p.discards.forEach((t) => seen[t.kind]++);
    p.melds.forEach((m) => m.tiles.forEach((t) => seen[t.kind]++));
  });
  player.hand.forEach((t) => seen[t.kind]++);
  hand.wall.doraIndicators.forEach((k) => seen[k]++);

  return {
    waits: base.map(({ kind }) => ({
      kind,
      remaining: Math.max(0, 4 - seen[kind]),
      hasYaku: waitHasYaku(match, seat, kind),
    })),
    furiten: isFuriten(hand, seat),
  };
}

// 그 패로 화료가 실제로 되는지(역 유무). 후리텐은 따로 표시하므로 여기선 무시한다.
function waitHasYaku(match: MatchState, seat: number, kind: number): boolean {
  const hand = match.hand;
  if (!hand) return false;
  const player = hand.players[seat];
  const base = waitBaseOf(player);
  const saved = player.hand;
  player.hand = base.hand;
  try {
    const tile: Tile = { kind, aka: false };
    // 론으로 한 번, 안 되면 쯔모로 한 번(멘젠쯔모만으로도 화료가 되는 경우가 있다)
    const ron = scoreWin(buildWinContext(match, seat, tile, false), player.isDealer);
    if (ron) return true;
    player.hand = [...base.hand, tile];
    const tsumo = scoreWin(buildWinContext(match, seat, tile, true), player.isDealer);
    return tsumo !== null;
  } finally {
    player.hand = saved;
  }
}

function bestWaitAfterDiscard(player: PlayerState): { kind: number }[] {
  const seenKinds = new Set<number>();
  const best: number[] = [];
  for (let i = 0; i < player.hand.length; i++) {
    const kind = player.hand[i].kind;
    if (seenKinds.has(kind)) continue;
    seenKinds.add(kind);
    const remaining = [...player.hand.slice(0, i), ...player.hand.slice(i + 1)];
    if (shanten(toCounts(remaining), player.melds.length) !== 0) continue;
    const probe: PlayerState = { ...player, hand: remaining };
    for (const k of waitKinds(probe)) if (!best.includes(k)) best.push(k);
  }
  return best.map((kind) => ({ kind }));
}

// 서버 진입점 — 콜 윈도우 타임아웃 정리 + AI 턴 진행.
// AI 는 한 번 호출에 한 수만 둔다(사람이 각자 한 장씩 내는 걸 볼 수 있어야 하므로).
// instant: true 면 텀 없이 끝까지 진행 — 테스트/시뮬레이션 전용.
export function pump(match: MatchState, opts: { instant?: boolean } = {}): void {
  const hand = match.hand;
  if (!hand || hand.finished || match.finished) return;
  const instant = opts.instant === true;
  let guard = 0;
  while (!hand.finished && guard++ < 300) {
    if (hand.pendingCall) {
      if (Date.now() <= hand.pendingCall.deadline && !instant) return;
      const remaining = { ...hand.pendingCall.responses };
      hand.pendingCall.eligibleSeats.forEach((s) => {
        if (!(s in remaining)) remaining[s] = "pass";
      });
      const { discardSeat, tile, chankan } = hand.pendingCall;
      if (chankan) resolveChankan(match, chankan.seat, chankan.meldIndex, tile, remaining);
      else resolveCallResponses(match, discardSeat, tile, remaining);
      continue;
    }

    const seat = hand.turn;
    const player = hand.players[seat];

    if (!player.isAi) {
      // 사람 차례 — 먼저 패를 뽑아주고, 기본시간+적립시간이 남아 있으면 조작을 기다린다
      const needsDrawForHuman = player.hand.length % 3 !== 2;
      if (needsDrawForHuman) {
        const tile = drawForCurrentPlayer(hand);
        if (!tile) {
          settleHandDraw(match);
          return;
        }
      }
      // 리치 중이라 고를 게 없으면(쯔모·깡도 안 되면) 기다릴 이유가 없다 — 바로 츠모기리.
      // 시간을 다 태우고 나서야 버려지던 문제.
      if (player.riichi) {
        const la = legalActionsFor(match, seat);
        if (!la.canTsumo && la.ankanKinds.length === 0 && !la.canKakan) {
          performDiscard(match, seat, player.hand.length - 1);
          if (!instant && match.hand) {
            match.hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
            return;
          }
          continue;
        }
      }
      if (hand.turnStartedAt === null || hand.turnDeadline === null) {
        hand.turnStartedAt = Date.now();
        hand.turnDeadline = Date.now() + match.timeRule.baseSec * 1000 + player.timeBankMs;
      }
      if (!instant && Date.now() < hand.turnDeadline) return;
      // 시간 초과 — 적립시간을 다 쓴 것으로 보고 자동 츠모기리(방금 뽑은 패를 그대로 버린다)
      player.timeBankMs = 0;
      performDiscard(match, seat, player.hand.length - 1);
      if (!instant && match.hand) {
        match.hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
        return;
      }
      continue;
    } else if (!instant && hand.aiPauseUntil !== null && Date.now() < hand.aiPauseUntil) {
      return; // 아직 이 AI 의 차례 텀이 안 지났다 — 클라이언트가 직전 수를 보고 있는 중
    }

    const needsDraw = player.hand.length % 3 !== 2;
    if (needsDraw) {
      const tile = drawForCurrentPlayer(hand);
      if (!tile) {
        settleHandDraw(match);
        return;
      }
    }

    const win = checkWinAtDraw(match);
    if (win) {
      settleHandWin(match, [{ seat, score: win }], null);
      continue;
    }

    // AI 도 구종구패가 뜨면 무른다
    if (canDeclareKyuushu(match, seat)) {
      declareKyuushu(match, seat);
      continue;
    }

    if (match.rules.playerCount === 3 && player.hand.some((t) => t.kind === WINDS.N)) {
      declareKitaInMatch(match, seat);
      if (!instant) {
        hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
        return;
      }
      continue;
    }

    // 리치 선언은 버릴 패 선택까지 한 번에 처리된다(declareRiichi 안에서 버림)
    if (!player.riichi && declareRiichiPreview(match, seat)) {
      const candidates = riichiDiscardIndexes(player);
      if (candidates.length > 0 && declareRiichi(match, seat, candidates[0])) {
        if (!instant && match.hand) {
          match.hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
          return;
        }
        continue;
      }
    }

    const discardTile = player.riichi ? player.hand[player.hand.length - 1] : chooseDiscard(player.hand, player.melds.length);
    const idx = player.hand.indexOf(discardTile);
    performDiscard(match, seat, idx < 0 ? player.hand.length - 1 : idx);
    if (!instant && match.hand) {
      match.hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
      return;
    }
  }
}

// 예전 판(필드가 추가되기 전에 저장된 matchStateJson)을 읽어도 죽지 않게 기본값을 채운다.
// 이걸 안 하면 배포 직후 진행 중이던 방이 전부 터진다.
export function parseMatchState(json: string | null | undefined): MatchState | null {
  if (!json) return null;
  let raw: MatchState;
  try {
    raw = JSON.parse(json) as MatchState;
  } catch {
    return null;
  }
  if (!raw || !Array.isArray(raw.players)) return null;

  raw.timeRule ??= TIME_PRESETS.normal;
  raw.timeRule.baseSec ??= TIME_PRESETS.normal.baseSec;
  raw.timeRule.bankSec ??= TIME_PRESETS.normal.bankSec;
  raw.matchLength ??= "tonpuusen";
  raw.handSeq ??= 0;
  raw.honba ??= 0;
  raw.kyotaku ??= 0;

  const hand = raw.hand;
  if (hand) {
    hand.turnStartedAt ??= null;
    hand.turnDeadline ??= null;
    hand.aiPauseUntil ??= null;
    hand.lastCall ??= null;
    hand.firstGoAround ??= false;
    hand.kanCount ??= 0;
    for (const p of hand.players ?? []) {
      p.timeBankMs ??= raw.timeRule.bankSec * 1000;
      p.missedRonTemp ??= false;
      p.missedRonPermanent ??= false;
      p.ippatsuActive ??= false;
      p.doubleRiichi ??= false;
      p.rinshanActive ??= false;
      p.riichiDiscardIndex ??= null;
      p.kitaCount ??= 0;
    }
  }
  return raw;
}
