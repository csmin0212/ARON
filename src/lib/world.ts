// 월드(오픈월드) 핵심 규칙 + 맵 시트 파서
//
// 맵은 GM이 마스터 스프레드시트의 "맵" 탭에 정의한다. (양식: WORLD.md 참고)
// | ID | 이름 | 이모지 | 설명 | 연결 | 히든 | 시작 |

import { MASTER_SHEET_ID, parseCsv } from "./charsheet";
import type { FishWater, LifeSkillPoolConfig, LocationLifeConfig } from "./lifeSkillData";

// ── 피로도 규칙 ──
// 이동은 자유(소모 없음). 피로도는 채집·낚시·전투 등 "행동"에 소모된다.
// 최대 300, 6분마다 1씩 자연 회복 (하루 240). 회복 수단은 추후 추가 예정.
// DB 컬럼은 기존 ap(현재 피로도) / apResetAt(회복 기준 시각)을 그대로 사용한다.
export const FATIGUE_MAX = 300;
export const FATIGUE_REGEN_MIN = 6; // 1 회복에 걸리는 분
export const KEYWORD_SEARCH_COST = 0; // 키워드 탐색은 피로도 무료 (정보 떡밥용)

const REGEN_MS = FATIGUE_REGEN_MIN * 60_000;

// lazy 회복 계산 — 경과 시간만큼 회복하고, 6분 미만의 잔여 진행분은
// 기준 시각을 소비한 만큼만 전진시켜 보존한다.
export function regenFatigue(
  stored: number | null,
  at: Date | null,
  now: Date = new Date(),
): { value: number; at: Date } {
  if (stored == null || at == null) return { value: FATIGUE_MAX, at: now };
  const elapsed = now.getTime() - at.getTime();
  if (elapsed <= 0) return { value: Math.min(stored, FATIGUE_MAX), at };
  const ticks = Math.floor(elapsed / REGEN_MS);
  const value = Math.min(FATIGUE_MAX, stored + ticks);
  if (value >= FATIGUE_MAX) return { value: FATIGUE_MAX, at: now };
  return { value, at: new Date(at.getTime() + ticks * REGEN_MS) };
}

// 표시용 — 저장값 기준 현재 피로도
export function effectiveAp(ap: number | null, apResetAt: Date | null): number {
  return regenFatigue(ap, apResetAt).value;
}

// 한국시간(UTC+9) 기준 날짜 키 (YYYY-MM-DD) — 일일 1회 판정용
export function kstDayKey(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
}

// 오늘(KST) 이미 휴식했는지
export function restedTodayKst(restedAt: Date | null, now: Date = new Date()): boolean {
  return restedAt != null && kstDayKey(restedAt) === kstDayKey(now);
}

// 던전 주간 키 — 한국시간 월요일 0시(일요일→월요일 자정) 기준. 같은 키면 같은 주.
export function dungeonWeekKey(now: Date = new Date()): string {
  // KST 기준 그 주의 월요일 날짜 (월요일 자정에 주가 바뀐다)
  const shifted = new Date(now.getTime() + 9 * 60 * 60_000);
  const dow = shifted.getUTCDay(); // 0=일 .. 6=토
  const daysSinceMon = (dow + 6) % 7; // 월=0
  shifted.setUTCDate(shifted.getUTCDate() - daysSinceMon);
  return shifted.toISOString().slice(0, 10); // 그 주 월요일 날짜
}

export function nextFatigueRegenMinutes(ap: number | null, apResetAt: Date | null): number | null {
  const now = new Date();
  const fresh = regenFatigue(ap, apResetAt, now);
  if (fresh.value >= FATIGUE_MAX) return null;
  const nextAt = fresh.at.getTime() + REGEN_MS;
  return Math.max(1, Math.ceil((nextAt - now.getTime()) / 60_000));
}

// ── 맵 시트 파서 ──
// 맵은 GM 전용 별도 스프레드시트(WORLD_SHEET_ID)에서 읽는다.
// 미설정 시 마스터 시트로 폴백 (플레이어에게 보이므로 별도 시트 권장)
export const WORLD_SHEET_ID = process.env.WORLD_SHEET_ID || MASTER_SHEET_ID;
export const WORLD_TAB = process.env.WORLD_TAB_NAME || "맵";

export type WorldRow = {
  id: string;
  name: string;
  emoji: string | null;
  desc: string | null;
  image: string | null;
  conns: string[];
  hidden: boolean;
  keyword: string | null;
  cond: string | null;
  life: LocationLifeConfig | null;
  isStart: boolean;
};

