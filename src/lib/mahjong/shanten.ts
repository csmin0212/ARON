import { KIND_COUNT, canStartSequence, isTerminalOrHonor } from "./tiles";

// 표준형(4면자+1작) 샹텐수. counts는 손패 34종 개수 배열(오픈 멜드 제외),
// presetMelds는 이미 콜/깡으로 확정된 세트 수.
// 알고리즘: 각 종류를 순서대로 훑으며 트리플렛/시퀀스/작/부분세트로 소비를 시도하는
// 표준 백트래킹 방식(여러 마작 샹텐 계산기에서 쓰는 공개된 방법론).
export function standardShanten(counts: number[], presetMelds: number): number {
  const c = counts.slice();
  let best = 8;
  const memo = new Map<string, number>();

  function key(i: number, melds: number, partials: number, pair: number): string {
    return `${i}|${melds}|${partials}|${pair}|${c.slice(i).join(",")}`;
  }

  function evalLeaf(melds: number, partials: number, pair: number): number {
    const usablePartials = Math.min(partials, Math.max(0, 4 - melds));
    return (4 - melds) * 2 - usablePartials - pair;
  }

  function rec(i: number, melds: number, partials: number, pair: number): number {
    // 면자가 4개 찼다고 여기서 끊으면 안 된다 — 작(雀頭)이 뒤쪽 종류에 있는 손패
    // (예: 333m 444m 567p + 9s9s)를 텐파이/화료로 못 읽는다. 남은 종류는 계속 훑되
    // 면자만 더 안 만든다.
    if (i >= KIND_COUNT) {
      return evalLeaf(melds, partials, pair);
    }
    const k = key(i, melds, partials, pair);
    const cached = memo.get(k);
    if (cached !== undefined) return cached;

    if (c[i] === 0) {
      const r = rec(i + 1, melds, partials, pair);
      memo.set(k, r);
      return r;
    }

    let found = Infinity;

    if (melds < 4 && c[i] >= 3) {
      c[i] -= 3;
      found = Math.min(found, rec(i, melds + 1, partials, pair));
      c[i] += 3;
    }
    if (c[i] >= 2 && pair === 0) {
      c[i] -= 2;
      found = Math.min(found, rec(i, melds, partials, 1));
      c[i] += 2;
    }
    if (c[i] >= 2) {
      c[i] -= 2;
      found = Math.min(found, rec(i, melds, partials + 1, pair));
      c[i] += 2;
    }
    if (melds < 4 && canStartSequence(i) && c[i] >= 1 && c[i + 1] >= 1 && c[i + 2] >= 1) {
      c[i]--;
      c[i + 1]--;
      c[i + 2]--;
      found = Math.min(found, rec(i, melds + 1, partials, pair));
      c[i]++;
      c[i + 1]++;
      c[i + 2]++;
    }
    if (canStartSequence(i) && c[i] >= 1 && c[i + 1] >= 1) {
      c[i]--;
      c[i + 1]--;
      found = Math.min(found, rec(i, melds, partials + 1, pair));
      c[i]++;
      c[i + 1]++;
    }
    if (i % 9 <= 6 && i < 27 && c[i] >= 1 && c[i + 2] >= 1) {
      c[i]--;
      c[i + 2]--;
      found = Math.min(found, rec(i, melds, partials + 1, pair));
      c[i]++;
      c[i + 2]++;
    }
    // 이 종류를 아예 안 쓰고 한 장 버려둔 채 다음으로 이동
    c[i]--;
    found = Math.min(found, rec(i + 1, melds, partials, pair));
    c[i]++;

    memo.set(k, found);
    return found;
  }

  best = rec(0, presetMelds, 0, 0);
  return best;
}

export function chiitoiShanten(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < KIND_COUNT; i++) {
    if (counts[i] >= 1) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  pairs = Math.min(pairs, 7);
  return 6 - pairs + Math.max(0, 7 - kinds);
}

export function kokushiShanten(counts: number[]): number {
  const targets = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let kinds = 0;
  let hasPair = false;
  for (const k of targets) {
    if (counts[k] >= 1) kinds++;
    if (counts[k] >= 2) hasPair = true;
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

// 전체 샹텐수(오픈 멜드가 있으면 치또이/코쿠시는 불가 — 표준형만 계산)
export function shanten(counts: number[], presetMelds: number): number {
  const std = standardShanten(counts, presetMelds);
  if (presetMelds > 0) return std;
  return Math.min(std, chiitoiShanten(counts), kokushiShanten(counts));
}

export function isAgariCounts(counts14: number[], presetMelds: number): boolean {
  return shanten(counts14, presetMelds) === -1;
}

export function isTerminalOrHonorKind(kind: number): boolean {
  return isTerminalOrHonor(kind);
}
