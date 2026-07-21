// 본편 개시 전 월드 잠금 — GM만 입장 가능.
// WORLD_OPEN=1 이면 즉시 오픈, WORLD_OPEN_AT 이 있으면 그 시각부터 자동 오픈.
// 기본 오픈 시각은 2026-07-22 00:00 KST.
const DEFAULT_WORLD_OPEN_AT = "2026-07-22T00:00:00+09:00";

export function worldOpenAt(): Date {
  const raw = process.env.WORLD_OPEN_AT?.trim() || DEFAULT_WORLD_OPEN_AT;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_WORLD_OPEN_AT) : parsed;
}

export function isWorldOpen(now: Date = new Date()): boolean {
  if (process.env.WORLD_OPEN === "1") return true;
  return now.getTime() >= worldOpenAt().getTime();
}

export function isWorldGmOnly(now: Date = new Date()): boolean {
  return !isWorldOpen(now);
}
