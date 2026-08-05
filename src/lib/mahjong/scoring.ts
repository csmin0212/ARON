import type { PaymentResult, RuleConfig, ScoreResult, Tile, WinContext, YakuResult } from "./types";
import { findWaitCandidates, isChiitoitsu, isKokushi } from "./decompose";
import { calcFu } from "./fu";
import { chiitoitsuYaku, chuurenPoutouYaku, evaluateYaku, isMenzenHand, kokushiYaku, tenhouChiihouYaku } from "./yaku";
import { isHonor, nextDoraKind, suitOf, toCounts } from "./tiles";

function allTiles(ctx: WinContext): Tile[] {
  return [...ctx.concealedTiles, ...ctx.melds.flatMap((m) => m.tiles)];
}

function countDora(tiles: Tile[], indicators: number[]): number {
  if (indicators.length === 0) return 0;
  const counts = toCounts(tiles);
  return indicators.reduce((sum, ind) => sum + counts[nextDoraKind(ind)], 0);
}

function countAka(tiles: Tile[]): number {
  return tiles.filter((t) => t.aka).length;
}

const LIMIT_TABLE: { minHan: number; name: string; base: number }[] = [
  { minHan: 13, name: "역만", base: 8000 },
  { minHan: 11, name: "삼배만", base: 6000 },
  { minHan: 8, name: "배만", base: 4000 },
  { minHan: 6, name: "하네만", base: 3000 },
  { minHan: 5, name: "만관", base: 2000 },
];

function basePointsFor(han: number, fu: number, rules: RuleConfig): { base: number; limitName: string | null } {
  for (const tier of LIMIT_TABLE) {
    if (han >= tier.minHan) return { base: tier.base, limitName: tier.name };
  }
  const raw = fu * Math.pow(2, 2 + han);
  if (raw >= 2000) return { base: 2000, limitName: "만관" };
  if (rules.kiriageMangan && ((han === 4 && fu === 30) || (han === 3 && fu === 60))) {
    return { base: 2000, limitName: "만관" };
  }
  return { base: raw, limitName: null };
}

function roundUp100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

export function paymentsFor(
  basePoints: number,
  isDealer: boolean,
  tsumo: boolean,
  honba: number,
  playerCount: 3 | 4,
): PaymentResult {
  if (tsumo) {
    const nonDealerCount = playerCount - 1;
    if (isDealer) {
      const each = roundUp100(basePoints * 2) + honba * 100;
      return { fromDealer: 0, fromNonDealer: each, ronPayer: 0, total: each * nonDealerCount };
    }
    const fromDealer = roundUp100(basePoints * 2) + honba * 100;
    const fromNonDealer = roundUp100(basePoints * 1) + honba * 100;
    return { fromDealer, fromNonDealer, ronPayer: 0, total: fromDealer + fromNonDealer * (nonDealerCount - 1) };
  }
  const ronPayer = roundUp100(basePoints * (isDealer ? 6 : 4)) + honba * 300;
  return { fromDealer: 0, fromNonDealer: 0, ronPayer, total: ronPayer };
}

function chuurenCheck(concealedTiles: Tile[], winKind: number): { qualifies: boolean; pure: boolean } {
  if (isHonor(winKind)) return { qualifies: false, pure: false };
  const counts = toCounts(concealedTiles);
  const suit = suitOf(winKind);
  const base = suit === "m" ? 0 : suit === "p" ? 9 : 18;
  for (let i = 0; i < 34; i++) {
    if ((i < base || i >= base + 9) && counts[i] > 0) return { qualifies: false, pure: false };
  }
  const c = counts.slice(base, base + 9);
  if (c.reduce((a, b) => a + b, 0) !== 14) return { qualifies: false, pure: false };
  if (c[0] < 3 || c[8] < 3) return { qualifies: false, pure: false };
  for (let i = 1; i < 8; i++) if (c[i] < 1) return { qualifies: false, pure: false };

  const counts13 = counts.slice();
  counts13[winKind]--;
  const c13 = counts13.slice(base, base + 9);
  const pure = c13[0] === 3 && c13[8] === 3 && c13.slice(1, 8).every((n) => n === 1);
  return { qualifies: true, pure };
}

