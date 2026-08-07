// 마작 엔진 1단계 셀프테스트. 실행: npm run mahjong:selftest
import {
  DEFAULT_RULES_4P,
  DEFAULT_RULES_3P,
  WINDS,
  DRAGONS,
  scoreWin,
  paymentsFor,
  buildFullSet,
  dealWall,
  declareKita,
  isChiAllowed,
  TIERS_3P,
  TIERS_4P,
  pointsToGold,
  settleAiCappedGold,
  DAILY_AI_GOLD_CAP,
  createMatch,
  pump,
  computeStats,
  tierForPoints,
  legalActionsFor,
  declareRiichi,
  performDiscard,
  isFuriten,
  declareKyuushu,
  submitCallResponse,
  settleHandDraw,
  canAnkanWhileRiichi,
  checkWinAtDraw,
  shanten,
  toCounts,
  parseMatchState,
  tenpaiInfoFor,
  type Tile,
  type WinContext,
} from "../src/lib/mahjong";

let passCount = 0;
let failCount = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passCount++;
    console.log(`  PASS  ${name}`);
  } else {
    failCount++;
    console.log(`  FAIL  ${name}`);
    console.log(`        기대값: ${JSON.stringify(expected)}`);
    console.log(`        실제값: ${JSON.stringify(actual)}`);
  }
}

function t(kind: number, aka = false): Tile {
  return { kind, aka };
}

const M = (n: number) => n - 1; // 1m..9m -> 0..8
const P = (n: number) => 8 + n; // 1p..9p -> 9..17
const S = (n: number) => 17 + n; // 1s..9s -> 18..26

function baseCtx(overrides: Partial<WinContext>): WinContext {
  return {
    winTile: t(0),
    tsumo: false,
    seatWind: WINDS.E,
    roundWind: WINDS.E,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    haitei: false,
    houtei: false,
    rinshan: false,
    chankan: false,
    doraIndicators: [],
    uraDoraIndicators: [],
    melds: [],
    concealedTiles: [],
    honba: 0,
    kyotaku: 0,
    rules: DEFAULT_RULES_4P,
    ...overrides,
  };
}

console.log("== 1. 리치+핀후+츠모+도라1 == 4판20부");
{
  const concealed = [
    t(M(2)), t(M(3)), t(M(4)),
    t(P(5)), t(P(6)), t(P(7)),
    t(P(7)), t(P(8)), t(P(9)),
    t(S(4)), t(S(4)),
    t(S(3)), t(S(4)), t(S(5)),
  ];
  const ctx = baseCtx({
    winTile: t(S(3)),
    tsumo: true,
    riichi: true,
    doraIndicators: [M(1)], // 표시패 2m -> 도라 3m
    concealedTiles: concealed,
  });
  const result = scoreWin(ctx, true);
  check("한판수", result?.han, 4);
  check("부수", result?.fu, 20);
}

console.log("== 2. 탕야오+산쇼쿠도준(멘젠) == 3판 (핀후 없이, 칸짱 대기)");
{
  const concealed = [
    t(M(2)), t(M(3)), t(M(4)),
    t(P(2)), t(P(4)),
    t(S(2)), t(S(3)), t(S(4)),
    t(S(6)), t(S(7)), t(S(8)),
    t(P(5)), t(P(5)),
    t(P(3)),
  ];
  const ctx = baseCtx({
    winTile: t(P(3)),
    tsumo: false,
    concealedTiles: concealed,
  });
  const result = scoreWin(ctx, false);
  check("한판수", result?.han, 3);
}

console.log("== 3. 치또이츠 == 고정 25부");
{
  const concealed = [
    t(M(1)), t(M(1)),
    t(M(3)), t(M(3)),
    t(P(5)), t(P(5)),
    t(P(7)), t(P(7)),
    t(S(2)), t(S(2)),
    t(S(4)), t(S(4)),
    t(WINDS.E), t(WINDS.E),
  ];
  const ctx = baseCtx({ winTile: t(WINDS.E), tsumo: true, concealedTiles: concealed });
  const result = scoreWin(ctx, false);
  check("부수", result?.fu, 25);
  check("치또이츠 역 포함", result?.yaku.some((y) => y.name === "치또이츠"), true);
}

