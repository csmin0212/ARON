import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import { CHARACTER_SHEET_IDS, MASTER_SHEET_ID } from "./charsheet";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

type SheetsValuesResponse = {
  values?: string[][];
};

export type SheetInventoryItem = {
  name: string;
  effect: string | null;
  weight: number | null;
  qty: number;
};

export type SheetInventory = {
  sourceSheetId?: string;
  gold: string | null;
  curWeight: number | null;
  maxWeight: number | null;
  items: SheetInventoryItem[];
};

let tokenCache: { token: string; expiresAt: number } | null = null;

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

  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets",
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

function quoteSheet(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

async function getValues(range: string): Promise<string[][] | null> {
  return getValuesFromSheet(MASTER_SHEET_ID, range);
}

async function getValuesFromSheet(sheetId: string, range: string): Promise<string[][] | null> {
  const token = await accessToken();
  if (!token) return null;

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

async function updateValues(range: string, values: string[][]): Promise<boolean> {
  const token = await accessToken();
  if (!token) return false;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${encodeURIComponent(
    range,
  )}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    cache: "no-store",
  });
  return res.ok;
}

function firstEmptyRow(values: string[][], startRow: number, maxRows: number): number | null {
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    if (row.every((cell) => !String(cell ?? "").trim())) return startRow + i;
  }
  if (values.length < maxRows) return startRow + values.length;
  return null;
}

function findItemRow(values: string[][], startRow: number, itemName: string): { row: number; qty: number } | null {
  const target = itemName.trim();
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    if (cell(row, 0) === target) return { row: startRow + i, qty: parseQty(cell(row, 5)) };
  }
  return null;
}

function cell(row: string[] | undefined, index: number): string {
  return String(row?.[index] ?? "").trim();
}

function parseNumber(raw: string): number | null {
  const n = parseInt(raw.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

function parseQty(raw: string): number {
  return parseNumber(raw) ?? 1;
}

export function inventoryWeightTotal(items: SheetInventoryItem[]): number | null {
  let hasKnownWeight = false;
  const total = items.reduce((sum, item) => {
    if (item.weight == null || item.qty <= 0) return sum;
    hasKnownWeight = true;
    return sum + item.weight * item.qty;
  }, 0);
  return hasKnownWeight ? total : null;
}

function parseWeightPair(raw: string): { curWeight: number | null; maxWeight: number | null } {
  const m = raw.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { curWeight: null, maxWeight: null };
  return { curWeight: parseInt(m[1], 10), maxWeight: parseInt(m[2], 10) };
}

function parseInventoryWeight(top: string[]): { curWeight: number | null; maxWeight: number | null } {
  const curWeight = parseNumber(cell(top, 4)); // AD31
  const maxWeight = parseNumber(cell(top, 5)); // AE31
  if (curWeight != null || maxWeight != null) return { curWeight, maxWeight };

  return parseWeightPair(top.join(" "));
}

function parseItemBlock(row: string[], offset: number): SheetInventoryItem | null {
  const name = cell(row, offset);
  if (!name || name === "휴대품") return null;

  const effect = [cell(row, offset + 1), cell(row, offset + 2), cell(row, offset + 3)]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name,
    effect: effect || null,
    weight: parseNumber(cell(row, offset + 4)),
    qty: parseQty(cell(row, offset + 5)),
  };
}

function parseSheetInventoryValues(values: string[][], sourceSheetId: string): SheetInventory {
  const top = values[0] ?? [];
  const gold = top.find((v) => /G/i.test(String(v ?? "")))?.trim() ?? null;
  const { curWeight, maxWeight } = parseInventoryWeight(top);
  const items: SheetInventoryItem[] = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const left = i >= 2 ? parseItemBlock(row, 0) : null;
    const right = i >= 1 ? parseItemBlock(row, 6) : null;
    if (left) items.push(left);
    if (right) items.push(right);
  }

  return {
    sourceSheetId,
    gold,
    curWeight: inventoryWeightTotal(items) ?? curWeight,
    maxWeight,
    items,
  };
}

