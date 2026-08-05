import type { Tile } from "./types";
import { shanten } from "./shanten";
import { isHonor, isTerminal, toCounts } from "./tiles";

// 강한 전략 AI가 아니라 "정상적으로 진행되는 상대" 수준의 휴리스틱.
// 버릴 패마다 남은 손패의 샹텐수를 계산해 가장 낮아지는 패를 고르고,
// 동률이면 끝수/명예패 쪽을 먼저 버려 안전 위주로 진행한다.
export function chooseDiscard(hand: Tile[], openMeldCount: number): Tile {
  let bestIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const remaining = [...hand.slice(0, i), ...hand.slice(i + 1)];
    const s = shanten(toCounts(remaining), openMeldCount);
    const preference = isHonor(hand[i].kind) || isTerminal(hand[i].kind) ? -0.1 : 0;
    const score = s + preference;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return hand[bestIdx];
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