console.log("== 4. 코쿠시무소 13면대기 == 역만(더블)");
{
  const targets = [M(1), M(9), P(1), P(9), S(1), S(9), WINDS.E, WINDS.S, WINDS.W, WINDS.N, DRAGONS.HAKU, DRAGONS.HATSU, DRAGONS.CHUN];
  const concealed = [...targets.map((k) => t(k)), t(M(1))];
  const ctx = baseCtx({ winTile: t(M(1)), tsumo: true, concealedTiles: concealed });
  const result = scoreWin(ctx, false);
  check("역만 배수", result?.yaku[0]?.yakumanMultiplier, 2);
  check("기본점", result?.basePoints, 16000);
}

console.log("== 5. 4판30부 경계 == 만관 캡 미적용(작혼 기본값)");
{
  const concealed = [
    t(P(2)), t(P(3)), t(P(4)),
    t(P(2)), t(P(3)), t(P(4)),
    t(S(4)), t(S(5)), t(S(6)),
    t(S(6)), t(S(7)),
    t(M(5)), t(M(5)),
    t(S(8)),
  ];
  const ctx = baseCtx({
    winTile: t(S(8)),
    tsumo: false,
    riichi: true,
    concealedTiles: concealed,
  });
  const result = scoreWin(ctx, false);
  check("한판수", result?.han, 4);
  check("부수", result?.fu, 30);
  check("기본점(만관 캡 미적용)", result?.basePoints, 1920);
  check("한정 이름 없음", result?.limitName, null);
}

console.log("== 6. 지불 분할 (딜러 론 하네만 / 비딜러 츠모 만관) ==");
{
  const dealerRon = paymentsFor(3000, true, false, 0, 4);
  check("딜러 론 하네만 방총액", dealerRon.ronPayer, 18000);

  const nonDealerTsumoMangan = paymentsFor(2000, false, true, 0, 4);
  check("비딜러 츠모 만관 - 친 지불", nonDealerTsumoMangan.fromDealer, 4000);
  check("비딜러 츠모 만관 - 자 지불", nonDealerTsumoMangan.fromNonDealer, 2000);
  check("비딜러 츠모 만관 - 총액", nonDealerTsumoMangan.total, 8000);
}

console.log("== 7. 3인마작(사마) 룰 ==");
{
  const wall = buildFullSet(3, () => 0.5);
  const manKinds = new Set(wall.filter((tile) => tile.kind < 9).map((tile) => tile.kind));
  check("사마 만즈는 1/9만 존재", [...manKinds].sort((a, b) => a - b), [0, 8]);
  check("사마 총 패 수", wall.length, 108);
  check("사마 치 콜 불가", isChiAllowed(3), false);
  check("4인 치 콜 가능", isChiAllowed(4), true);

  const { hands, wall: dealtWall } = dealWall(3);
  const hand = hands[0];
  if (!hand.some((tile) => tile.kind === WINDS.N)) hand.push(t(WINDS.N));
  const before = hand.length;
  const kita = declareKita(hand, dealtWall);
  check("발북 제거됨", kita?.removed.kind, WINDS.N);
  check("발북 후 손패 장수 유지", hand.length, before);
  check("발북 후 왕패 14장 유지", dealtWall.deadWall.length, 14);
}

console.log("== 8. 골드 경제 ==");
{
  check("3인 저가 티어 환산", pointsToGold(35000, TIERS_3P.low), 35);
  check("4인 고가 티어 환산", pointsToGold(25000, TIERS_4P.high), 250);

  const clamp1 = settleAiCappedGold({ day: "2026-08-05", earned: DAILY_AI_GOLD_CAP - 20 }, "2026-08-05", 50);
  check("일일 상한 클램프", clamp1.payableGain, 20);
  check("일일 상한 클램프 후 누적", clamp1.state.earned, DAILY_AI_GOLD_CAP);

  const loss = settleAiCappedGold({ day: "2026-08-05", earned: 80 }, "2026-08-05", -30);
  check("AI 일일 상한값", DAILY_AI_GOLD_CAP, 100);
  check("손실은 상한 없음", loss.payableGain, -30);

  const newDay = settleAiCappedGold({ day: "2026-08-04", earned: 90 }, "2026-08-05", 50);
  check("날짜 바뀌면 초기화", newDay.state.earned, 50);
}

