import type { Meld, Tile, WindKind } from "./types";
import type { AiLevel } from "./economy";
import { shanten } from "./shanten";
import {
  KIND_COUNT,
  isDragon,
  isHonor,
  isSimple,
  isTerminal,
  isValidKindForRules,
  toCounts,
} from "./tiles";

// AI 실력은 등급방마다 다르다(economy.ts TierConfig.aiLevel).
//   1 연습 — 가끔 엉뚱한 패를 버리고, 샹텐이 줄지 않아도 아무거나 운다.
//   2 보통 — 샹텐만 보고 진행. 끝수·자패를 먼저 버리는 정도의 감각만 있다.
//   3 숙련 — 샹텐이 같으면 '유효패 장수(우케이레)'가 많은 쪽을 남기고, 역 없는 울기는 참는다.
//   4 고수 — 3의 판단 + 상대 리치에 현물로 오리고, 대기가 너무 얇으면 다마텐으로 간다.
//
// 여기 있는 함수들은 전부 AiView(그 자리에서 본 판 정보)를 받는다. 뷰를 만드는 쪽은 match.ts.

export interface AiView {
  level: AiLevel;
  unseen: number[]; // 종류별 아직 안 보인 장수 — 우케이레 계산용
  underThreat: boolean; // 리치를 건 상대가 있는가
  safeKinds: Set<number>; // 그 상대들 '전원'에게 현물인 패 종류
  seatWind: WindKind;
  roundWind: WindKind;
  kuitan: boolean;
}

// 우케이레를 실제로 계산해 볼 후보 수 상한 — 서버 요청 하나가 이 계산에 매달리지 않도록.
const UKEIRE_CANDIDATE_CAP = 6;

export function neutralView(level: AiLevel = 2): AiView {
  return {
    level,
    unseen: new Array(KIND_COUNT).fill(4),
    underThreat: false,
    safeKinds: new Set(),
    seatWind: 27 as WindKind,
    roundWind: 27 as WindKind,
    kuitan: true,
  };
}

// 손패에서 i번째를 뺀 카운트. 매번 배열을 새로 만들지 않으려고 카운트를 직접 굴린다.
function shantenWithout(counts: number[], kind: number, openMeldCount: number): number {
  counts[kind]--;
  const s = shanten(counts, openMeldCount);
  counts[kind]++;
  return s;
}

// 이 13장에서 샹텐을 줄여주는 패가 몇 장 남아 있는가(종류가 아니라 실제 장수).
function ukeireCount(counts: number[], openMeldCount: number, unseen: number[]): number {
  const base = shanten(counts, openMeldCount);
  let total = 0;
  for (let k = 0; k < KIND_COUNT; k++) {
    if (unseen[k] <= 0) continue;
    counts[k]++;
    const s = shanten(counts, openMeldCount);
    counts[k]--;
    if (s < base) total += unseen[k];
  }
  return total;
}

// 텐파이 상태에서 기다리는 패가 실제로 몇 장 남았는지 — 리치를 걸지 말지 판단할 때 쓴다.
export function remainingWaitCount(counts: number[], openMeldCount: number, unseen: number[]): number {
  return ukeireCount(counts, openMeldCount, unseen);
}

// 버릴 후보를 종류 단위로 추린다(같은 종류를 여러 번 계산할 이유가 없다).
function candidateIndexes(hand: Tile[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < hand.length; i++) {
    if (seen.has(hand[i].kind)) continue;
    seen.add(hand[i].kind);
    out.push(i);
  }
  return out;
}

// 같은 값이면 끝수·자패를 먼저 버린다. 아카는 도라라서 끝까지 쥔다.
function junkScore(tile: Tile): number {
  if (tile.aka) return -2;
  if (isHonor(tile.kind) || isTerminal(tile.kind)) return 2;
  return 0;
}

