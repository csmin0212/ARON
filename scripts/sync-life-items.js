// 물고기/채집 탭 → LifeSkillItem DB (parseLifeItemsGrid 동치 로직). 검증·즉시 시드용.
const fs = require("fs"), path = require("path");
try { for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v; } } } catch {}
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
const FISH_GID = "1239524226", GATHER_GID = "1011242625";
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
const rankToNum = (s) => { const m = String(s).toUpperCase().match(/R?\s*(\d+)/); return m ? parseInt(m[1], 10) : 0; };
async function fetchGrid(gid) { const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`, { redirect: "follow" }); return parseCsv(await r.text()); }
function parse(g, kind) {
  const H = g[0]; const c = (n) => H.indexOf(n);
  const C = { name: c("이름"), rank: c("등급"), rarity: c("별등급"), weight: c("중량"), price: c("판매가"), exp: c("숙련도"), sb: c("크기기본"), sv: c("크기편차"), hab: c("서식지"), text: c("설명") };
  const out = [], seen = new Set();
  for (let r = 1; r < g.length; r++) {
    const name = (g[r][C.name] || "").trim(); if (!name || seen.has(name)) continue; seen.add(name);
    out.push({ kind, name, rank: rankToNum(g[r][C.rank]), rarity: (g[r][C.rarity] || "").trim() || null,
      weight: numOf(g[r][C.weight]) ?? 1, price: numOf(g[r][C.price]) ?? 0, exp: numOf(g[r][C.exp]) ?? 1,
      sizeBase: numOf(g[r][C.sb]) ?? 1, sizeVar: numOf(g[r][C.sv]) ?? 1,
      habitat: C.hab >= 0 ? ((g[r][C.hab] || "").trim() || null) : null, text: (g[r][C.text] || "").trim() || null });
  }
  return out;
}
(async () => {
  const fish = parse(await fetchGrid(FISH_GID), "낚시");
  const gather = parse(await fetchGrid(GATHER_GID), "채집");
  const all = [...fish, ...gather];
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  await prisma.$transaction([
    prisma.lifeSkillItem.deleteMany(),
    prisma.lifeSkillItem.createMany({ data: all.map((it, i) => ({ ...it, order: i })) }),
  ]);
  console.log(`반영: 낚시 ${fish.length} + 채집 ${gather.length} = ${all.length}개`);
  const seaCount = fish.filter((f) => (f.habitat || "").includes("바다")).length;
  console.log(`바다 어종 ${seaCount}개`);
  const sample = await prisma.lifeSkillItem.findMany({ where: { name: { in: ["붕어", "용어", "사과", "수박", "참치"] } }, select: { name: true, kind: true, rank: true, price: true, exp: true, habitat: true } });
  for (const s of sample) console.log(`  ${s.name}(${s.kind}) R${s.rank} 가격${s.price} exp${s.exp} ${s.habitat ?? ""}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