export async function readSheetInventory(tab: string | null): Promise<SheetInventory | null> {
  if (!tab) return null;

  try {
    const range = `${quoteSheet(tab)}!Z31:AK58`;
    for (const sheetId of CHARACTER_SHEET_IDS) {
      const values = await getValuesFromSheet(sheetId, range);
      if (!values) continue;
      return parseSheetInventoryValues(values, sheetId);
    }
    return null;
  } catch (error) {
    console.warn("Failed to read sheet inventory", error);
    return null;
  }
}

export async function syncSheetWeight(tab: string | null, curWeight: number): Promise<boolean> {
  if (!tab) return false;
  try {
    return updateValues(`${quoteSheet(tab)}!AD31`, [[String(curWeight)]]);
  } catch (error) {
    console.warn("Failed to sync sheet weight", error);
    return false;
  }
}

// AA31:AB31 병합 셀 — 값은 앵커(AA31)에만 들어가므로 AB31에 쓰면 화면에 안 보인다.
export const GOLD_CELL = "AA31";

export async function syncSheetGold(tab: string | null, gold: number): Promise<boolean> {
  if (!tab) return false;
  try {
    return updateValues(`${quoteSheet(tab)}!${GOLD_CELL}`, [[`${gold}G`]]);
  } catch (error) {
    console.warn("Failed to sync sheet gold", error);
    return false;
  }
}

// 골드 칸은 경험점처럼 시트의 기존 수식을 보존하고 끝에 +N/-N 만 붙인다.
// (절대값 덮어쓰기를 하면 시트에 손으로 넣은 수식이 사라지므로)
export async function appendSheetGold(tab: string | null, delta: number): Promise<boolean> {
  if (!tab || delta === 0) return false;
  try {
    const range = `${quoteSheet(tab)}!${GOLD_CELL}`;
    const cur = await getCellFormula(range);
    if (cur == null) return false;

    const op = delta < 0 ? "-" : "+";
    const mag = Math.abs(delta);
    let next: string;
    if (cur.startsWith("=")) {
      // 수식 보존 — 끝에 +/-N
      next = `${cur}${op}${mag}`;
    } else {
      // 옛 텍스트 값("500G" 등) 호환 — 숫자만 뽑아 가감, 'G' 표기는 유지
      const hadG = /G\s*$/i.test(cur);
      const n = parseInt(cur.replace(/[^\d-]/g, ""), 10);
      const sum = (Number.isFinite(n) ? n : 0) + delta;
      next = hadG ? `${sum}G` : String(sum);
    }
    return updateValues(range, [[next]]);
  } catch (error) {
    console.warn("Failed to append sheet gold", error);
    return false;
  }
}