export function chooseDiscard(hand: Tile[], openMeldCount: number, view: AiView = neutralView()): Tile {
  const { level } = view;

  // 연습 AI 는 네 번에 한 번쯤 그냥 손 가는 대로 버린다 — 사람이 이길 여지를 준다.
  if (level <= 1 && Math.random() < 0.25) {
    return hand[Math.floor(Math.random() * hand.length)];
  }

  const counts = toCounts(hand);
  const cands = candidateIndexes(hand);
  const scored = cands.map((i) => ({
    idx: i,
    tile: hand[i],
    shanten: shantenWithout(counts, hand[i].kind, openMeldCount),
  }));
  const best = Math.min(...scored.map((c) => c.shanten));

  // 고수 — 상대가 리치를 걸었고 내 손이 아직 2샹텐 이상이면 승부를 접고 현물을 뽑는다.
  if (level >= 4 && view.underThreat && best >= 2) {
    const safe = scored.filter((c) => view.safeKinds.has(c.tile.kind));
    if (safe.length > 0) {
      safe.sort((a, b) => a.shanten - b.shanten || junkScore(b.tile) - junkScore(a.tile));
      return safe[0].tile;
    }
  }

  let top = scored.filter((c) => c.shanten === best);

  // 숙련 이상 — 샹텐이 같으면 남은 유효패가 많은 쪽을 고른다.
  // 우케이레 계산은 후보 하나당 shanten 을 34번 돌리므로, 버릴 만한 순서로 미리 잘라서 상한을 둔다.
  if (level >= 3 && top.length > 1) {
    const pool = top
      .slice()
      .sort((a, b) => junkScore(b.tile) - junkScore(a.tile))
      .slice(0, UKEIRE_CANDIDATE_CAP);
    const withUkeire = pool.map((c) => {
      counts[c.tile.kind]--;
      const u = ukeireCount(counts, openMeldCount, view.unseen);
      counts[c.tile.kind]++;
      return { ...c, ukeire: u };
    });
    const bestUkeire = Math.max(...withUkeire.map((c) => c.ukeire));
    // 고수는 유효패를 조금 손해 보더라도(1/4 이내) 현물이 있으면 그쪽을 잡는다.
    if (level >= 4 && view.underThreat) {
      const safeEnough = withUkeire.filter(
        (c) => view.safeKinds.has(c.tile.kind) && c.ukeire >= bestUkeire * 0.75,
      );
      if (safeEnough.length > 0) {
        safeEnough.sort((a, b) => b.ukeire - a.ukeire);
        return safeEnough[0].tile;
      }
    }
    top = withUkeire.filter((c) => c.ukeire === bestUkeire);
  }

  // 연습은 여기서 타이브레이크를 안 한다 — 안전패 감각이 없는 것처럼 보인다.
  if (level <= 1) return top[0].tile;

  top.sort((a, b) => junkScore(b.tile) - junkScore(a.tile));
  return top[0].tile;
}

// 울고 난 뒤에도 역이 붙을 여지가 있는가 — 숙련 이상은 이게 없으면 울지 않는다.
// 보수적으로 탕야오·역패만 본다(혼일색·찬타 등은 세지 않는다).
function hasYakuChance(tilesAfterCall: Tile[], view: AiView): boolean {
  if (view.kuitan && tilesAfterCall.every((t) => isSimple(t.kind))) return true;
  const counts = toCounts(tilesAfterCall);
  for (let k = 0; k < KIND_COUNT; k++) {
    if (counts[k] < 2) continue;
    if (isDragon(k) || k === view.seatWind || k === view.roundWind) return true;
  }
  return false;
}

// 손패에서 특정 종류를 n장 빼고 남은 패들
function without(hand: Tile[], kind: number, n: number): Tile[] {
  const out = hand.slice();
  for (let i = 0; i < n; i++) {
    const idx = out.findIndex((t) => t.kind === kind);
    if (idx >= 0) out.splice(idx, 1);
  }
  return out;
}

export function shouldCallPon(handCounts: number[], openMeldCount: number, kind: number): boolean {
  if (handCounts[kind] < 2) return false;
  const before = shanten(handCounts, openMeldCount);
  const after = handCounts.slice();
  after[kind] -= 2;
  return shanten(after, openMeldCount + 1) < before;
}

export function shouldCallKan(handCounts: number[], kind: number): boolean {
  return handCounts[kind] >= 3;
}

export function shouldRon(canWin: boolean): boolean {
  return canWin;
}

// 치로 붙일 수 있는 조합 중 샹텐이 줄어드는 것 하나를 찾는다. 없으면 null.
function bestChiPair(handCounts: number[], openMeldCount: number, kind: number): [number, number] | null {
  if (kind >= 27) return null;
  const before = shanten(handCounts, openMeldCount);
  const base = kind - (kind % 9);
  const pairs: [number, number][] = [
    [kind - 2, kind - 1],
    [kind - 1, kind + 1],
    [kind + 1, kind + 2],
  ];
  for (const [a, b] of pairs) {
    if (a < base || b >= base + 9) continue;
    if (handCounts[a] < 1 || handCounts[b] < 1) continue;
    const after = handCounts.slice();
    after[a]--;
    after[b]--;
    if (shanten(after, openMeldCount + 1) < before) return [a, b];
  }
  return null;
}

