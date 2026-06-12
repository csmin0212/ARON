import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import { MASTER_SHEET_ID } from "./charsheet";

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
  const token = await accessToken();
  if (!token) return null;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_SHEET_ID}/values/${encodeURIComponent(
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

export async function readSheetInventory(tab: string | null): Promise<SheetInventory | null> {
  if (!tab) return null;

  try {
    const values = await getValues(`${quoteSheet(tab)}!Z31:AK58`);
    if (!values) return null;

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

    return { gold, curWeight, maxWeight, items };
  } catch (error) {
    console.warn("Failed to read sheet inventory", error);
    return null;
  }
}

export async function syncSheetGold(tab: string | null, gold: number): Promise<void> {
  if (!tab) return;
  try {
    await updateValues(`${quoteSheet(tab)}!AB31`, [[`${gold}G`]]);
  } catch (error) {
    console.warn("Failed to sync sheet gold", error);
  }
}

export async function appendSheetItem(
  tab: string | null,
  itemName: string,
  qty: number,
): Promise<void> {
  if (!tab || qty <= 0) return;

  const blocks = [
    { col: "Z", qtyCol: "AE", start: 33, maxRows: 26, range: `${quoteSheet(tab)}!Z33:AE58` },
    { col: "AF", qtyCol: "AK", start: 32, maxRows: 27, range: `${quoteSheet(tab)}!AF32:AK58` },
  ];

  try {
    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return;

      const existing = findItemRow(values, block.start, itemName);
      if (existing) {
        await updateValues(`${quoteSheet(tab)}!${block.qtyCol}${existing.row}`, [
          [String(existing.qty + qty)],
        ]);
        return;
      }
    }

    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return;

      const row = firstEmptyRow(values, block.start, block.maxRows);
      if (!row) continue;

      await updateValues(`${quoteSheet(tab)}!${block.col}${row}`, [
        [itemName, "", "", "", "1", String(qty)],
      ]);
      return;
    }
  } catch (error) {
    console.warn("Failed to append sheet item", error);
  }
}
