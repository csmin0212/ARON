import type { HandDecomposition, WaitShape, WindKind } from "./types";
import { isDragon, isTerminalOrHonor } from "./tiles";

export interface FuContext {
  decomposition: HandDecomposition;
  winBlockIndex: number; // -1이면 작(雀頭)이 완성 블록
  waitShape: WaitShape;
  tsumo: boolean;
  isMenzen: boolean;
  seatWind: WindKind;
  roundWind: WindKind;
}

function isYakuhaiPair(pairKind: number, seatWind: WindKind, roundWind: WindKind): boolean {
  return isDragon(pairKind) || pairKind === seatWind || pairKind === roundWind;
}

function yakuhaiPairFu(pairKind: number, seatWind: WindKind, roundWind: WindKind): number {
  let fu = 0;
  if (isDragon(pairKind)) fu += 2;
  if (pairKind === seatWind) fu += 2;
  if (pairKind === roundWind) fu += 2;
  return fu;
}

export function isPinfuShape(
  decomposition: HandDecomposition,
  waitShape: WaitShape,
  isMenzen: boolean,
  seatWind: WindKind,
  roundWind: WindKind,
): boolean {
  return (
    isMenzen &&
    waitShape === "ryanmen" &&
    decomposition.sets.every((s) => s.type === "sequence") &&
    !isYakuhaiPair(decomposition.pairKind, seatWind, roundWind)
  );
}

export function calcFu(ctx: FuContext): number {
  const pinfu = isPinfuShape(ctx.decomposition, ctx.waitShape, ctx.isMenzen, ctx.seatWind, ctx.roundWind);
  if (pinfu) return ctx.tsumo ? 20 : 30;

  let fu = 20;
  if (ctx.tsumo) fu += 2;
  if (!ctx.tsumo && ctx.isMenzen) fu += 10;

  ctx.decomposition.sets.forEach((block, idx) => {
    if (block.type === "sequence") return;
    let isOpenForFu = block.open;
    if (idx === ctx.winBlockIndex && ctx.waitShape === "shanpon") {
      // 샤보 대기는 론이면 오픈(밍커) 취급, 츠모면 클로즈(안커) 취급 — 표준 부수 규칙
      isOpenForFu = !ctx.tsumo;
    }
    const terminalHonor = isTerminalOrHonor(block.kind);
    if (block.type === "triplet") {
      fu += isOpenForFu ? (terminalHonor ? 4 : 2) : terminalHonor ? 8 : 4;
    } else {
      fu += isOpenForFu ? (terminalHonor ? 16 : 8) : terminalHonor ? 32 : 16;
    }
  });

  if (isYakuhaiPair(ctx.decomposition.pairKind, ctx.seatWind, ctx.roundWind)) {
    fu += yakuhaiPairFu(ctx.decomposition.pairKind, ctx.seatWind, ctx.roundWind);
  }

  if (ctx.waitShape === "kanchan" || ctx.waitShape === "penchan" || ctx.waitShape === "tanki") {
    fu += 2;
  }

  return Math.ceil(fu / 10) * 10;
}
