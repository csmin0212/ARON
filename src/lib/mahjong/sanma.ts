import type { Tile } from "./types";
import { WINDS } from "./tiles";
import { drawRinshan, type Wall } from "./wall";

// 3인마작(사마)은 치 콜이 없다 — 오픈 시퀀스 자체가 성립하지 않음
export function isChiAllowed(playerCount: 3 | 4): boolean {
  return playerCount === 4;
}

export interface KitaResult {
  removed: Tile;
  replacement: Tile | null;
}

// 발북(拔北): 북 패를 뽑으면 즉시 빼서 옆에 두고 왕패에서 영상패를 보충한다. 점수 가점 없음.
export function declareKita(hand: Tile[], wall: Wall): KitaResult | null {
  const idx = hand.findIndex((t) => t.kind === WINDS.N);
  if (idx === -1) return null;
  const [removed] = hand.splice(idx, 1);
  const replacement = drawRinshan(wall);
  if (replacement) hand.push(replacement);
  return { removed, replacement };
}

export const SANMA_UMA = [15000, 0, -15000];
export const YONMA_UMA = [15000, 5000, -5000, -15000];

export function umaFor(playerCount: 3 | 4): number[] {
  return playerCount === 3 ? SANMA_UMA : YONMA_UMA;
}
