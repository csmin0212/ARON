export const MASTER_SHEET_ID =
  process.env.MASTER_SHEET_ID || "1fHofIK9o4eeA2HZ_OQP4h4rOt87dzZ7jDCibmrBROug";

export const MASTER_SHEET_URL = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit`;

export type StatEntry = { key: string; label: string; value: number | null; mod: number | null };

export type ParsedSheet = {
  charName: string | null;
  charClass: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  stats: StatEntry[];
};

const ABILITY_LABELS = ["근력", "재주", "민첩", "지력", "감지", "정신", "행운"];
const ABILITY_KEYS = ["STR", "DEX", "AGI", "INT", "PER", "SPI", "LUK"];

export function parseCsv(text: string): string[][] {
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
      } else if (c !== "\r") {
        cell += c;
      }
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function at(g: string[][], r: number, c: number): string {
  return (g[r]?.[c] ?? "").trim();
}

function find(g: string[][], text: string): [number, number] | null {
  for (let r = 0; r < g.length; r++) {
    const row = g[r] || [];
    for (let c = 0; c < row.length; c++) {
      if ((row[c] ?? "").trim() === text) return [r, c];
    }
  }
  return null;
}

function clean(v: string): string | null {
  const t = v.trim();
  if (!t || t === "-" || t === "#N/A") return null;
  return t;
}

function toNum(v: string): number | null {
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function below(g: string[][], label: string, dr = 1, dc = 0): string | null {
  const p = find(g, label);
  if (!p) return null;
  return clean(at(g, p[0] + dr, p[1] + dc));
}

function beside(g: string[][], label: string, dc = 1): string | null {
  return below(g, label, 0, dc);
}

export function isValidTabName(name: string): boolean {
  const t = name.trim();
  return t.length >= 1 && t.length <= 40;
}

export function parseSheetGrid(g: string[][], tabName: string): ParsedSheet {
  const base = find(g, "【능력 기본치】");
  const stats: StatEntry[] = [];

  if (base) {
    const [hr, hc] = base;
    const valueCol = hc + 1; // M20:M26: ability base values
    const modCol = hc + 10; // fixed modifier used in 2D+X checks

    for (let i = 0; i < 7; i++) {
      const r = hr + 2 + i;
      stats.push({
        key: ABILITY_KEYS[i],
        label: ABILITY_LABELS[i],
        value: toNum(at(g, r, valueCol)),
        mod: toNum(at(g, r, modCol)),
      });
    }
  }

  const hp = find(g, "HP");
  return {
    charName: tabName,
    charClass: below(g, "메인 클래스", 1, 0),
    race: below(g, "종족", 1, 0),
    attribute: below(g, "속성", 1, 0),
    level: (() => {
      const v = beside(g, "Level.", 1);
      return v ? toNum(v) : null;
    })(),
    hp: hp ? toNum(at(g, hp[0] + 1, hp[1])) : null,
    mp: hp ? toNum(at(g, hp[0] + 1, hp[1] + 1)) : null,
    fate: hp ? toNum(at(g, hp[0] + 1, hp[1] + 2)) : null,
    gold: beside(g, "소지금:", 1),
    stats,
  };
}

export async function fetchSheetByTab(tabName: string): Promise<ParsedSheet> {
  const url = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(
    tabName.trim(),
  )}`;

  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error("시트를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");

  const text = await res.text();
  if (/google\.visualization\.Query|"status":"error"/.test(text)) {
    throw new Error(
      `'${tabName}' 탭을 찾지 못했어요. 시트 하단의 탭 이름과 정확히 같게 입력해주세요.`,
    );
  }
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error(
      "시트가 비공개예요. '링크가 있는 모든 사용자 보기 가능'으로 공유해주세요.",
    );
  }

  const g = parseCsv(text);
  if (!find(g, "【능력 기본치】") && !find(g, "HP")) {
    throw new Error(`'${tabName}' 탭에서 캐릭터 정보를 찾지 못했어요. 탭 이름을 확인해주세요.`);
  }

  return parseSheetGrid(g, tabName.trim());
}