const HEADER_KEYS: Record<string, string> = {
  ID: "id",
  id: "id",
  이름: "name",
  이모지: "emoji",
  설명: "desc",
  이미지: "image",
  연결: "conns",
  히든: "hidden",
  키워드: "keyword",
  조건: "cond",
  시작: "isStart",
  채집: "gather",
  "채집 가능": "gather",
  채집가능: "gather",
  채집목록: "gatherItems",
  "채집 목록": "gatherItems",
  "채집 가능 목록": "gatherItems",
  채집물: "gatherItems",
  채집제외: "gatherExclude",
  "채집 제외": "gatherExclude",
  채집랭크: "gatherRanks",
  "채집 랭크": "gatherRanks",
  채집확률: "gatherWeights",
  "채집 확률": "gatherWeights",
  낚시: "fish",
  "낚시 가능": "fish",
  낚시가능: "fish",
  낚시목록: "fishItems",
  "낚시 목록": "fishItems",
  "낚시 가능 목록": "fishItems",
  물고기: "fishItems",
  낚시제외: "fishExclude",
  "낚시 제외": "fishExclude",
  낚시랭크: "fishRanks",
  "낚시 랭크": "fishRanks",
  낚시확률: "fishWeights",
  "낚시 확률": "fishWeights",
  수역: "fishWater",
  채광: "mine",
  "채광 가능": "mine",
  채광가능: "mine",
  채광목록: "mineItems",
  "채광 목록": "mineItems",
  "채광 가능 목록": "mineItems",
  광물: "mineItems",
  채광제외: "mineExclude",
  "채광 제외": "mineExclude",
  채광랭크: "mineRanks",
  "채광 랭크": "mineRanks",
  채광확률: "mineWeights",
  "채광 확률": "mineWeights",
  전투: "combat",
  "전투 가능": "combat",
  전투가능: "combat",
};

