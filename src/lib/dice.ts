// 주사위 유틸 (탐색·RP 공용)

export function d6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function rollDice(count = 2): number[] {
  return Array.from({ length: count }, () => d6());
}

// "105G" / "1,200 G" → 105 / 1200
export function parseGoldToInt(s: string | null | undefined): number {
  if (!s) return 0;
  const match = String(s).replace(/,/g, "").match(/-?\d+/);
  const n = match ? parseInt(match[0], 10) : NaN;
  return Number.isNaN(n) ? 0 : n;
}
