// 구글 스프레드시트(코코포리아 아리안로드 캐릭터 시트) 파서
// 시트는 "링크가 있는 모든 사용자 보기 가능"으로 공유돼 있어야 읽을 수 있음.

export type StatEntry = { key: string; label: string; value: number | null; mod: number | null };

export type ParsedSheet = {
  charName: string | null;
  charClass: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  stats: StatEntry[];
};

const STAT_DEFS: { key: string; label: string; row: number }[] = [
  { key: "STR", label: "근력", row: 19 },
  { key: "DEX", label: "재주", row: 20 },
  { key: "AGI", label: "민첩", row: 21 },
  { key: "INT", label: "지력", row: 22 },
  { key: "PER", label: "감지", row: 23 },
  { key: "SPI", label: "정신", row: 24 },
  { key: "LUK", label: "행운", row: 25 },
];
const STAT_VALUE_COL = 18; // 【능력치】
const STAT_MOD_COL = 21; // 고정치(판정 수정)

export function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([\w-]+)/);
  return m ? m[1] : null;
}

function extractGid(url: string): string | null {
  const m = url.match(/[?#&]gid=(\d+)/);
  return m ? m[1] : null;
}

export function isGoogleSheetUrl(url: string): boolean {
  return /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(url.trim());
}

// 따옴표/개행 처리하는 최소 CSV 파서
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (c === "\r") {
        /* skip */
      } else cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cell(grid: string[][], r: number, c: number): string | null {
  const v = (grid[r]?.[c] ?? "").trim();
  if (!v || v === "-" || v === "#N/A" || v === "(닉네임)") return null;
  return v;
}

function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

export function parseSheetCsv(text: string): ParsedSheet {
  const g = parseCsv(text);
  return {
    charName: cell(g, 6, 2),
    charClass: cell(g, 8, 11),
    level: toNum(cell(g, 29, 2)),
    hp: toNum(cell(g, 12, 11)),
    mp: toNum(cell(g, 12, 12)),
    fate: toNum(cell(g, 12, 13)),
    gold: cell(g, 30, 26),
    stats: STAT_DEFS.map((s) => ({
      key: s.key,
      label: s.label,
      value: toNum(cell(g, s.row, STAT_VALUE_COL)),
      mod: toNum(cell(g, s.row, STAT_MOD_COL)),
    })),
  };
}

// 시트 URL → CSV 가져와 파싱
export async function fetchAndParseSheet(url: string): Promise<ParsedSheet> {
  const id = extractSheetId(url);
  if (!id) throw new Error("올바른 구글 스프레드시트 주소가 아니에요.");

  const gid = extractGid(url);
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${
    gid ? `&gid=${gid}` : ""
  }`;

  const res = await fetch(csvUrl, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error("시트를 불러오지 못했어요. 공유 설정을 확인해주세요.");

  const text = await res.text();
  // 비공개 시트는 로그인 HTML 페이지를 반환함
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error("시트가 비공개예요. '링크가 있는 모든 사용자 보기 가능'으로 공유해주세요.");
  }

  return parseSheetCsv(text);
}
