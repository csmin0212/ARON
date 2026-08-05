import type { HandDecomposition, Meld, SetBlock, WaitShape, WinContext, YakuResult } from "./types";
import { isPinfuShape } from "./fu";
import type { WaitCandidate } from "./decompose";
import { isDragon, isHonor, isSimple, isTerminal, isTerminalOrHonor, isWind, numOf, suitOf } from "./tiles";

function yaku(name: string, han: number): YakuResult {
  return { name, han, yakuman: false, yakumanMultiplier: 0 };
}
function yakumanYaku(name: string, multiplier = 1): YakuResult {
  return { name, han: 0, yakuman: true, yakumanMultiplier: multiplier };
}

export function isMenzenHand(melds: Meld[]): boolean {
  return melds.every((m) => m.type === "ankan");
}

function suitsUsed(d: HandDecomposition): Set<string> {
  const s = new Set<string>();
  for (const b of d.sets) s.add(suitOf(b.kind));
  s.add(suitOf(d.pairKind));
  return s;
}

function hasHonor(d: HandDecomposition): boolean {
  return d.sets.some((b) => isHonor(b.kind)) || isHonor(d.pairKind);
}

function sequenceOrBlockAllSimple(b: SetBlock): boolean {
  if (b.type === "sequence") {
    return isSimple(b.kind) && isSimple(b.kind + 1) && isSimple(b.kind + 2);
  }
  return isSimple(b.kind);
}

function blockHasTerminalOrHonor(b: SetBlock): boolean {
  if (b.type === "sequence") return isTerminal(b.kind) || isTerminal(b.kind + 2); // 1-2-3 or 7-8-9만 해당
  return isTerminalOrHonor(b.kind);
}
function blockAllTerminal(b: SetBlock): boolean {
  if (b.type === "sequence") return false; // 런은 절대 전부 요구패일 수 없음
  return isTerminal(b.kind);
}

function countIipeikou(d: HandDecomposition, includeOpen: boolean): number {
  const seqs = d.sets.filter((b) => b.type === "sequence" && (includeOpen || !b.open));
  const seen = new Map<number, number>();
  for (const s of seqs) seen.set(s.kind, (seen.get(s.kind) ?? 0) + 1);
  let pairs = 0;
  for (const cnt of seen.values()) pairs += Math.floor(cnt / 2);
  return pairs;
}

function hasSanshokuDoujun(d: HandDecomposition): boolean {
  const byStart = new Map<number, Set<string>>();
  for (const b of d.sets) {
    if (b.type !== "sequence") continue;
    const start = numOf(b.kind);
    if (!byStart.has(start)) byStart.set(start, new Set());
    byStart.get(start)!.add(suitOf(b.kind));
  }
  for (const suits of byStart.values()) {
    if (suits.has("m") && suits.has("p") && suits.has("s")) return true;
  }
  return false;
}

function hasSanshokuDoukou(d: HandDecomposition): boolean {
  const byNum = new Map<number, Set<string>>();
  for (const b of d.sets) {
    if (b.type === "sequence") continue;
    const n = numOf(b.kind);
    if (!byNum.has(n)) byNum.set(n, new Set());
    byNum.get(n)!.add(suitOf(b.kind));
  }
  for (const suits of byNum.values()) {
    if (suits.has("m") && suits.has("p") && suits.has("s")) return true;
  }
  return false;
}

function hasIttsuu(d: HandDecomposition): boolean {
  const bySuit = new Map<string, Set<number>>();
  for (const b of d.sets) {
    if (b.type !== "sequence") continue;
    const s = suitOf(b.kind);
    if (!bySuit.has(s)) bySuit.set(s, new Set());
    bySuit.get(s)!.add(numOf(b.kind));
  }
  for (const starts of bySuit.values()) {
    if (starts.has(1) && starts.has(4) && starts.has(7)) return true;
  }
  return false;
}

function countAnkou(d: HandDecomposition, waitShape: WaitShape, winBlockIndex: number, tsumo: boolean): number {
  let count = 0;
  d.sets.forEach((b, idx) => {
    if (b.type !== "triplet" || b.open) return;
    if (idx === winBlockIndex && waitShape === "shanpon" && !tsumo) return; // 샤보 론은 오픈 취급
    count++;
  });
  return count;
}

function countKan(d: HandDecomposition): number {
  return d.sets.filter((b) => b.type === "kan").length;
}

function isGreenTile(kind: number): boolean {
  return kind === 19 || kind === 20 || kind === 21 || kind === 23 || kind === 25 || kind === 32;
}

