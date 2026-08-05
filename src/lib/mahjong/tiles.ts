import type { Suit, Tile } from "./types";

export const WINDS = { E: 27, S: 28, W: 29, N: 30 } as const;
export const DRAGONS = { HAKU: 31, HATSU: 32, CHUN: 33 } as const;
export const KIND_COUNT = 34;

export function isSuited(kind: number): boolean {
  return kind < 27;
}

export function isHonor(kind: number): boolean {
  return kind >= 27;
}

export function suitOf(kind: number): Suit {
  if (kind < 9) return "m";
  if (kind < 18) return "p";
  if (kind < 27) return "s";
  return "z";
}

// 스이티드: 1~9. 명예패: 1(동)~4(북), 5(백)~7(중)
export function numOf(kind: number): number {
  return isHonor(kind) ? kind - 26 : (kind % 9) + 1;
}

export function isTerminal(kind: number): boolean {
  return isSuited(kind) && (numOf(kind) === 1 || numOf(kind) === 9);
}

export function isSimple(kind: number): boolean {
  return isSuited(kind) && !isTerminal(kind);
}

export function isTerminalOrHonor(kind: number): boolean {
  return isHonor(kind) || isTerminal(kind);
}

export function isWind(kind: number): boolean {
  return kind >= 27 && kind <= 30;
}

export function isDragon(kind: number): boolean {
  return kind >= 31 && kind <= 33;
}

// 류이소(올그린)용 — 2/3/4/6/8삭 + 발(하츠)
export function isGreenTile(kind: number): boolean {
  return kind === 19 || kind === 20 || kind === 21 || kind === 23 || kind === 25 || kind === DRAGONS.HATSU;
}

export function canStartSequence(kind: number): boolean {
  return isSuited(kind) && numOf(kind) <= 7;
}

export function toCounts(tiles: Tile[]): number[] {
  const counts = new Array(KIND_COUNT).fill(0);
  for (const t of tiles) counts[t.kind]++;
  return counts;
}

export function akaCountOf(tiles: Tile[]): number {
  return tiles.filter((t) => t.aka).length;
}

// 도라 표시패 -> 실제 도라 종류
export function nextDoraKind(indicatorKind: number): number {
  if (indicatorKind < 27) {
    const base = indicatorKind - (indicatorKind % 9);
    return base + ((indicatorKind - base + 1) % 9);
  }
  if (indicatorKind <= 30) return 27 + ((indicatorKind - 27 + 1) % 4); // 동南西北 순환
  return 31 + ((indicatorKind - 31 + 1) % 3); // 백발중 순환
}

const NUM_KO = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const SUIT_KO: Record<Suit, string> = { m: "만", p: "통", s: "삭", z: "" };
const HONOR_KO = ["", "동", "남", "서", "북", "백", "발", "중"];

export function tileName(kind: number): string {
  if (isHonor(kind)) return HONOR_KO[numOf(kind)];
  return `${NUM_KO[numOf(kind)]}${SUIT_KO[suitOf(kind)]}`;
}

export function tile(kind: number, aka = false): Tile {
  return { kind, aka };
}

// 3인마작(사마): 만즈는 1/9만 존재, 2~8만 제거. 사마 5만이 없으므로 아카는 통/삭에만.
export function isValidKindForRules(kind: number, playerCount: 3 | 4): boolean {
  if (playerCount === 4) return true;
  if (suitOf(kind) !== "m") return true;
  return numOf(kind) === 1 || numOf(kind) === 9;
}
