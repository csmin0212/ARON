// 시간대별 월드 활동량 — "새벽에 사람이 있었나?" 같은 질문을 DB로 바로 확인.
// 월드 로그(WorldMessage)는 채팅 + 행동 결과(시스템)가 모두 시각과 함께 쌓인다.
//
// 사용법:  node scripts/activity.mjs [시간범위]
//   node scripts/activity.mjs        → 최근 24시간
//   node scripts/activity.mjs 48     → 최근 48시간
//
// 주의: WorldMessage 는 24시간 지나면 자동 정리되므로 그 이전 기록은 남지 않는다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const l of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
    const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {}

const hours = Number(process.argv[2] ?? 24) || 24;

const { PrismaClient } = await import(
  pathToFileURL(path.join(ROOT, "src/generated/prisma/index.js")).href
);
const prisma = new PrismaClient();

const rows = await prisma.$queryRawUnsafe(`
  SELECT to_char(date_trunc('hour', "createdAt" AT TIME ZONE 'Asia/Seoul'), 'MM-DD HH24시') AS hour_kst,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE "system")::int AS sys,
         COUNT(*) FILTER (WHERE NOT "system")::int AS chat,
         COUNT(DISTINCT "userId")::int AS chatters
  FROM "WorldMessage"
  WHERE "createdAt" > now() - interval '${hours} hours'
  GROUP BY 1 ORDER BY 1
`);

const max = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
console.log(`\n최근 ${hours}시간 월드 활동 (KST)\n`);
console.log("시간          총로그  행동  채팅  채팅유저");
for (const r of rows) {
  const bar = "█".repeat(Math.max(1, Math.round((r.total / max) * 28)));
  console.log(
    `${r.hour_kst}  ${String(r.total).padStart(5)} ${String(r.sys).padStart(5)} ${String(r.chat).padStart(5)} ${String(r.chatters).padStart(5)}  ${bar}`,
  );
}
const sum = rows.reduce((s, r) => s + r.total, 0);
console.log(`\n합계 ${sum.toLocaleString("ko-KR")}건 · 시간당 평균 ${Math.round(sum / (rows.length || 1)).toLocaleString("ko-KR")}건\n`);

await prisma.$disconnect();
