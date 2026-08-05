import type { Meld, MeldType, RuleConfig, ScoreResult, Tile, WinContext, WindKind } from "./types";
import { WIND_KINDS } from "./types";
import { createGame, discard as engineDiscard, drawForCurrentPlayer, type GameState, type PlayerState } from "./engine";
import { drawRinshan, revealNextDora, revealUraDora } from "./wall";
import { scoreWin, paymentsFor } from "./scoring";
import { umaFor, isChiAllowed, declareKita as sanmaDeclareKita } from "./sanma";
import { shanten } from "./shanten";
import { WINDS, isSuited, numOf, toCounts } from "./tiles";
import { chooseDiscard, shouldCallKan, shouldCallPon } from "./ai";

const TURN_TIMEOUT_MS = 60_000; // 사람 차례가 이만큼 비면 이탈로 보고 AI가 대신 진행
const AI_TURN_DELAY_MS = 1_100; // AI 한 수마다 텀 — 각자 한 장씩 내는 흐름이 눈에 보이도록

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

export interface MatchState {
  rules: RuleConfig;
  matchLength: MatchLength;
  players: MatchPlayerMeta[];
  roundWind: WindKind;
  roundNumber: number;
  dealerSeat: number;
  honba: number;
  kyotaku: number;
  hand: GameState | null;
  finished: boolean;
  finalResult: FinalResult[] | null;
  lastHandSummary: HandSummary | null;
}

export interface HandSummary {
  type: "win" | "draw";
  winners: { seat: number; score: ScoreResult; pointsWon: number }[];
  loserSeat: number | null;
}

function seatWindsFor(playerCount: number, dealerSeat: number): WindKind[] {
  const winds = WIND_KINDS.slice(0, playerCount);
  return Array.from({ length: playerCount }, (_, seat) => winds[(seat - dealerSeat + playerCount) % playerCount]);
}

export function createMatch(
  rules: RuleConfig,
  startPoints: number,
  seatAssignments: { seat: number; userId: string | null; isAi: boolean }[],
  matchLength: MatchLength = "tonpuusen",
): MatchState {
  const players = seatAssignments
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((a) => ({ ...a, points: startPoints }));
  const match: MatchState = {
    rules,
    matchLength,
    players,
    roundWind: WINDS.E,
    roundNumber: 1,
    dealerSeat: 0,
    honba: 0,
    kyotaku: 0,
    hand: null,
    finished: false,
    finalResult: null,
    lastHandSummary: null,
  };
  match.hand = buildHand(match);
  return match;
}

