export const MASTER_SHEET_ID =
  process.env.MASTER_SHEET_ID || "1fHofIK9o4eeA2HZ_OQP4h4rOt87dzZ7jDCibmrBROug";
export const NPC_SHEET_ID =
  process.env.NPC_SHEET_ID || "1JmeqtVXbQr3A4z0VwLUDKFU5bjJ8tsQCfhZQ-fn_Dys";

export const MASTER_SHEET_URL = `https://docs.google.com/spreadsheets/d/${MASTER_SHEET_ID}/edit`;
export const NPC_SHEET_URL = `https://docs.google.com/spreadsheets/d/${NPC_SHEET_ID}/edit`;
export const CHARACTER_SHEET_IDS = Array.from(new Set([MASTER_SHEET_ID, NPC_SHEET_ID].filter(Boolean)));

export type StatEntry = { key: string; label: string; value: number | null; mod: number | null };

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SheetsValuesResponse = {
  values?: string[][];
};

export type ParsedSheet = {
  sourceSheetId: string;
  charName: string | null;
  charClass: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  adventurerRank: string | null;
  fame: number | null;
  stats: StatEntry[];
  skills: SheetSkill[];
};

// 시트 스킬란에서 SL 1 이상 찍힌(=배운) 스킬
export type SheetSkill = { name: string; sl: number };

const ABILITY_LABELS = ["근력", "재주", "민첩", "지력", "감지", "정신", "행운"];
const ABILITY_KEYS = ["STR", "DEX", "AGI", "INT", "PER", "SPI", "LUK"];
let tokenCache: { token: string; expiresAt: number } | null = null;

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

function quoteSheet(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

function credentials(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

async function accessToken(): Promise<string | null> {
  const sa = credentials();
  if (!sa) return null;

  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 60 > now) return tokenCache.token;

  const { SignJWT, importPKCS8 } = await import("jose");
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return tokenCache.token;
}

async function fetchSheetByApi(sheetId: string, tabName: string): Promise<string[][] | null> {
  const token = await accessToken();
  if (!token) return null;

  // 스킬란(B65:D104, B144:D181)까지 포함해야 하므로 181행까지 읽는다
  const range = `${quoteSheet(tabName)}!A1:AK181`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range,
  )}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as SheetsValuesResponse;
  return data.values ?? [];
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

function toFirstNum(v: string): number | null {
  const m = v.match(/-?\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? null : n;
}

function parseRank(v: string): string | null {
  const m = v.toUpperCase().match(/\b([DCBAS])\b/);
  return m ? m[1] : null;
}

function rankFromFame(fame: number | null): string | null {
  if (fame == null) return null;
  if (fame >= 100) return "S";
  if (fame >= 60) return "A";
  if (fame >= 25) return "B";
  if (fame >= 10) return "C";
  return "D";
}

function fameCells(g: string[][]): string[] {
  return [
    at(g, 9, 14), // O10
    at(g, 8, 14), // O9
  ].filter(Boolean);
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

// 스킬란 파싱 — 이름 B65:D104·B144:D181 (병합 셀, 값은 B열), SL G65:G104·G144:G181.
// SL 1 이상만 "배운 스킬"로 인정한다.
function parseSheetSkills(g: string[][]): SheetSkill[] {
  const blocks: [number, number][] = [
    [64, 103], // 65~104행 (0-기준)
    [143, 180], // 144~181행
  ];
  const skills: SheetSkill[] = [];
  const seen = new Set<string>();
  for (const [from, to] of blocks) {
    for (let r = from; r <= to; r++) {
      const name = at(g, r, 1); // B열
      if (!name || name === "-") continue;
      const sl = toFirstNum(at(g, r, 6)); // G열
      if (sl == null || sl < 1) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      skills.push({ name, sl });
    }
  }
  return skills;
}

export function parseSheetGrid(g: string[][], tabName: string, sourceSheetId = MASTER_SHEET_ID): ParsedSheet {
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
  const fameValues = fameCells(g); // O9:O10 only
  const fame = fameValues.map(toFirstNum).find((value) => value != null) ?? 0;
  const adventurerRank =
    fameValues.map(parseRank).find((value) => value != null) ?? rankFromFame(fame);
  return {
    sourceSheetId,
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
    adventurerRank,
    fame,
    stats,
    skills: parseSheetSkills(g),
  };
}

function isCharacterSheetGrid(g: string[][]): boolean {
  return !!find(g, "HP");
}

async function fetchSheetByCsv(sheetId: string, tabName: string): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(
    tabName,
  )}`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) return null;

  const text = await res.text();
  if (/google\.visualization\.Query|"status":"error"/.test(text)) return null;
  if (/^\s*<(!doctype|html)/i.test(text)) return null;
  return parseCsv(text);
}

async function fetchParsedSheetFromSheetId(
  sheetId: string,
  tabName: string,
): Promise<ParsedSheet | null> {
  const apiGrid = await fetchSheetByApi(sheetId, tabName);
  if (apiGrid && isCharacterSheetGrid(apiGrid)) return parseSheetGrid(apiGrid, tabName, sheetId);

  const csvGrid = await fetchSheetByCsv(sheetId, tabName);
  if (csvGrid && isCharacterSheetGrid(csvGrid)) return parseSheetGrid(csvGrid, tabName, sheetId);

  return null;
}

export async function fetchSheetByTab(tabName: string): Promise<ParsedSheet> {
  const tab = tabName.trim();
  for (const sheetId of CHARACTER_SHEET_IDS) {
    const parsed = await fetchParsedSheetFromSheetId(sheetId, tab);
    if (parsed) return parsed;
  }

  const apiGrid = await fetchSheetByApi(MASTER_SHEET_ID, tabName.trim());
  if (apiGrid && (find(apiGrid, "【능력 기본치】") || find(apiGrid, "HP"))) {
    return parseSheetGrid(apiGrid, tabName.trim());
  }

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
