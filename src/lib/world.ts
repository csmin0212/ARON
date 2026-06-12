// 월드(오픈월드) 핵심 규칙 + 맵 시트 파서
//
// 맵은 GM이 마스터 스프레드시트의 "맵" 탭에 정의한다. (양식: WORLD.md 참고)
// | ID | 이름 | 이모지 | 설명 | 연결 | 히든 | 시작 |

import { MASTER_SHEET_ID, parseCsv } from "./charsheet";

// ── 피로도 규칙 ──
// 이동은 자유(소모 없음). 피로도는 채집·낚시·전투 등 "행동"에 소모된다.
// 최대 300, 6분마다 1씩 자연 회복 (하루 240). 회복 수단은 추후 추가 예정.
// DB 컬럼은 기존 ap(현재 피로도) / apResetAt(회복 기준 시각)을 그대로 사용한다.
export const FATIGUE_MAX = 300;
export const FATIGUE_REGEN_MIN = 6; // 1 회복에 걸리는 분
export const KEYWORD_SEARCH_COST = 5; // 키워드 탐색 판정 피로도

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
};

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
  const url = `https://docs.google.com/spreadsheets/d/${WORLD_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(
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