function buildHand(match: MatchState): GameState {
  const winds = seatWindsFor(match.rules.playerCount, match.dealerSeat);
  const points = match.players.map((p) => p.points);
  const game = createGame(match.rules, points, winds);
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
function isFuriten(hand: GameState, seat: number): boolean {
  const player = hand.players[seat];
  const discardedKinds = new Set(player.discards.map((t) => t.kind));
  if (discardedKinds.size === 0) return false;
  for (const kind of discardedKinds) {
    const probe = toCounts([...player.hand, { kind, aka: false }]);
    if (shanten(probe, player.melds.length) === -1) return true;
  }
  return false;
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
    doubleRiichi: player.riichi && player.riichiTurn === 0,
    ippatsu: extras.ippatsu ?? false,
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
  const ctx = buildWinContext(match, seat, winTile, true, { haitei: hand.wall.liveTiles.length === 0 });
  return scoreWin(ctx, player.isDealer);
}

function checkWinAtDiscard(match: MatchState, seat: number, discardedTile: Tile): ScoreResult | null {
  const hand = match.hand!;
  const player = hand.players[seat];
  if (isFuriten(hand, seat)) return null;
  const ctx = buildWinContext(match, seat, discardedTile, false, { houtei: hand.wall.liveTiles.length === 0 });
  return scoreWin(ctx, player.isDealer);
}

function applyWinPayment(
  match: MatchState,
  winnerSeat: number,
  scoreResult: ScoreResult,
  loserSeat: number | null,
): number {
  const hand = match.hand!;
  const winner = hand.players[winnerSeat];
  const tsumo = loserSeat === null;
  const payment = paymentsFor(scoreResult.basePoints, winner.isDealer, tsumo, match.honba, match.rules.playerCount);
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
  const gains = wins.map((w) => applyWinPayment(match, w.seat, w.score, loserSeat));
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
  match.lastHandSummary = {
    type: "win",
    winners: wins.map((w, i) => ({ ...w, pointsWon: gains[i] })),
    loserSeat,
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

export function settleHandDraw(match: MatchState): void {
  const hand = match.hand;
  if (!hand) return;
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
  match.lastHandSummary = { type: "draw", winners: [], loserSeat: null };
  advanceOrFinish(match);
}

export function performDiscard(match: MatchState, seat: number, tileIndex: number): void {
  const hand = match.hand;
  if (!hand) return;
  const player = hand.players[seat];
  const finalIndex = player.riichi ? player.hand.length - 1 : tileIndex;
  const tile = engineDiscard(hand, seat, finalIndex);
  hand.lastDiscard = { seat, tile };
  hand.turnDeadline = null;
  openCallWindowIfNeeded(match, seat, tile);
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
    const canPon = counts[tile.kind] >= 2;
    const canKan = counts[tile.kind] >= 3;
    const canChi = isChiAllowed(match.rules.playerCount) && p.seat === (discardSeat + 1) % n && hasChiShape(p.hand, tile.kind);
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
  hand.turnDeadline = null;

  if (type === "minkan") {
    revealNextDora(hand.wall);
    const rinshan = drawRinshan(hand.wall);
    if (rinshan) caller.hand.push(rinshan);
  }
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
  hand.turnDeadline = null;
}

export function submitCallResponse(match: MatchState, seat: number, response: CallResponse): void {
  const hand = match.hand;
  if (!hand || !hand.pendingCall) return;
  if (!hand.pendingCall.eligibleSeats.includes(seat)) return;
  hand.pendingCall.responses[seat] = response;
  const allResponded = hand.pendingCall.eligibleSeats.every((s) => s in hand.pendingCall!.responses);
  if (allResponded) {
    const { discardSeat, tile, responses } = hand.pendingCall;
    resolveCallResponses(match, discardSeat, tile, responses);
  }
}

export function declareAnkan(match: MatchState, seat: number, kind: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  if (player.riichi) return false;
  const counts = toCounts(player.hand);
  if (counts[kind] < 4) return false;
  const removed: Tile[] = [];
  for (let i = 0; i < 4; i++) {
    const idx = player.hand.findIndex((t) => t.kind === kind);
    removed.push(player.hand.splice(idx, 1)[0]);
  }
  player.melds.push({ type: "ankan", kind, tiles: removed });
  revealNextDora(hand.wall);
  const rinshan = drawRinshan(hand.wall);
  if (rinshan) player.hand.push(rinshan);
  hand.turnDeadline = null;
  return true;
}

export function declareKakan(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  const justDrawn = player.hand[player.hand.length - 1];
  const ponMeld = player.melds.find((m) => m.type === "pon" && m.kind === justDrawn.kind);
  if (!ponMeld) return false;
  player.hand.pop();
  ponMeld.type = "kakan";
  ponMeld.tiles.push(justDrawn);
  revealNextDora(hand.wall);
  const rinshan = drawRinshan(hand.wall);
  if (rinshan) player.hand.push(rinshan);
  hand.turnDeadline = null;
  return true;
}

export function declareRiichi(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall) return false;
  const player = hand.players[seat];
  if (player.riichi) return false;
  if (player.melds.some((m) => m.type !== "ankan")) return false;
  if (player.points < 1000) return false;
  if (!hasTenpaiDiscard(player.hand, player.melds.length)) return false;
  player.riichi = true;
  player.riichiTurn = hand.turnCount;
  hand.turnDeadline = null;
  return true;
}

export function declareKitaInMatch(match: MatchState, seat: number): boolean {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall || match.rules.playerCount !== 3) return false;
  const player = hand.players[seat];
  const result = sanmaDeclareKita(player.hand, hand.wall);
  if (!result) return false;
  player.kitaCount += 1;
  hand.turnDeadline = null;
  return true;
}

export interface LegalActions {
  canTsumo: boolean;
  canRiichi: boolean;
  ankanKinds: number[];
  canKakan: boolean;
  canKita: boolean;
}

export function legalActionsFor(match: MatchState, seat: number): LegalActions {
  const hand = match.hand;
  if (!hand || hand.turn !== seat || hand.pendingCall || hand.finished) {
    return { canTsumo: false, canRiichi: false, ankanKinds: [], canKakan: false, canKita: false };
  }
  const player = hand.players[seat];
  const counts = toCounts(player.hand);
  const ankanKinds: number[] = [];
  if (!player.riichi) {
    counts.forEach((c, kind) => {
      if (c >= 4) ankanKinds.push(kind);
    });
  }
  const canKakan =
    !player.riichi &&
    player.melds.some((m) => m.type === "pon" && m.kind === player.hand[player.hand.length - 1]?.kind);
  return {
    canTsumo: checkWinAtDraw(match) !== null,
    canRiichi: declareRiichiPreview(match, seat),
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
      const { discardSeat, tile } = hand.pendingCall;
      resolveCallResponses(match, discardSeat, tile, remaining);
      continue;
    }

    const seat = hand.turn;
    const player = hand.players[seat];

    if (!player.isAi) {
      // 사람 차례 — 타임아웃 전에는 대기(폴링/액션이 다시 pump 를 부를 때까지)
      const needsDrawForHuman = player.hand.length % 3 !== 2;
      if (needsDrawForHuman) {
        const tile = drawForCurrentPlayer(hand);
        if (!tile) {
          settleHandDraw(match);
          return;
        }
      }
      if (hand.turnDeadline === null) {
        hand.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
        return;
      }
      if (Date.now() < hand.turnDeadline) return;
      // 타임아웃 — 자리비움으로 보고 이번 턴만 AI 휴리스틱으로 대신 진행(재접속하면 다시 직접 조작)
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

    if (match.rules.playerCount === 3 && player.hand.some((t) => t.kind === WINDS.N)) {
      declareKitaInMatch(match, seat);
      if (!instant) {
        hand.aiPauseUntil = Date.now() + AI_TURN_DELAY_MS;
        return;
      }
      continue;
    }

    if (declareRiichiPreview(match, seat)) {
      declareRiichi(match, seat);
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