export interface AiCallOptions {
  canRon: boolean;
  canPon: boolean;
  canKan: boolean;
  canChi: boolean;
}

export type AiCallResponse = "pass" | "pon" | "chi" | "kan" | "ron";

export function decideCall(
  hand: Tile[],
  melds: Meld[],
  tile: Tile,
  opts: AiCallOptions,
  view: AiView = neutralView(),
): AiCallResponse {
  if (opts.canRon) return "ron";
  const { level } = view;
  const counts = toCounts(hand);
  const open = melds.length;
  const cur = shanten(counts, open);

  // 고수 — 상대 리치 중에 멀찍이 떨어진 손으로 울어봐야 방총만 는다.
  if (level >= 4 && view.underThreat && cur >= 2) return "pass";

  if (opts.canKan && shouldCallKan(counts, tile.kind)) {
    // 깡은 도라를 한 장 더 까고 손패를 굳힌다 — 숙련 이상은 손이 여물었을 때만.
    if (level < 3 || cur <= 1) return "kan";
  }

  const meldTiles = melds.flatMap((m) => m.tiles);

  if (opts.canPon && shouldCallPon(counts, open, tile.kind)) {
    // 퐁하면 같은 패 2장이 손패에서 나가고 울린 3장이 노출된다
    const after = [...without(hand, tile.kind, 2), ...meldTiles, tile, tile, tile];
    if (level < 3 || hasYakuChance(after, view)) return "pon";
  }

  if (opts.canChi) {
    if (level <= 1) return "chi"; // 연습 AI 는 붙기만 하면 운다
    const pair = bestChiPair(counts, open, tile.kind);
    if (!pair) return "pass";
    if (level >= 3) {
      const after = [
        ...without(without(hand, pair[0], 1), pair[1], 1),
        ...meldTiles,
        tile,
        { kind: pair[0], aka: false },
        { kind: pair[1], aka: false },
      ];
      if (!hasYakuChance(after, view)) return "pass";
    }
    return "chi";
  }

  return "pass";
}

// 리치 후보 중 어느 패로 걸지 + 애초에 걸지 말지.
// 숙련 이상은 대기가 아예 죽어 있으면(남은 0장) 리치를 미루고, 고수는 1장 이하도 미룬다(다마텐).
export function chooseRiichiDiscard(
  hand: Tile[],
  openMeldCount: number,
  candidateIdxs: number[],
  view: AiView,
): number | null {
  if (candidateIdxs.length === 0) return null;
  if (view.level <= 2) return candidateIdxs[0];

  const counts = toCounts(hand);
  let bestIdx = candidateIdxs[0];
  let bestWait = -1;
  for (const i of candidateIdxs) {
    const kind = hand[i].kind;
    counts[kind]--;
    const wait = remainingWaitCount(counts, openMeldCount, view.unseen);
    counts[kind]++;
    if (wait > bestWait) {
      bestWait = wait;
      bestIdx = i;
    }
  }
  const minWait = view.level >= 4 ? 2 : 1;
  return bestWait >= minWait ? bestIdx : null;
}

// 아직 아무에게도 안 보인 패의 종류별 장수. 내 손패·모든 버림패·모든 멘츠·도라 표시패를 뺀다.
export function buildUnseenCounts(
  playerCount: 3 | 4,
  myHand: Tile[],
  everyoneDiscards: Tile[][],
  everyoneMelds: Meld[][],
  doraIndicators: number[],
): number[] {
  const unseen = new Array(KIND_COUNT).fill(0);
  for (let k = 0; k < KIND_COUNT; k++) {
    if (isValidKindForRules(k, playerCount)) unseen[k] = 4;
  }
  const drop = (kind: number) => {
    if (unseen[kind] > 0) unseen[kind]--;
  };
  myHand.forEach((t) => drop(t.kind));
  everyoneDiscards.forEach((d) => d.forEach((t) => drop(t.kind)));
  everyoneMelds.forEach((ms) => ms.forEach((m) => m.tiles.forEach((t) => drop(t.kind))));
  doraIndicators.forEach(drop);
  return unseen;
}