console.log("== 9. 역 없는 패 == 화료 불가(null)");
{
  // 전부 시퀀스 + 요구패 없음 + 오픈 없음이지만 역패도 없고 탕야오 조건(2~8만)도 깨는 형태로는 안 나옴 —
  // 대신 오픈 멘즈(포함 치 없음) 상태에서 야쿠하이도 탕야오도 핀후도 성립 안 하는 혼일색/역패 없는 형태로 검증.
  // 111p 234p 456p 789p 22m (핀후 아님: 트리플렛 포함, 탕야오 아님: 1p/9p 요구패, 역패 아님, 찬타/혼이츠 등도 불성립)
  const concealed = [
    t(P(1)), t(P(1)), t(P(1)),
    t(P(2)), t(P(3)), t(P(4)),
    t(P(5)), t(P(6)), t(P(7)),
    t(P(7)), t(P(8)), t(P(9)),
    t(M(2)), t(M(2)),
  ];
  const ctx = baseCtx({ winTile: t(P(9)), tsumo: false, concealedTiles: concealed });
  const result = scoreWin(ctx, false);
  check("역 없으면 null", result, null);
}

console.log("== 10. 역패(트리플렛) + 토이토이 (샤보 대기, 안커 3개) ==");
{
  // 안커 3개(중/3m/7p) + 5s는 샤보 대기로 론 완성 -> 오픈 취급되어 스안커(역만)로는 안 잡혀야 함
  const concealed = [
    t(DRAGONS.CHUN), t(DRAGONS.CHUN), t(DRAGONS.CHUN),
    t(M(3)), t(M(3)), t(M(3)),
    t(P(7)), t(P(7)), t(P(7)),
    t(S(5)), t(S(5)), t(S(5)),
    t(WINDS.N), t(WINDS.N),
  ];
  const ctx = baseCtx({ winTile: t(S(5)), tsumo: false, concealedTiles: concealed });
  const result = scoreWin(ctx, false);
  const names = result?.yaku.map((y) => y.name) ?? [];
  check("역패 중 포함", names.includes("역패 중"), true);
  check("토이토이 포함", names.includes("토이토이"), true);
  check("산안커 포함(안커 3개)", names.includes("산안커"), true);
  check("스안커(역만) 아님 - 샤보 론이라 안커 3개로 집계", result?.yaku.some((y) => y.yakuman), false);
}

console.log("== 11. 혼이츠 + 친이츠 ==");
{
  const honitsu = [
    t(M(1)), t(M(2)), t(M(3)),
    t(M(4)), t(M(5)), t(M(6)),
    t(WINDS.E), t(WINDS.E), t(WINDS.E),
    t(M(7)), t(M(7)), t(M(7)),
    t(M(8)), t(M(9)),
  ];
  const ctx1 = baseCtx({ winTile: t(M(7)), tsumo: false, concealedTiles: honitsu });
  const r1 = scoreWin(ctx1, false);
  check("혼이츠 포함", r1?.yaku.some((y) => y.name === "혼이츠"), true);

  const chinitsu = [
    t(M(1)), t(M(2)), t(M(3)),
    t(M(4)), t(M(5)), t(M(6)),
    t(M(3)), t(M(3)), t(M(3)),
    t(M(7)), t(M(7)), t(M(7)),
    t(M(8)), t(M(9)),
  ];
  const ctx2 = baseCtx({ winTile: t(M(7)), tsumo: false, concealedTiles: chinitsu });
  const r2 = scoreWin(ctx2, false);
  check("친이츠 포함", r2?.yaku.some((y) => y.name === "친이츠"), true);
}

console.log("== 12. AI 전용 4인 매치 풀시뮬레이션 (동풍전) ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: null, isAi: true },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  let guard = 0;
  while (!match.finished && guard++ < 2000) pump(match, { instant: true });
  check("매치 종료됨(무한루프 없음)", match.finished, true);
  check("최종 결과 4명", match.finalResult?.length, 4);
  const pointSum = match.finalResult?.reduce((sum, r) => sum + r.rawPoints, 0);
  check("점수 합 보존(4인 25000x4)", pointSum, 100000);
}

console.log("== 13. AI 전용 3인 매치 풀시뮬레이션 (사마) ==");
{
  const match = createMatch(DEFAULT_RULES_3P, 35000, [
    { seat: 0, userId: null, isAi: true },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
  ]);
  let guard = 0;
  while (!match.finished && guard++ < 2000) pump(match, { instant: true });
  check("사마 매치 종료됨(무한루프 없음)", match.finished, true);
  check("최종 결과 3명", match.finalResult?.length, 3);
  const pointSum = match.finalResult?.reduce((sum, r) => sum + r.rawPoints, 0);
  check("점수 합 보존(3인 35000x3)", pointSum, 105000);
}