function splitList(value: string): string[] | undefined {
  const items = value
    .split(/[,，;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseRanks(value: string): number[] | undefined {
  const out = new Set<number>();
  for (const raw of value.split(/[,，;\s]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*[~-]\s*(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
        if (n >= 0 && n <= 5) out.add(n);
      }
      continue;
    }
    const n = parseInt(part.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 5) out.add(n);
  }
  return out.size > 0 ? [...out] : undefined;
}

function parseWeights(value: string): number[] | undefined {
  if (!value.trim()) return undefined;
  const weights = [0, 0, 0, 0, 0, 0];
  if (/[=:：]/.test(value)) {
    for (const raw of value.split(/[,，;\n]/)) {
      const m = raw.trim().match(/^(\d+)\s*[=:：]\s*(\d+(?:\.\d+)?)$/);
      if (!m) continue;
      const rank = parseInt(m[1], 10);
      if (rank >= 0 && rank <= 5) weights[rank] = Number(m[2]);
    }
    return weights.some((w) => w > 0) ? weights : undefined;
  }

  const parts = value
    .split(/[,，;\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return undefined;
  for (let i = 0; i < Math.min(6, parts.length); i++) weights[i] = parts[i];
  return weights.some((w) => w > 0) ? weights : undefined;
}

function parseWater(value: string): FishWater | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  if (/바다|해안|항구|sea|ocean/i.test(raw)) return "바다";
  if (/전체|모두|all/i.test(raw)) return "전체";
  return "민물";
}

function compactPool(pool: LifeSkillPoolConfig): LifeSkillPoolConfig | undefined {
  if (!pool.enabled) return undefined;
  return {
    enabled: true,
    ...(pool.items?.length ? { items: pool.items } : {}),
    ...(pool.exclude?.length ? { exclude: pool.exclude } : {}),
    ...(pool.ranks?.length ? { ranks: pool.ranks } : {}),
    ...(pool.weights?.some((w) => w > 0) ? { weights: pool.weights } : {}),
    ...(pool.water ? { water: pool.water } : {}),
  };
}

export function parseWorldGrid(g: string[][]): WorldRow[] {
  // 헤더 행 찾기: "ID" 와 "이름" 이 함께 있는 행
  let headerRow = -1;
  const colMap: Record<string, number> = {};
  for (let r = 0; r < Math.min(g.length, 10); r++) {
    const row = (g[r] || []).map((v) => (v ?? "").trim());
    if (row.includes("ID") && row.includes("이름")) {
      headerRow = r;
      row.forEach((h, c) => {
        const key = HEADER_KEYS[h];
        if (key && colMap[key] == null) colMap[key] = c;
      });
      break;
    }
  }
  if (headerRow < 0 || colMap.id == null || colMap.name == null) {
    throw new Error(
      `'${WORLD_TAB}' 탭이 없거나 헤더(ID/이름)가 없어요. 맵 시트에 '${WORLD_TAB}' 탭을 만들고 WORLD.md 양식대로 채워주세요.`,
    );
  }

  const yes = (v: string) => /^(y|yes|o|ㅇ|true|1)$/i.test(v.trim());
  const rows: WorldRow[] = [];
  const seen = new Set<string>();

  for (let r = headerRow + 1; r < g.length; r++) {
    const cell = (c: number | undefined) => (c == null ? "" : (g[r]?.[c] ?? "").trim());
    const id = cell(colMap.id);
    const name = cell(colMap.name);
    if (!id || !name) continue; // 빈 행 스킵
    // 한국어 ID 허용 — 쉼표만 금지(연결 구분자), 길이 제한
    if (/[,，]/.test(id)) {
      throw new Error(`장소 ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    }
    if (id.length > 30) {
      throw new Error(`장소 ID '${id}' 가 너무 길어요. (30자 이하)`);
    }
    if (seen.has(id)) throw new Error(`장소 ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const gather = compactPool({
      enabled: yes(cell(colMap.gather)),
      items: splitList(cell(colMap.gatherItems)),
      exclude: splitList(cell(colMap.gatherExclude)),
      ranks: parseRanks(cell(colMap.gatherRanks)),
      weights: parseWeights(cell(colMap.gatherWeights)),
    });
    const fish = compactPool({
      enabled: yes(cell(colMap.fish)),
      items: splitList(cell(colMap.fishItems)),
      exclude: splitList(cell(colMap.fishExclude)),
      ranks: parseRanks(cell(colMap.fishRanks)),
      weights: parseWeights(cell(colMap.fishWeights)),
      water: parseWater(cell(colMap.fishWater)),
    });
    const mine = compactPool({
      enabled: yes(cell(colMap.mine)),
      items: splitList(cell(colMap.mineItems)),
      exclude: splitList(cell(colMap.mineExclude)),
      ranks: parseRanks(cell(colMap.mineRanks)),
      weights: parseWeights(cell(colMap.mineWeights)),
    });
    const combat = yes(cell(colMap.combat)) ? { enabled: true } : undefined;
    const life =
      gather || fish || mine || combat
        ? {
            ...(gather ? { gather } : {}),
            ...(fish ? { fish } : {}),
            ...(mine ? { mine } : {}),
            ...(combat ? { combat } : {}),
          }
        : null;

    rows.push({
      id,
      name,
      emoji: cell(colMap.emoji) || null,
      desc: cell(colMap.desc) || null,
      image: cell(colMap.image) || null,
      conns: cell(colMap.conns)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      hidden: yes(cell(colMap.hidden)),
      keyword: cell(colMap.keyword) || null,
      cond: cell(colMap.cond) || null,
      life,
      isStart: yes(cell(colMap.isStart)),
    });
  }

  if (rows.length === 0) throw new Error("맵 시트에 장소가 없어요.");
  if (!rows.some((r) => r.isStart))
    throw new Error("시작 장소가 없어요. '시작' 컬럼에 Y 를 하나 지정해주세요.");

  // 연결 대상 검증
  for (const row of rows) {
    for (const c of row.conns) {
      if (!seen.has(c))
        throw new Error(`'${row.name}'(${row.id})의 연결 '${c}' 에 해당하는 장소가 없어요.`);
    }
  }
  return rows;
}

// 마스터 시트의 "맵" 탭을 불러와 파싱
export async function fetchWorldRows(): Promise<WorldRow[]> {
  // headers=1 필수 — headers=0 이면 gviz 가 숫자만 있는 컬럼의 헤더 셀을 빈 값으로 날림 (gamedata.ts fetchTab 참고)
  const url = `https://docs.google.com/spreadsheets/d/${WORLD_SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(
    WORLD_TAB,
  )}`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error("맵 시트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");

  const text = await res.text();
  if (/google\.visualization\.Query|"status":"error"/.test(text)) {
    throw new Error(`맵 시트에 '${WORLD_TAB}' 탭이 없어요. 탭을 만들고 양식대로 채워주세요.`);
  }
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error("맵 시트가 비공개예요. '링크가 있는 모든 사용자 보기 가능'으로 공유해주세요.");
  }
  return parseWorldGrid(parseCsv(text));
}