// 셀의 수식 원문 읽기 (계산값 아님)
async function getCellFormula(range: string): Promise<string | null> {
  const token = await accessToken();
  if (!token) return null;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${encodeURIComponent(
    range,
  )}?valueRenderOption=FORMULA`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as SheetsValuesResponse;
  const v = data.values?.[0]?.[0];
  return v == null ? "" : String(v);
}

// 경험점처럼 수식이 있는 칸에 값을 더한다. 수식이면 끝에 '+N'을 붙여 원 수식 보존.
export async function appendSheetFormula(
  tab: string | null,
  cell: string,
  addend: number,
): Promise<boolean> {
  if (!tab || addend === 0) return false;
  try {
    const range = `${quoteSheet(tab)}!${cell}`;
    const cur = await getCellFormula(range);
    if (cur == null) return false;
    let next: string;
    if (cur.startsWith("=")) {
      next = `${cur}+${addend}`;
    } else {
      const n = Number(cur);
      next = cur.trim() !== "" && Number.isFinite(n) ? String(n + addend) : `=${addend}`;
    }
    return updateValues(range, [[next]]);
  } catch (error) {
    console.warn("Failed to append sheet formula", error);
    return false;
  }
}

export async function appendSheetItem(
  tab: string | null,
  itemName: string,
  qty: number,
  details: { effect?: string | null; weight?: number | null } = {},
): Promise<boolean> {
  if (!tab || qty <= 0) return false;

  const blocks = [
    {
      col: "Z",
      effectCol: "AB", // 효과 병합 셀(AB:AC)의 앵커 — AA는 이름 병합에 먹혀 화면에 안 보인다
      weightCol: "AD",
      qtyCol: "AE",
      start: 33,
      maxRows: 26,
      range: `${quoteSheet(tab)}!Z33:AE58`,
    },
    {
      col: "AF",
      effectCol: "AH", // 효과 병합 셀(AH:AI)의 앵커
      weightCol: "AJ",
      qtyCol: "AK",
      start: 32,
      maxRows: 27,
      range: `${quoteSheet(tab)}!AF32:AK58`,
    },
  ];

  try {
    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return false;

      const existing = findItemRow(values, block.start, itemName);
      if (existing) {
        const updates = [
          updateValues(`${quoteSheet(tab)}!${block.qtyCol}${existing.row}`, [
            [String(existing.qty + qty)],
          ]),
        ];
        if (details.effect) {
          updates.push(
            updateValues(`${quoteSheet(tab)}!${block.effectCol}${existing.row}`, [
              [details.effect],
            ]),
          );
        }
        if (details.weight != null) {
          updates.push(
            updateValues(`${quoteSheet(tab)}!${block.weightCol}${existing.row}`, [
              [String(details.weight)],
            ]),
          );
        }
        const results = await Promise.all(updates);
        return results.every(Boolean);
      }
    }

    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return false;

      const row = firstEmptyRow(values, block.start, block.maxRows);
      if (!row) continue;

      return updateValues(`${quoteSheet(tab)}!${block.col}${row}`, [
        [itemName, details.effect ?? "", "", "", String(details.weight ?? 1), String(qty)],
      ]);
    }
  } catch (error) {
    console.warn("Failed to append sheet item", error);
  }
  return false;
}

// 캐릭터 클래스(직업) 읽기 — B36:E37(메인), F36:I37(서브) 병합 셀의 값.
export async function readSheetClasses(tab: string | null): Promise<string[]> {
  if (!tab) return [];
  try {
    let v: string[][] | null = null;
    const range = `${quoteSheet(tab)}!B36:I36`;
    for (const sheetId of CHARACTER_SHEET_IDS) {
      v = await getValuesFromSheet(sheetId, range);
      if (v) break;
    }
    if (!v) return [];
    const row = v[0] ?? [];
    const main = cell(row, 0); // B36
    const sub = cell(row, 4); // F36
    return [main, sub].filter((c) => c.length > 0);
  } catch (error) {
    console.warn("Failed to read sheet classes", error);
    return [];
  }
}

// ── 전투스킬 기입 (스킬북 사용) ──
// 헤더는 B63:AK64(2행 병합), 데이터는 65~104행. 헤더 라벨을 읽어 컬럼을 자동 매핑한다.
export type SheetSkill = {
  name: string;
  category?: string | null;
  subCategory?: string | null;
  sl?: string | null;
  slMax?: string | null;
  timing?: string | null;
  range?: string | null;
  check?: string | null;
  target?: string | null;
  cost?: string | null;
  condition?: string | null;
  effect?: string | null;
  critical?: string | null;
};

const SKILL_HEADER_A1 = "B63:AK64";
const SKILL_DATA_A1 = "B65:AK104";
const SKILL_DATA_START_ROW = 65;
const SKILL_COL_COUNT = 36; // B..AK

// 시트 헤더 라벨(띄어쓰기·대소문자 무시) → SheetSkill 키
const SKILL_FIELD_BY_LABEL: Record<string, keyof SheetSkill> = {
  스킬이름: "name",
  이름: "name",
  스킬명: "name",
  분류: "category",
  추가분류: "subCategory",
  sl: "sl",
  sl상한: "slMax",
  타이밍: "timing",
  사거리: "range",
  판정: "check",
  대상: "target",
  코스트: "cost",
  사용조건: "condition",
  효과: "effect",
  크리티컬: "critical",
};

const normSkillLabel = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export async function writeSkillRowToSheet(
  tab: string | null,
  skill: SheetSkill,
): Promise<{ ok: boolean; error?: string }> {
  if (!tab) return { ok: false, error: "캐릭터 시트 연동이 필요합니다." };

  try {
    const header = await getValues(`${quoteSheet(tab)}!${SKILL_HEADER_A1}`);
    if (!header) return { ok: false, error: "시트 인증이 필요합니다." };

    // 병합 2행 헤더 — 컬럼마다 두 행 중 채워진 라벨을 채택
    const fieldCol: Partial<Record<keyof SheetSkill, number>> = {};
    for (let c = 0; c < SKILL_COL_COUNT; c++) {
      const label = cell(header[0], c) || cell(header[1], c);
      if (!label) continue;
      const field = SKILL_FIELD_BY_LABEL[normSkillLabel(label)];
      if (field && fieldCol[field] == null) fieldCol[field] = c;
    }
    const nameCol = fieldCol.name;
    if (nameCol == null)
      return { ok: false, error: "스킬 표 헤더(63~64행)에서 '이름' 칸을 찾지 못했어요." };

    const data = (await getValues(`${quoteSheet(tab)}!${SKILL_DATA_A1}`)) ?? [];
    const target = skill.name.trim();

    // 중복 — 이미 같은 이름의 스킬이 있으면 거부
    for (const row of data) {
      if (cell(row, nameCol) === target) return { ok: false, error: "이미 배운 스킬이에요." };
    }

    // 빈 행 찾기
    let emptyIdx = -1;
    for (let i = 0; i < data.length; i++) {
      if (!cell(data[i], nameCol)) {
        emptyIdx = i;
        break;
      }
    }
    if (emptyIdx === -1 && data.length < 40) emptyIdx = data.length;
    if (emptyIdx === -1) return { ok: false, error: "스킬 칸(65~104행)이 가득 찼어요." };

    const rowNumber = SKILL_DATA_START_ROW + emptyIdx;
    const arr = new Array<string>(SKILL_COL_COUNT).fill("");
    (Object.keys(fieldCol) as (keyof SheetSkill)[]).forEach((field) => {
      const c = fieldCol[field];
      if (c != null) arr[c] = String(skill[field] ?? "");
    });

    const ok = await updateValues(`${quoteSheet(tab)}!B${rowNumber}:AK${rowNumber}`, [arr]);
    return ok ? { ok: true } : { ok: false, error: "시트 쓰기에 실패했어요." };
  } catch (error) {
    console.warn("Failed to write skill row", error);
    return { ok: false, error: "스킬 기입 중 오류가 발생했어요." };
  }
}

export async function consumeSheetItem(
  tab: string | null,
  itemName: string,
  qty: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!tab || qty <= 0) return { ok: false, error: "잘못된 요청입니다." };

  const blocks = [
    { qtyCol: "AE", start: 33, range: `${quoteSheet(tab)}!Z33:AE58` },
    { qtyCol: "AK", start: 32, range: `${quoteSheet(tab)}!AF32:AK58` },
  ];
  const matches: { qtyCol: string; row: number; qty: number }[] = [];

  try {
    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return { ok: false, error: "시트 인증이 필요합니다." };

      const target = itemName.trim();
      for (let i = 0; i < values.length; i++) {
        const row = values[i] ?? [];
        if (cell(row, 0) !== target) continue;
        const itemQty = parseQty(cell(row, 5));
        if (itemQty > 0) matches.push({ qtyCol: block.qtyCol, row: block.start + i, qty: itemQty });
      }
    }

    const totalQty = matches.reduce((sum, item) => sum + item.qty, 0);
    if (totalQty < qty) {
      return { ok: false, error: `${itemName} 수량이 부족합니다. (${totalQty}/${qty})` };
    }

    let remaining = qty;
    for (const match of matches) {
      if (remaining <= 0) break;
      const used = Math.min(match.qty, remaining);
      await updateValues(`${quoteSheet(tab)}!${match.qtyCol}${match.row}`, [
        [String(match.qty - used)],
      ]);
      remaining -= used;
    }
    return { ok: true };
  } catch (error) {
    console.warn("Failed to consume sheet item", error);
  }

  return { ok: false, error: `${itemName}을 찾지 못했습니다.` };
}

export async function updateSheetItemDetails(
  tab: string | null,
  itemName: string,
  patch: { name?: string; effect?: string; weight?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  if (!tab) return { ok: false, error: "시트가 연동되지 않았습니다." };

  const blocks = [
    // 효과는 병합 셀 앵커(AB·AH)에 써야 화면에 보인다 (AA·AG는 이름 병합 영역)
    { nameCol: "Z", effectCol: "AB", weightCol: "AD", start: 33, range: `${quoteSheet(tab)}!Z33:AE58` },
    { nameCol: "AF", effectCol: "AH", weightCol: "AJ", start: 32, range: `${quoteSheet(tab)}!AF32:AK58` },
  ];

  try {
    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return { ok: false, error: "시트 인증이 필요합니다." };

      const existing = findItemRow(values, block.start, itemName);
      if (!existing) continue;

      const updates: Promise<boolean>[] = [];
      if (patch.name !== undefined) {
        updates.push(
          updateValues(`${quoteSheet(tab)}!${block.nameCol}${existing.row}`, [[patch.name]]),
        );
      }
      if (patch.effect !== undefined) {
        updates.push(
          updateValues(`${quoteSheet(tab)}!${block.effectCol}${existing.row}`, [[patch.effect]]),
        );
      }
      if (patch.weight !== undefined && patch.weight != null) {
        updates.push(
          updateValues(`${quoteSheet(tab)}!${block.weightCol}${existing.row}`, [
            [String(patch.weight)],
          ]),
        );
      }
      const results = await Promise.all(updates);
      return results.every(Boolean)
        ? { ok: true }
        : { ok: false, error: "시트에 아이템 정보를 쓰지 못했습니다." };
    }
  } catch (error) {
    console.warn("Failed to update sheet item", error);
  }

  return { ok: false, error: `${itemName}을 찾지 못했습니다.` };
}

// DB(invJson) 기준으로 시트 휴대품·골드·무게를 통째로 다시 씀 (주기적 푸셔용).
// 두 블록(Z33:AE58 26행 + AF32:AK58 27행)을 빈 행까지 포함해 전부 덮어써 옛 항목을 지움.
const PUSH_BLOCK1_ROWS = 26; // Z33:AE58
const PUSH_BLOCK2_ROWS = 27; // AF32:AK58

function inventoryRow(item?: SheetInventoryItem): string[] {
  if (!item || item.qty <= 0) return ["", "", "", "", "", ""];
  // [이름(Z/AF), (이름 병합), 효과(AB/AH 앵커), (효과 병합), 중량, 수량]
  return [
    item.name,
    "",
    item.effect ?? "",
    "",
    item.weight != null ? String(item.weight) : "",
    String(item.qty),
  ];
}

export async function pushInventoryToSheet(
  tab: string | null,
  inv: SheetInventory,
): Promise<boolean> {
  if (!tab) return false;
  try {
    const items = inv.items.filter((item) => item.qty > 0);
    const block1: string[][] = [];
    for (let i = 0; i < PUSH_BLOCK1_ROWS; i++) block1.push(inventoryRow(items[i]));
    const block2: string[][] = [];
    for (let i = 0; i < PUSH_BLOCK2_ROWS; i++) {
      block2.push(inventoryRow(items[PUSH_BLOCK1_ROWS + i]));
    }

    const writes: Promise<boolean>[] = [
      updateValues(`${quoteSheet(tab)}!Z33:AE58`, block1),
      updateValues(`${quoteSheet(tab)}!AF32:AK58`, block2),
    ];
    // 골드(AA31)는 시트의 기존 수식을 보존하기 위해 여기서 절대값으로 덮어쓰지 않는다.
    // 골드 변동은 그때그때 appendSheetGold 로 수식 끝에 +N/-N 만 누적한다.
    // 중량 합계(AD31)도 시트 수식이 휴대품 칸(중량×수량)으로 계산하므로 직접 쓰지 않는다.

    const results = await Promise.all(writes);
    return results.every(Boolean);
  } catch (error) {
    console.warn("Failed to push inventory to sheet", error);
    return false;
  }
}