console.log("== 14. AI 전용 반장전(4인) == 동+남 라운드 진행 확인");
{
  const match = createMatch(
    DEFAULT_RULES_4P,
    25000,
    [
      { seat: 0, userId: null, isAi: true },
      { seat: 1, userId: null, isAi: true },
      { seat: 2, userId: null, isAi: true },
      { seat: 3, userId: null, isAi: true },
    ],
    { matchLength: "hanchan" },
  );
  let guard = 0;
  let sawSouthRound = false;
  while (!match.finished && guard++ < 4000) {
    pump(match, { instant: true });
    if (match.hand && match.roundWind === WINDS.S) sawSouthRound = true;
  }
  check("반장전 종료됨(무한루프 없음)", match.finished, true);
  check("남 라운드까지 진행됨", sawSouthRound, true);
  const pointSum = match.finalResult?.reduce((sum, r) => sum + r.rawPoints, 0);
  check("반장전 점수 합 보존", pointSum, 100000);
}

console.log("== 15. 턴 타임아웃(이탈 복구) ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const dealerSeat = match.hand!.turn;
  const handBefore = match.hand!.players[dealerSeat].hand.length;
  const discardsBefore = match.hand!.players[dealerSeat].discards.length;
  check("사람 차례는 자동 진행 안 됨", handBefore, 14);
  check("타임아웃 설정됨", match.hand!.turnDeadline !== null, true);

  match.hand!.turnDeadline = Date.now() - 1000; // 타임아웃 경과를 흉내
  pump(match);
  const discardsAfter = match.hand ? match.hand.players[dealerSeat].discards.length : discardsBefore + 1;
  check("타임아웃 후 AI가 대신 버림(discards 증가)", discardsAfter > discardsBefore, true);
}

console.log("== 16. AI 페이싱(한 번에 한 수만) ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: null, isAi: true },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const totalAfterOne = match.hand!.players.reduce((sum, p) => sum + p.discards.length, 0);
  check("첫 pump 는 한 수만", totalAfterOne, 1);

  pump(match); // 텀이 안 지났으므로 아무 일도 없어야 함
  const totalAfterBlocked = match.hand!.players.reduce((sum, p) => sum + p.discards.length, 0);
  check("텀 안에서는 진행 안 됨", totalAfterBlocked, 1);

  match.hand!.aiPauseUntil = Date.now() - 1; // 텀 경과를 흉내
  pump(match);
  const totalAfterResume = match.hand!.players.reduce((sum, p) => sum + p.discards.length, 0);
  check("텀 지나면 다음 한 수 진행", totalAfterResume, 2);
}

console.log("== 17. 랭크 집계 ==");
{
  const records = [
    { placement: 1, goldDelta: 20, playerCount: 4 },
    { placement: 1, goldDelta: 15, playerCount: 4 },
    { placement: 4, goldDelta: -30, playerCount: 4 },
    { placement: 2, goldDelta: 5, playerCount: 3 },
  ];
  const stats = computeStats(records);
  // 30+30-30+0 = 30
  check("랭크 포인트 합산", stats.rankPoints, 30);
  check("게임 수", stats.gamesPlayed, 4);
  check("1위 횟수", stats.placementCounts[0], 2);
  check("등급 티어(초심자)", tierForPoints(30).key, "novice");
  check("등급 티어(고수 경계)", tierForPoints(600).key, "master");
}

console.log("== 18. 리치 규칙 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const me = match.hand!.players[0];

  // 확실히 텐파이인 손패로 바꿔치기: 234m 567m 234p 55p + 9s(버리면 텐파이)
  me.hand = [
    t(M(2)), t(M(3)), t(M(4)),
    t(M(5)), t(M(6)), t(M(7)),
    t(P(2)), t(P(3)), t(P(4)),
    t(P(5)), t(P(5)), t(S(3)), t(S(4)),
    t(S(9)),
  ];
  match.hand!.turn = 0;
  const la = legalActionsFor(match, 0);
  check("리치 가능", la.canRiichi, true);
  check("리치용 버림 후보 있음", la.riichiTiles.length > 0, true);

  const pointsBefore = me.points;
  const kyotakuBefore = match.kyotaku;
  const ok = declareRiichi(match, 0, la.riichiTiles[0]);
  check("리치 선언 성공", ok, true);
  check("리치 1000점 지불", pointsBefore - match.hand!.players[0].points === 1000 || pointsBefore - me.points === 1000, true);
  check("공탁 1개 증가", match.kyotaku, kyotakuBefore + 1);
}