export function evaluateYaku(candidate: WaitCandidate, ctx: WinContext): YakuResult[] {
  const d = candidate.decomposition;
  const menzen = isMenzenHand(ctx.melds);
  const results: YakuResult[] = [];

  // ── 역만 ──
  const yakumanResults: YakuResult[] = [];
  const dragonSets = d.sets.filter((b) => isDragon(b.kind) && b.type !== "sequence").length;
  if (dragonSets === 3) yakumanResults.push(yakumanYaku("다이산겐"));
  const windSets = d.sets.filter((b) => isWind(b.kind) && b.type !== "sequence");
  if (windSets.length === 4) yakumanResults.push(yakumanYaku("다이스시", 2));
  else if (windSets.length === 3 && isWind(d.pairKind)) yakumanResults.push(yakumanYaku("쇼스시"));
  if (d.sets.every((b) => b.type !== "sequence" && isHonor(b.kind)) && isHonor(d.pairKind)) {
    yakumanResults.push(yakumanYaku("쓰이소"));
  }
  if (d.sets.every((b) => blockAllTerminal(b)) && isTerminal(d.pairKind)) {
    yakumanResults.push(yakumanYaku("친로토"));
  }
  const ryuuiisou =
    d.sets.every((b) => (b.type === "sequence" ? b.kind === 19 : isGreenTile(b.kind))) && isGreenTile(d.pairKind);
  if (ryuuiisou) yakumanResults.push(yakumanYaku("류이소"));
  const ankouCount = countAnkou(d, candidate.waitShape, candidate.winBlockIndex, ctx.tsumo);
  if (ankouCount === 4) {
    const tanki = candidate.winBlockIndex === -1;
    yakumanResults.push(yakumanYaku("스안커", tanki ? 2 : 1));
  }
  if (countKan(d) === 4) yakumanResults.push(yakumanYaku("스칸츠"));

  if (yakumanResults.length > 0) {
    return yakumanResults; // 역만이 있으면 통상역은 무시
  }

  // ── 1판 ──
  if (ctx.doubleRiichi) results.push(yaku("더블리치", 2));
  else if (ctx.riichi) results.push(yaku("리치", 1));
  if (ctx.riichi && ctx.ippatsu) results.push(yaku("일발", 1));
  if (menzen && ctx.tsumo) results.push(yaku("멘젠쯔모", 1));
  if (isPinfuShape(d, candidate.waitShape, menzen, ctx.seatWind, ctx.roundWind)) results.push(yaku("핀후", 1));

  const tanyao = d.sets.every((b) => sequenceOrBlockAllSimple(b)) && isSimple(d.pairKind);
  if (tanyao && (menzen || ctx.rules.kuitan)) results.push(yaku("탕야오", 1));

  const iipeikouCount = menzen ? countIipeikou(d, false) : 0;
  const isRyanpeikou = menzen && iipeikouCount >= 2 && d.sets.every((b) => b.type === "sequence");

  d.sets.forEach((b) => {
    if (b.type === "sequence") return;
    if (isDragon(b.kind)) results.push(yaku(`역패 ${b.kind === 31 ? "백" : b.kind === 32 ? "발" : "중"}`, 1));
    if (b.kind === ctx.seatWind) results.push(yaku("역패 자풍", 1));
    if (b.kind === ctx.roundWind) results.push(yaku("역패 장풍", 1));
  });

  if (ctx.haitei) results.push(yaku("하이테이", 1));
  if (ctx.houtei) results.push(yaku("호테이", 1));
  if (ctx.rinshan) results.push(yaku("린샨카이호", 1));
  if (ctx.chankan) results.push(yaku("창깡", 1));

  // ── 2판 ──
  const chanta = d.sets.every(blockHasTerminalOrHonor) && isTerminalOrHonor(d.pairKind);
  const junchan = chanta && d.sets.every((b) => !isHonor(b.kind)) && !isHonor(d.pairKind);
  if (hasSanshokuDoujun(d)) results.push(yaku("산쇼쿠도준", menzen ? 2 : 1));
  if (hasIttsuu(d)) results.push(yaku("잇츠", menzen ? 2 : 1));
  if (junchan) results.push(yaku("준찬타", menzen ? 3 : 2));
  else if (chanta) results.push(yaku("찬타", menzen ? 2 : 1));
  if (d.sets.every((b) => b.type !== "sequence")) results.push(yaku("토이토이", 2));
  if (ankouCount === 3) results.push(yaku("산안커", 2));
  if (hasSanshokuDoukou(d)) results.push(yaku("산쇼쿠도코", 2));
  if (countKan(d) === 3) results.push(yaku("산칸츠", 2));
  const honroutou = d.sets.every((b) => b.type !== "sequence" && isTerminalOrHonor(b.kind)) && isTerminalOrHonor(d.pairKind) && hasHonor(d) && d.sets.some((b) => isTerminal(b.kind));
  if (honroutou) results.push(yaku("혼로토", 2));

  // ── 3판+ ──
  if (isRyanpeikou) results.push(yaku("료페이코", 3));
  else if (iipeikouCount === 1) results.push(yaku("이페이코", 1));

  const honitsu = suitsUsed(d).size === 2 && hasHonor(d);
  const chinitsu = suitsUsed(d).size === 1 && !hasHonor(d);
  if (chinitsu) results.push(yaku("친이츠", menzen ? 6 : 5));
  else if (honitsu) results.push(yaku("혼이츠", menzen ? 3 : 2));

  return results;
}

export function chiitoitsuYaku(): YakuResult[] {
  return [yaku("치또이츠", 2)];
}

export function kokushiYaku(thirteenWait: boolean): YakuResult[] {
  return [yakumanYaku("코쿠시무소", thirteenWait ? 2 : 1)];
}

export function chuurenPoutouYaku(pure: boolean): YakuResult[] {
  return [yakumanYaku("구렌포토", pure ? 2 : 1)];
}

export function tenhouChiihouYaku(isDealer: boolean): YakuResult[] {
  return [yakumanYaku(isDealer ? "천화" : "지화")];
}