function finalize(
  yakuList: YakuResult[],
  fu: number,
  doraCount: number,
  uraDoraCount: number,
  akaCount: number,
  ctx: WinContext,
  isDealer: boolean,
  waitShape: ScoreResult["waitShape"],
  decomposition: ScoreResult["decomposition"],
): ScoreResult {
  const yakumanEntries = yakuList.filter((y) => y.yakuman);
  if (yakumanEntries.length > 0) {
    const multiplier = yakumanEntries.reduce((sum, y) => sum + y.yakumanMultiplier, 0);
    return {
      han: 13 * multiplier,
      fu: 0,
      yaku: yakumanEntries,
      doraCount: 0,
      uraDoraCount: 0,
      akaCount: 0,
      basePoints: 8000 * multiplier,
      limitName: "역만",
      waitShape,
      decomposition,
    };
  }

  const han = yakuList.reduce((sum, y) => sum + y.han, 0) + doraCount + uraDoraCount + akaCount;
  const { base, limitName } = basePointsFor(han, fu, ctx.rules);
  return {
    han,
    fu,
    yaku: yakuList,
    doraCount,
    uraDoraCount,
    akaCount,
    basePoints: base,
    limitName,
    waitShape,
    decomposition,
  };
}

export function scoreWin(ctx: WinContext, isDealer: boolean): ScoreResult | null {
  const tiles = allTiles(ctx);
  const dora = countDora(tiles, ctx.doraIndicators);
  const uradora = ctx.riichi ? countDora(tiles, ctx.uraDoraIndicators) : 0;
  const aka = ctx.rules.akadora ? countAka(tiles) : 0;

  const kokushi = isKokushi(ctx.concealedTiles);
  if (kokushi.complete && ctx.melds.length === 0) {
    const thirteenWait = toCounts(ctx.concealedTiles)[ctx.winTile.kind] >= 2;
    return finalize(
      kokushiYaku(thirteenWait),
      0,
      0,
      0,
      0,
      ctx,
      isDealer,
      "tanki",
      { sets: [], pairKind: kokushi.pairKind },
    );
  }

  const chuuren = ctx.melds.length === 0 ? chuurenCheck(ctx.concealedTiles, ctx.winTile.kind) : { qualifies: false, pure: false };
  if (chuuren.qualifies) {
    return finalize(chuurenPoutouYaku(chuuren.pure), 0, 0, 0, 0, ctx, isDealer, "tanki", { sets: [], pairKind: -1 });
  }

  if (ctx.melds.length === 0 && isChiitoitsu(ctx.concealedTiles)) {
    const counts = toCounts(ctx.concealedTiles);
    const pairKinds: number[] = [];
    counts.forEach((n, k) => {
      if (n === 2) pairKinds.push(k);
    });
    const sets = pairKinds
      .filter((k) => k !== ctx.winTile.kind)
      .map((k) => ({ type: "triplet" as const, kind: k, open: false }));
    return finalize(
      chiitoitsuYaku(),
      25,
      dora,
      uradora,
      aka,
      ctx,
      isDealer,
      "tanki",
      { sets, pairKind: ctx.winTile.kind },
    );
  }

  const candidates = findWaitCandidates(ctx.concealedTiles, ctx.melds, ctx.winTile.kind);
  if (candidates.length === 0) return null;

  const menzen = isMenzenHand(ctx.melds);
  let best: ScoreResult | null = null;

  for (const candidate of candidates) {
    const yakuList = evaluateYaku(candidate, ctx);
    if (yakuList.length === 0) continue; // 역 없이는 승리 불가(役無し)
    const fu = calcFu({
      decomposition: candidate.decomposition,
      winBlockIndex: candidate.winBlockIndex,
      waitShape: candidate.waitShape,
      tsumo: ctx.tsumo,
      isMenzen: menzen,
      seatWind: ctx.seatWind,
      roundWind: ctx.roundWind,
    });
    const result = finalize(
      yakuList,
      fu,
      dora,
      uradora,
      aka,
      ctx,
      isDealer,
      candidate.waitShape,
      candidate.decomposition,
    );
    if (!best || compareScore(result, best) > 0) best = result;
  }

  if (best && (ctx.tenhou || ctx.chiihou) && !best.yaku.some((y) => y.yakuman)) {
    const bonus = tenhouChiihouYaku(isDealer);
    return finalize(
      [...best.yaku, ...bonus],
      best.fu,
      best.doraCount,
      best.uraDoraCount,
      best.akaCount,
      ctx,
      isDealer,
      best.waitShape,
      best.decomposition,
    );
  }

  return best;
}

function compareScore(a: ScoreResult, b: ScoreResult): number {
  if (a.han !== b.han) return a.han - b.han;
  return a.fu - b.fu;
}