console.log("== 19. 리치 중에는 퐁/치/깡 불가 (론만) ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: "u1", isAi: false },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const hand = match.hand!;
  // 0번이 리치 상태이고 5통을 두 장 들고 있게 만든다 → 퐁 자격이 있어 보이지만 막혀야 함
  hand.players[0].riichi = true;
  hand.players[0].hand = [
    t(P(5)), t(P(5)), t(M(2)), t(M(3)), t(M(4)),
    t(M(5)), t(M(6)), t(M(7)), t(S(2)), t(S(3)),
    t(S(4)), t(S(6)), t(S(6)),
  ];
  // 3번(상가)이 5통을 버린다
  hand.turn = 3;
  hand.players[3].hand.push(t(P(5)));
  performDiscard(match, 3, hand.players[3].hand.length - 1);

  const offered = match.hand?.pendingCall?.options?.[0];
  check("리치자에게 퐁 제안 안 됨", offered?.pon ?? false, false);
  check("리치자에게 치 제안 안 됨", offered?.chi ?? false, false);
  check("리치자에게 깡 제안 안 됨", offered?.kan ?? false, false);
}

console.log("== 20. 후리텐 — 내 버림패에 대기패가 있으면 론 불가 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: "u1", isAi: false },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const hand = match.hand!;
  // 0번: 3s/6s 양면 대기인데, 이미 3s 를 버린 적이 있다 → 후리텐
  hand.players[0].hand = [
    t(M(2)), t(M(3)), t(M(4)), t(M(5)), t(M(6)), t(M(7)),
    t(P(2)), t(P(3)), t(P(4)), t(P(5)), t(P(5)),
    t(S(4)), t(S(5)),
  ];
  hand.players[0].discards = [t(S(3))];
  check("후리텐 판정", isFuriten(hand, 0), true);
}

console.log("== 21. 일발 / 더블리치 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const hand = match.hand!;
  const seat = hand.turn;
  const p = hand.players[seat];
  p.hand = [
    t(M(2)), t(M(3)), t(M(4)), t(M(5)), t(M(6)), t(M(7)),
    t(P(2)), t(P(3)), t(P(4)), t(P(5)), t(P(5)),
    t(S(3)), t(S(4)), t(S(9)),
  ];
  hand.turn = seat;
  hand.firstGoAround = true;
  p.discards = [];
  const la = legalActionsFor(match, seat);
  declareRiichi(match, seat, la.riichiTiles[0]);
  check("더블리치 플래그", match.hand!.players[seat].doubleRiichi, true);
  // 리치 선언 직후 아무도 안 울었으면 일발 구간이 살아있어야 한다.
  // (누가 울면 깨지는 게 정상이므로 그 경우는 false 가 맞다 — 22번에서 따로 검증)
  const somebodyCalled = match.hand!.players.some((pl) => pl.melds.length > 0);
  check("일발 구간 활성(울음 없을 때)", match.hand!.players[seat].ippatsuActive, !somebodyCalled);
}

console.log("== 22. 울면 일발이 깨진다 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: "u1", isAi: false },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const hand = match.hand!;
  hand.players[0].riichi = true;
  hand.players[0].ippatsuActive = true;
  // 1번이 5통을 두 장 들고 있고, 3번이 5통을 버려서 퐁이 성립하게
  hand.players[1].hand = [
    t(P(5)), t(P(5)), t(M(2)), t(M(3)), t(M(4)),
    t(M(5)), t(M(6)), t(M(7)), t(S(2)), t(S(3)),
    t(S(4)), t(S(6)), t(S(7)),
  ];
  hand.turn = 3;
  hand.players[3].hand.push(t(P(5)));
  performDiscard(match, 3, hand.players[3].hand.length - 1);
  // 1번(사람)이 퐁을 선택
  if (match.hand?.pendingCall) submitCallResponse(match, 1, "pon");
  check("울음 후 일발 해제", match.hand!.players[0].ippatsuActive, false);
  check("첫 순바 종료", match.hand!.firstGoAround, false);
}

