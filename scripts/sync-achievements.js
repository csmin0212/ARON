// 업적 탭 → Achievement DB (parseAchievementsGrid 동치 로직). 검증·즉시 시드용.
// 유저 달성기록(UserAchievement)은 보존하고 정의만 교체한다 (world.ts GM 동기화와 동일).
const fs = require("fs"), path = require("path");
try { for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v; } } } catch {}
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
function parseCsv(text) {
  text = text.replace(/^﻿/, ""); const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
const numOf = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isNaN(n) ? null : n; };
(async () => {
  // export CSV(gid) 사용 — gviz는 편집 직후 캐시가 낡아 일부 행이 빠질 수 있다
  const ACH_GID = "2027921116";
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${ACH_GID}`, { redirect: "follow" });
  const g = parseCsv(await res.text());
  const H = g[0].map((s) => String(s).trim());
  const c = (n) => H.indexOf(n);
  const C = { id: c("업적ID"), category: c("분류"), name: c("이름"), desc: c("설명"), condType: c("조건타입"),
    condValue: c("조건값"), rewardTitle: c("보상칭호"), rewardFame: c("보상명성"), badge: c("배지"), isPublic: c("공개") };
  const rows = [], seen = new Set();
  for (let r = 1; r < g.length; r++) {
    const name = (g[r][C.name] || "").trim();
    const condType = (g[r][C.condType] || "").replace(/\s+/g, "");
    if (!name || !condType) continue;
    const id = (g[r][C.id] || "").trim() || name;
    if (seen.has(id)) { console.error("중복 업적 ID:", id); process.exit(1); }
    seen.add(id);
    rows.push({
      id,
      category: (g[r][C.category] || "").trim() || "기타",
      name,
      desc: (g[r][C.desc] || "").trim() || null,
      condType,
      condValue: (g[r][C.condValue] || "").trim() || null,
      rewardTitle: (g[r][C.rewardTitle] || "").trim() || null,
      rewardFame: numOf(g[r][C.rewardFame]) ?? 0,
      badge: (g[r][C.badge] || "").trim() || null,
      secret: !/^(true|yes|y|1|공개)$/i.test((g[r][C.isPublic] || "").trim()),
    });
  }
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  await prisma.$transaction([
    prisma.achievement.deleteMany(),
    prisma.achievement.createMany({ data: rows.map((it, i) => ({ ...it, order: i })) }),
  ]);
  console.log(`반영: 업적 ${rows.length}개`);
  const byCat = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
  for (const [cat, n] of Object.entries(byCat)) console.log(`  ${cat}: ${n}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
