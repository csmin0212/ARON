import type { HandDecomposition, Meld, SetBlock, Tile, WaitShape } from "./types";
import { canStartSequence, numOf, toCounts } from "./tiles";

interface RawSet {
  type: "triplet" | "sequence";
  kind: number;
}

interface RawDecomposition {
  sets: RawSet[];
  pairKind: number;
}

// counts를 정확히 (neededSets개의 세트 + 1작)으로 분해하는 모든 방법을 나열.
// 남는 패 없이 딱 맞아떨어지는 경우만 유효하므로 표준 샹텐 탐색과 달리
// "안 쓰고 넘어가는" 분기가 없다 — 항상 가장 앞의 종류를 완전히 소비해야 진행된다.
function enumerateDecompositions(counts: number[], neededSets: number): RawDecomposition[] {
  const c = counts.slice();
  const results: RawDecomposition[] = [];

  function firstNonZero(): number {
    for (let i = 0; i < 34; i++) if (c[i] > 0) return i;
    return -1;
  }

  function rec(sets: RawSet[], pairKind: number) {
    const i = firstNonZero();
    if (i === -1) {
      if (sets.length === neededSets && pairKind !== -1) {
        results.push({ sets: sets.slice(), pairKind });
      }
      return;
    }
    if (sets.length < neededSets) {
      if (c[i] >= 3) {
        c[i] -= 3;
        sets.push({ type: "triplet", kind: i });
        rec(sets, pairKind);
        sets.pop();
        c[i] += 3;
      }
      if (canStartSequence(i) && c[i] >= 1 && c[i + 1] >= 1 && c[i + 2] >= 1) {
        c[i]--;
        c[i + 1]--;
        c[i + 2]--;
        sets.push({ type: "sequence", kind: i });
        rec(sets, pairKind);
        sets.pop();
        c[i]++;
        c[i + 1]++;
        c[i + 2]++;
      }
    }
    if (pairKind === -1 && c[i] >= 2) {
      c[i] -= 2;
      rec(sets, i);
      c[i] += 2;
    }
  }

  rec([], -1);
  return results;
}

export interface WaitCandidate {
  decomposition: HandDecomposition;
  waitShape: WaitShape;
  winBlockIndex: number; // decomposition.sets 내 인덱스, 작(雀頭)이면 -1
}

function classifySequenceWait(runStart: number, winKind: number): WaitShape {
  if (winKind === runStart + 1) return "kanchan";
  if (winKind === runStart) {
    return numOf(runStart) === 7 ? "penchan" : "ryanmen"; // 7-8-9 런에서 7로 완성 = 변짱
  }
  return numOf(runStart) === 1 ? "penchan" : "ryanmen"; // 1-2-3 런에서 3으로 완성 = 변짱
}

function toSetBlocks(raw: RawSet[]): SetBlock[] {
  return raw.map((s) => ({ type: s.type, kind: s.kind, open: false }));
}

// 콘실드 손패(오픈 멜드 제외, 완성패 winTile 포함)를 4-오픈멜드수 개의 세트 + 1작으로
// 분해하는 모든 경우와, 그 중 winTile이 완성시킨 블록(대기 형태)의 후보를 전부 반환.
// 애매한 패(이페이코 등)는 여러 해석이 나올 수 있으므로 점수 계산 쪽에서 최댓값을 고른다.
export function findWaitCandidates(
  concealedTiles: Tile[],
  openMelds: Meld[],
  winKind: number,
): WaitCandidate[] {
  const counts = toCounts(concealedTiles);
  const neededSets = 4 - openMelds.length;
  const rawDecomps = enumerateDecompositions(counts, neededSets);
  const openBlocks: SetBlock[] = openMelds.map((m) => ({
    type: m.type === "chi" ? "sequence" : m.type === "pon" ? "triplet" : "kan",
    kind: m.kind,
    open: m.type !== "ankan",
  }));

  const out: WaitCandidate[] = [];
  for (const raw of rawDecomps) {
    const concealedSets = toSetBlocks(raw.sets);
    const fullSets = [...openBlocks, ...concealedSets];
    const decomposition: HandDecomposition = { sets: fullSets, pairKind: raw.pairKind };

    if (raw.pairKind === winKind) {
      out.push({ decomposition, waitShape: "tanki", winBlockIndex: -1 });
    }
    raw.sets.forEach((s, idx) => {
      const blockIndex = openBlocks.length + idx;
      if (s.type === "triplet" && s.kind === winKind) {
        out.push({ decomposition, waitShape: "shanpon", winBlockIndex: blockIndex });
      }
      if (s.type === "sequence") {
        if (winKind === s.kind || winKind === s.kind + 1 || winKind === s.kind + 2) {
          out.push({
            decomposition,
            waitShape: classifySequenceWait(s.kind, winKind),
            winBlockIndex: blockIndex,
          });
        }
      }
    });
  }
  return out;
}

export function isChiitoitsu(concealedTiles: Tile[]): boolean {
  const counts = toCounts(concealedTiles);
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n >= 1) kinds++;
    if (n === 2) pairs++;
  }
  return kinds === 7 && pairs === 7 && concealedTiles.length === 14;
}

export function isKokushi(concealedTiles: Tile[]): { complete: boolean; pairKind: number } {
  const targets = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const counts = toCounts(concealedTiles);
  let kinds = 0;
  let pairKind = -1;
  for (const k of targets) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) pairKind = k;
  }
  const onlyTargets = counts.every((n, i) => n === 0 || targets.includes(i));
  return { complete: onlyTargets && kinds === 13 && concealedTiles.length === 14, pairKind };
}