console.log("== 23. 구종구패 (도중 유국) ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  pump(match);
  const hand = match.hand!;
  const seat = hand.turn;
  hand.players[seat].hand = [
    t(M(1)), t(M(9)), t(P(1)), t(P(9)), t(S(1)), t(S(9)),
    t(WINDS.E), t(WINDS.S), t(WINDS.W), t(WINDS.N),
    t(DRAGONS.HAKU), t(DRAGONS.HATSU), t(DRAGONS.CHUN), t(M(5)),
  ];
  hand.players[seat].discards = [];
  hand.firstGoAround = true;
  check("구종구패 가능", legalActionsFor(match, seat).canKyuushu, true);
  const before = match.honba;
  declareKyuushu(match, seat);
  check("도중 유국 처리", match.lastHandSummary?.type, "abort");
  check("사유 = 구종구패", match.lastHandSummary?.abortReason, "kyuushu");
  check("점수 이동 없음", match.lastHandSummary?.deltas.every((d) => d === 0), true);
  check("혼바 증가", match.honba, before + 1);
}

console.log(`\n${passCount}개 통과, ${failCount}개 실패`);
console.log("== 24. 토비 — 마이너스면 즉시 종료 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: true },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  match.players[1].points = -500;
  match.hand!.players[1].points = -500;
  settleHandDraw(match);
  check("토비로 대국 종료", match.finished, true);
  check("최종 결과 생성됨", match.finalResult !== null, true);
}

console.log("== 25. 더블론 혼바는 머리 잡은 한 명만 ==");
{
  const noHonba = paymentsFor(1000, false, false, 0, 4).ronPayer;
  const withHonba = paymentsFor(1000, false, false, 2, 4).ronPayer;
  check("혼바 2본 = +600", withHonba - noHonba, 600);
}

console.log("== 26. 리치 중 안깡 — 대기가 안 변할 때만 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const p = match.hand!.players[0];
  p.riichi = true;
  p.melds = [];
  // 222m 333m 444m 567p 9s + 방금 뽑은 2m → 2m 안깡해도 9s 단기 대기 그대로
  p.hand = [
    t(M(2)), t(M(2)), t(M(2)), t(M(3)), t(M(3)), t(M(3)),
    t(M(4)), t(M(4)), t(M(4)), t(P(5)), t(P(6)), t(P(7)),
    t(S(9)), t(M(2)),
  ];
  check("대기 안 변하면 안깡 허용", canAnkanWhileRiichi(p, M(2)), true);
  check("송깡(방금 뽑은 패가 아님) 금지", canAnkanWhileRiichi(p, M(3)), false);
}

console.log("== 27. 천화 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: null, isAi: true },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const hand = match.hand!;
  const dealer = hand.players.find((pl) => pl.isDealer)!;
  hand.turn = dealer.seat;
  hand.firstGoAround = true;
  dealer.discards = [];
  dealer.melds = [];
  dealer.rinshanActive = false;
  dealer.hand = [
    t(M(2)), t(M(3)), t(M(4)), t(P(2)), t(P(3)), t(P(4)),
    t(S(2)), t(S(3)), t(S(4)), t(S(6)), t(S(7)), t(S(8)),
    t(P(9)), t(P(9)),
  ];
  const res = checkWinAtDraw(match);
  check("천화 성립", res?.yaku.some((y) => y.name === "천화"), true);
}

console.log("== 28. 샹텐 — 작(雀頭)이 뒤쪽 종류에 있어도 읽어야 한다 ==");
{
  // 333m 444m 567p + 9s9s : 면자 4개가 먼저 차고 작이 마지막에 오는 형태.
  // 예전에는 melds>=4 에서 탐색을 끊어 화료/텐파이를 못 읽었다(후리텐·리치·AI 전부 영향).
  const done = [
    t(M(3)), t(M(3)), t(M(3)), t(M(4)), t(M(4)), t(M(4)),
    t(P(5)), t(P(6)), t(P(7)), t(S(9)), t(S(9)),
  ];
  check("면자1개 확정 + 작 뒤쪽 = 화료", shanten(toCounts(done), 1), -1);

  const tenpai = [
    t(M(2)), t(M(2)), t(M(2)), t(M(3)), t(M(3)), t(M(3)),
    t(M(4)), t(M(4)), t(M(4)), t(P(5)), t(P(6)), t(P(7)), t(S(9)),
  ];
  check("같은 형태 13장 = 텐파이", shanten(toCounts(tenpai), 0), 0);
}

