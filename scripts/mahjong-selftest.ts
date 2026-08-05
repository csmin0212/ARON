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
  createMatch,
  pump,
  computeStats,
  tierForPoints,
  legalActionsFor,
  declareRiichi,
  performDiscard,
  isFuriten,
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

  const clamp1 = settleAiCappedGold({ day: "2026-08-05", earned: 80 }, "2026-08-05", 50);
  check("일일 상한 클램프", clamp1.payableGain, 20);
  check("일일 상한 클램프 후 누적", clamp1.state.earned, 100);

  const loss = settleAiCappedGold({ day: "2026-08-05", earned: 80 }, "2026-08-05", -30);
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

console.log(`\n${passCount}개 통과, ${failCount}개 실패`);
if (failCount > 0) process.exit(1);
