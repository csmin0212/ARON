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

function firstEmptyRow(values: string[][], startRow: number): number | null {
  for (let i = 0; i < values.length; i++) {
    const row = values[i] ?? [];
    if (row.every((cell) => !String(cell ?? "").trim())) return startRow + i;
  }
  return null;
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
    { col: "Z", start: 33, range: `${quoteSheet(tab)}!Z33:AE58` },
    { col: "AF", start: 32, range: `${quoteSheet(tab)}!AF32:AK58` },
  ];

  try {
    for (const block of blocks) {
      const values = await getValues(block.range);
      if (!values) return;

      const row = firstEmptyRow(values, block.start);
      if (!row) continue;

      await updateValues(`${quoteSheet(tab)}!${block.col}${row}`, [
        [itemName, qty > 1 ? `x${qty}` : "", "", "", "", "사이트 자동 획득"],
      ]);
      return;
    }
  } catch (error) {
    console.warn("Failed to append sheet item", error);
  }
}