console.log("== 29. 차례가 넘어가면 제한시간이 새로 잡힌다 ==");
{
  // 예전 버그: 콜을 모두 패스하고 턴이 넘어갈 때 turnDeadline 만 지우고
  // turnStartedAt 을 안 지워서, 다음 사람이 패를 받자마자 자동으로 버려졌다.
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: "u1", isAi: false },
    { seat: 2, userId: "u2", isAi: false },
    { seat: 3, userId: "u3", isAi: false },
  ]);
  pump(match);
  const first = match.hand!.turn;
  const before = match.hand!.players[(first + 1) % 4].discards.length;
  performDiscard(match, first, 0);
  // 버린 패에 울기 대기창이 뜨면 차례가 안 넘어가는 게 정상이다 — 전원 패스시켜 넘긴다
  const pc = match.hand!.pendingCall;
  if (pc) pc.eligibleSeats.forEach((sx) => submitCallResponse(match, sx, "pass"));
  pump(match);
  const nextSeat = match.hand!.turn;
  check("차례가 다음 사람에게 넘어감", nextSeat, (first + 1) % 4);
  check("새 제한시간이 잡힘", match.hand!.turnDeadline !== null, true);
  check("넘어가자마자 자동 버림 안 됨", match.hand!.players[nextSeat].discards.length, before);
  check("아직 시간 남음", match.hand!.turnDeadline! > Date.now(), true);
}

console.log("== 30. 후리텐 — 14장(내 차례)에서도 올바르게 판정 ==");
{
  // 예전 버그: 14장 손패에 그대로 대기 계산을 돌려서(=15장짜리 형태) 엉뚱하게 후리텐이 떴다.
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const hand = match.hand!;
  const p = hand.players[0];
  p.melds = [];
  // 234p 567p 234s 567s + 9s9s 텐파이(9s 대기), 버림패엔 대기패가 없다
  p.hand = [
    t(P(2)), t(P(3)), t(P(4)), t(P(5)), t(P(6)), t(P(7)),
    t(S(2)), t(S(3)), t(S(4)), t(S(5)), t(S(6)), t(S(7)),
    t(S(9)),
  ];
  p.discards = [t(M(1)), t(WINDS.W)];
  check("13장 기준 후리텐 아님", isFuriten(hand, 0), false);

  // 뽑은 패 한 장을 더 든 상태(내 차례, 14장) — 여전히 후리텐이 아니어야 한다
  p.hand = [...p.hand, t(M(9))];
  check("14장이어도 후리텐 아님", isFuriten(hand, 0), false);

  // 대기패(9s)를 내가 버린 적이 있으면 그때는 후리텐
  p.discards = [...p.discards, t(S(9))];
  check("대기패를 버렸으면 후리텐", isFuriten(hand, 0), true);
}

console.log("== 31. 리치 후보는 '종류'로 나온다 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const hand = match.hand!;
  const p = hand.players[0];
  p.melds = [];
  p.discards = [];
  p.riichi = false;
  hand.turn = 0;
  hand.pendingCall = null;
  // 234p 567p 234s 567s 9s + 뽑은 1m → 1m 버리면 9s 단기 텐파이
  p.hand = [
    t(P(2)), t(P(3)), t(P(4)), t(P(5)), t(P(6)), t(P(7)),
    t(S(2)), t(S(3)), t(S(4)), t(S(5)), t(S(6)), t(S(7)),
    t(S(9)), t(M(1)),
  ];
  const la = legalActionsFor(match, 0);
  check("리치 가능", la.canRiichi, true);
  check("리치 후보에 1m 포함(종류 기준)", la.riichiKinds.includes(M(1)), true);
}

