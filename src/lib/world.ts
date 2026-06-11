// 월드(오픈월드) 핵심 규칙 + 맵 시트 파서
//
// 맵은 GM이 마스터 스프레드시트의 "맵" 탭에 정의한다. (양식: WORLD.md 참고)
// | ID | 이름 | 이모지 | 설명 | 연결 | 히든 | 시작 |

import { MASTER_SHEET_ID, parseCsv } from "./charsheet";

// ── 행동치(AP) 규칙 ──
export const AP_MAX = 10; // 하루 행동치
export const MOVE_COST = 1; // 이동 1회 소모
export const RESET_HOUR_KST = 5; // 매일 KST 05:00 회복

const KST_OFFSET = 9 * 3_600_000;

// 가장 최근 회복 기준 시각(UTC). apResetAt 이 이보다 과거면 회복 대상.
export function currentResetBoundary(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET);
  let boundary = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    RESET_HOUR_KST,
  );
  if (kst.getUTCHours() < RESET_HOUR_KST) boundary -= 86_400_000;
  return new Date(boundary - KST_OFFSET);
}

// 저장값 기준 "지금 유효한" 행동치 계산 (lazy reset — DB 쓰기는 액션에서)
export function effectiveAp(ap: number | null, apResetAt: Date | null): number {
  if (!apResetAt || apResetAt < currentResetBoundary()) return AP_MAX;
  return ap ?? AP_MAX;
}

// ── 맵 시트 파서 ──
export const WORLD_TAB = process.env.WORLD_TAB_NAME || "맵";

export type WorldRow = {
  id: string;
  name: string;
  emoji: string | null;
  desc: string | null;
  conns: string[];
  hidden: boolean;
  isStart: boolean;
};

const HEADER_KEYS: Record<string, string> = {
  ID: "id",
  id: "id",
  이름: "name",
  이모지: "emoji",
  설명: "desc",
  연결: "conns",
  히든: "hidden",
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
      `'${WORLD_TAB}' 탭이 없거나 헤더(ID/이름)가 없어요. 마스터 시트에 '${WORLD_TAB}' 탭을 만들고 WORLD.md 양식대로 채워주세요.`,
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
    if (!/^[\w-]+$/.test(id)) {
      throw new Error(`장소 ID '${id}' 는 영문/숫자/하이픈만 사용할 수 있어요.`);
    }
    if (seen.has(id)) throw new Error(`장소 ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    rows.push({
      id,
      name,
      emoji: cell(colMap.emoji) || null,
      desc: cell(colMap.desc) || null,
      conns: cell(colMap.conns)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      hidden: yes(cell(colMap.hidden)),
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
  const url = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(
    WORLD_TAB,
  )}`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error("맵 시트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");

  const text = await res.text();
  if (/google\.visualization\.Query|"status":"error"/.test(text)) {
    throw new Error(`마스터 시트에 '${WORLD_TAB}' 탭이 없어요. 탭을 만들고 양식대로 채워주세요.`);
  }
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error("시트가 비공개예요. '링크가 있는 모든 사용자 보기 가능'으로 공유해주세요.");
  }
  return parseWorldGrid(parseCsv(text));
}
