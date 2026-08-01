import "server-only";

import { prisma } from "@/lib/prisma";

export type ServerLogLevel = "info" | "warn" | "error";

export type ServerLogInput = {
  level: ServerLogLevel;
  scope?: string | null;
  message: string;
  meta?: unknown;
};

export type ServerLogRow = {
  id: number;
  createdAt: Date;
  level: ServerLogLevel;
  scope: string | null;
  message: string;
  metaJson: string | null;
};

type ServerLogGlobal = typeof globalThis & {
  __serverLogTableReady?: Promise<void>;
  __serverLogConsolePatched?: boolean;
  __serverLogOriginalConsole?: Pick<Console, "warn" | "error">;
};

const g = globalThis as ServerLogGlobal;
const MESSAGE_MAX = 1500;
const META_MAX = 12000;

function ensureTable(): Promise<void> {
  g.__serverLogTableReady ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ServerLog" (
        "id" SERIAL PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "level" TEXT NOT NULL,
        "scope" TEXT,
        "message" TEXT NOT NULL,
        "metaJson" TEXT
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ServerLog_createdAt_idx" ON "ServerLog" ("createdAt" DESC)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ServerLog_level_createdAt_idx" ON "ServerLog" ("level", "createdAt" DESC)
    `);
  })();
  return g.__serverLogTableReady;
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) out[key] = jsonSafe(child);
    return out;
  }
  return value;
}

function stringifyMeta(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(jsonSafe(value)).slice(0, META_MAX);
  } catch {
    return String(value).slice(0, META_MAX);
  }
}

function formatConsoleArg(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(jsonSafe(value));
  } catch {
    return String(value);
  }
}

async function writeServerLogNow(input: ServerLogInput): Promise<void> {
  const message = input.message.trim();
  if (!message) return;
  await ensureTable();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ServerLog" ("level", "scope", "message", "metaJson")
      VALUES ($1, $2, $3, $4)
    `,
    input.level,
    input.scope ?? null,
    message.slice(0, MESSAGE_MAX),
    stringifyMeta(input.meta),
  );
}

export function writeServerLog(input: ServerLogInput): void {
  void writeServerLogNow(input).catch(() => {
    // 로그 기록 실패가 실제 기능을 막으면 안 된다.
  });
}

export async function readServerLogs({
  level,
  scope,
  q,
  page,
  pageSize,
}: {
  level?: string;
  scope?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ServerLogRow[]; total: number }> {
  await ensureTable();

  const where: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (level) where.push(`"level" = ${addParam(level)}`);
  if (scope) where.push(`"scope" ILIKE ${addParam(`%${scope}%`)}`);
  if (q) {
    const p = addParam(`%${q}%`);
    where.push(`("message" ILIKE ${p} OR COALESCE("metaJson", '') ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const countRows = await prisma.$queryRawUnsafe<{ count: bigint | number | string }[]>(
    `SELECT COUNT(*) AS count FROM "ServerLog" ${whereSql}`,
    ...params,
  );
  const dataRows = await prisma.$queryRawUnsafe<ServerLogRow[]>(
    `
      SELECT "id", "createdAt", "level", "scope", "message", "metaJson"
      FROM "ServerLog"
      ${whereSql}
      ORDER BY "createdAt" DESC
      LIMIT ${addParam(pageSize)} OFFSET ${addParam(offset)}
    `,
    ...params,
  );

  return {
    rows: dataRows,
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function clearServerLogs(): Promise<void> {
  await ensureTable();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "ServerLog" RESTART IDENTITY`);
}

export function installServerLogConsolePatch(): void {
  if (typeof window !== "undefined") return;
  if (g.__serverLogConsolePatched) return;
  g.__serverLogConsolePatched = true;
  g.__serverLogOriginalConsole = { warn: console.warn, error: console.error };

  console.warn = (...args: unknown[]) => {
    g.__serverLogOriginalConsole?.warn(...args);
    writeServerLog({
      level: "warn",
      scope: "console.warn",
      message: args.map(formatConsoleArg).join(" "),
      meta: args,
    });
  };

  console.error = (...args: unknown[]) => {
    g.__serverLogOriginalConsole?.error(...args);
    writeServerLog({
      level: "error",
      scope: "console.error",
      message: args.map(formatConsoleArg).join(" "),
      meta: args,
    });
  };
}