console.log("== 32. 리치 중에는 기다리지 않고 바로 츠모기리 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const hand = match.hand!;
  const p = hand.players[0];
  p.riichi = true;
  p.melds = [];
  p.discards = [];
  // 234p 567p 234s 567s 9s 텐파이(9s 대기) + 뽑은 1m → 쯔모도 깡도 안 되니 즉시 버려야 한다
  p.hand = [
    t(P(2)), t(P(3)), t(P(4)), t(P(5)), t(P(6)), t(P(7)),
    t(S(2)), t(S(3)), t(S(4)), t(S(5)), t(S(6)), t(S(7)),
    t(S(9)), t(M(1)),
  ];
  hand.turn = 0;
  hand.pendingCall = null;
  hand.aiPauseUntil = null;
  hand.turnStartedAt = null;
  hand.turnDeadline = null;
  pump(match);
  const me = match.hand!.players[0];
  check("시간 안 기다리고 바로 버려짐", me.discards.length, 1);
  check("버린 건 방금 뽑은 패", me.discards[0].kind, M(1));
}

console.log("== 33. 예전 저장본(필드 없는 상태)도 읽혀야 한다 ==");
{
  // 배포 직후 진행 중이던 방이 터지지 않게 — 새로 생긴 필드가 없어도 기본값이 채워져야 한다
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const legacy = JSON.parse(JSON.stringify(match));
  delete legacy.timeRule;
  delete legacy.handSeq;
  delete legacy.hand.firstGoAround;
  delete legacy.hand.kanCount;
  for (const p of legacy.hand.players) {
    delete p.timeBankMs;
    delete p.ippatsuActive;
    delete p.riichiDiscardIndex;
  }
  const fixed = parseMatchState(JSON.stringify(legacy));
  check("읽기 성공", fixed !== null, true);
  check("timeRule 기본값 채움", fixed!.timeRule.baseSec > 0, true);
  check("handSeq 채움", fixed!.handSeq, 0);
  check("좌석 적립시간 채움", fixed!.hand!.players[0].timeBankMs > 0, true);
  // 채운 상태로 실제로 굴러가야 한다
  pump(fixed!);
  check("복구된 상태로 진행 가능", fixed!.hand !== null || fixed!.finished, true);
  check("깨진 JSON 은 null", parseMatchState("{oops"), null);
}

console.log("== 34. 대기 표시에 '역 없음' 이 붙는다 ==");
{
  const match = createMatch(DEFAULT_RULES_4P, 25000, [
    { seat: 0, userId: "u0", isAi: false },
    { seat: 1, userId: null, isAi: true },
    { seat: 2, userId: null, isAi: true },
    { seat: 3, userId: null, isAi: true },
  ]);
  const hand = match.hand!;
  const p = hand.players[0];
  hand.turn = 0;
  hand.pendingCall = null;
  p.discards = [];
  p.riichi = false;

  // 울어서 오픈 + 역이 안 붙는 형태: 치로 456m 를 울고, 남은 손패는 789s / 123p / 서(자풍·장풍 아님) 대기
  p.melds = [{ type: "chi", kind: M(4), tiles: [t(M(4)), t(M(5)), t(M(6))], calledFrom: 3 }];
  p.hand = [
    t(P(1)), t(P(2)), t(P(3)),
    t(S(7)), t(S(8)), t(S(9)),
    t(P(6)), t(P(7)), t(P(8)),
    t(WINDS.W),
  ];
  const info = tenpaiInfoFor(match, 0);
  check("텐파이로는 잡힘", info !== null, true);
  const west = info?.waits.find((w) => w.kind === WINDS.W);
  check("서 단기 대기 인식", west !== undefined, true);
  check("역이 없다고 표시", west?.hasYaku, false);

  // 샤보 대기: 中으로 나면 역패(삼원패 3장)라 역이 붙고, 9삭으로 나면 中은 머리라 역이 없다.
  // 같은 손패에서 대기패마다 갈리는 걸 확인.
  p.hand = [
    t(P(1)), t(P(2)), t(P(3)),
    t(P(6)), t(P(7)), t(P(8)),
    t(DRAGONS.CHUN), t(DRAGONS.CHUN),
    t(S(9)), t(S(9)),
  ];
  const info2 = tenpaiInfoFor(match, 0);
  const chun = info2?.waits.find((w) => w.kind === DRAGONS.CHUN);
  const s9 = info2?.waits.find((w) => w.kind === S(9));
  check("中으로 나면 역패 — 역 있음", chun?.hasYaku, true);
  check("9삭으로 나면 中은 머리 — 역 없음", s9?.hasYaku, false);
}

console.log(`
${passCount}개 통과, ${failCount}개 실패 (최종)`);
if (failCount > 0) process.exit(1);
