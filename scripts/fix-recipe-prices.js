// 레시피 시트의 판매가·숙련도를 DB에 직접 반영 (동기화가 레시피를 누락한 경우 즉시 교정).
const fs = require("fs"), path = require("path");
try { for (const l of fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8").split("\n")) { const m = l.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); process.env[m[1]] = v; } } } catch {}
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4", GID = "1125022636";
function parseCsv(text) {
  text = text.replace(/^﻿/, ""); const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
const numOf = (v) => { const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10); return Number.isNaN(n) ? null : n; };
(async () => {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${GID}`, { redirect: "follow" });
  const g = parseCsv(await res.text());
  const H = g[0]; const col = (n) => H.indexOf(n);
  const cId = col("레시피ID"), cP = col("판매가"), cE = col("숙련도"), cEff = col("효과");
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  let updated = 0, miss = 0;
  for (let r = 1; r < g.length; r++) {
    const id = (g[r][cId] || "").trim(); if (!id) continue;
    const sellPrice = numOf(g[r][cP]) ?? 1;
    const skillExp = numOf(g[r][cE]) ?? 0;
    const effect = (g[r][cEff] || "").trim() || null;
    try { await prisma.cookingRecipe.update({ where: { id }, data: { sellPrice, skillExp, effect } }); updated++; }
    catch { miss++; console.log("DB에 없는 레시피ID:", id); }
  }
  console.log(`\n반영 완료: ${updated}개 (판매가·숙련도·효과) · 누락 ${miss}개`);
  const sample = await prisma.cookingRecipe.findMany({ select: { name: true, sellPrice: true, skillExp: true }, orderBy: { order: "asc" }, take: 5 });
  for (const s of sample) console.log(`  ${s.name} | 판매가 ${s.sellPrice} | 숙련 ${s.skillExp}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
