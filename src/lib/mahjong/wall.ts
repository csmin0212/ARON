import type { Tile } from "./types";
import { KIND_COUNT, isValidKindForRules } from "./tiles";

export interface Wall {
  liveTiles: Tile[]; // 산 벽 — 끝에서(pop) 드로우
  deadWall: Tile[]; // 왕패 14장, 항상 14장 유지
  doraIndicators: number[];
  uraDoraIndicators: number[];
  revealedDoraCount: number;
}

function shuffle(tiles: Tile[], rng: () => number) {
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
}

function applyAka(tiles: Tile[], playerCount: 3 | 4) {
  const redKinds = playerCount === 4 ? [4, 13, 22] : [13, 22]; // 사마는 5만이 없음
  for (const kind of redKinds) {
    const idx = tiles.findIndex((t) => t.kind === kind && !t.aka);
    if (idx >= 0) tiles[idx] = { kind, aka: true };
  }
}

export function buildFullSet(playerCount: 3 | 4, rng: () => number = Math.random): Tile[] {
  const tiles: Tile[] = [];
  for (let kind = 0; kind < KIND_COUNT; kind++) {
    if (!isValidKindForRules(kind, playerCount)) continue;
    for (let copy = 0; copy < 4; copy++) tiles.push({ kind, aka: false });
  }
  applyAka(tiles, playerCount);
  shuffle(tiles, rng);
  return tiles;
}

export function dealWall(playerCount: 3 | 4, rng?: () => number): { hands: Tile[][]; wall: Wall } {
  const all = buildFullSet(playerCount, rng);
  const deadWall = all.slice(0, 14);
  const live = all.slice(14);
  const hands: Tile[][] = Array.from({ length: playerCount }, () => []);
  for (let round = 0; round < 13; round++) {
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(live.pop()!);
    }
  }
  return {
    hands,
    wall: {
      liveTiles: live,
      deadWall,
      doraIndicators: [deadWall[4].kind],
      uraDoraIndicators: [],
      revealedDoraCount: 1,
    },
  };
}

export function drawTile(wall: Wall): Tile | null {
  return wall.liveTiles.pop() ?? null;
}

export function tilesRemaining(wall: Wall): number {
  return wall.liveTiles.length;
}

// 깡 선언 후 영상패 드로우: 산 벽 끝을 왕패로 옮겨 왕패 14장을 유지하며, 왕패 앞쪽에서 한 장을 보충한다.
export function drawRinshan(wall: Wall): Tile | null {
  if (wall.liveTiles.length === 0) return null;
  const moved = wall.liveTiles.pop()!;
  wall.deadWall.push(moved);
  return wall.deadWall.shift() ?? null;
}

// 깡이 성립할 때마다 새 도라 표시패를 공개 (최대 4회 추가 = 총 5장)
export function revealNextDora(wall: Wall) {
  if (wall.revealedDoraCount > 4) return;
  const idx = 4 + wall.revealedDoraCount * 2;
  const indicator = wall.deadWall[idx];
  if (indicator) wall.doraIndicators.push(indicator.kind);
  wall.revealedDoraCount++;
}

// 리치 상태로 승리했을 때만 사용 — 공개된 도라 개수만큼 뒷도라 표시패도 함께 공개
export function revealUraDora(wall: Wall) {
  wall.uraDoraIndicators = [];
  for (let i = 0; i < wall.revealedDoraCount; i++) {
    const indicator = wall.deadWall[5 + i * 2];
    if (indicator) wall.uraDoraIndicators.push(indicator.kind);
  }
}
