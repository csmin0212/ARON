// 포션 탭 → AlchemyRecipe DB (parsePotionsGrid 동치 로직). 검증·즉시 시드용.
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
function parseIngredients(spec) {
  const out = [];
  for (const raw of String(spec).split(/[,，]/)) {
    const part = raw.trim(); if (!part) continue;
    const m = part.match(/^(.+?)(?:[xX×](\d+))?$/); if (!m) continue;
    const name = m[1].trim(), qty = m[2] ? parseInt(m[2], 10) : 1;
    const ex = out.find((i) => i.name === name);
    if (ex) ex.qty += qty; else out.push({ name, qty });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
(async () => {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent("포션")}`, { redirect: "follow" });
  const g = parseCsv(await res.text());
  const H = g[0].map((s) => String(s).trim().replace(/\(.*?\)$/, ""));
  const c = (n) => H.indexOf(n);
  const C = { id: c("포션ID"), name: c("이름"), category: c("분류"), rank: c("등급"), facility: c("필요시설"),
    ing: c("재료"), result: c("결과"), effect: c("효과"), duration: c("지속"), exp: c("숙련도"),
    tags: c("태그"), pub: c("공개"), price: c("판매가"), best: c("최적시간"), tol: c("오차"), perfect: c("완벽효과") };
  const rows = [];
  for (let r = 1; r < g.length; r++) {
    const name = (g[r][C.name] || "").trim();
    const ing = (g[r][C.ing] || "").trim();
    const resultSpec = (g[r][C.result] || "").trim();
    if (!name || !ing || !resultSpec) continue;
    const result = parseIngredients(resultSpec)[0];
    rows.push({
      id: (g[r][C.id] || "").trim() || name,
      name,
      category: (g[r][C.category] || "").trim() || "포션",
      rank: (g[r][C.rank] || "").trim() || "R1",
      facility: (g[r][C.facility] || "").trim() || "연금술 공방",
      ingredientsJson: JSON.stringify(parseIngredients(ing)),
      resultName: result.name,
      resultQty: result.qty,
      effect: (g[r][C.effect] || "").trim() || null,
      duration: (g[r][C.duration] || "").trim() || null,
      skillExp: numOf(g[r][C.exp]) ?? 0,
      tags: (g[r][C.tags] || "").trim() || null,
      sellPrice: numOf(g[r][C.price]) ?? 1,
      weight: 1,
      isPublic: /^(y|yes|true|1|공개)$/i.test((g[r][C.pub] || "").trim()),
      bestMinutes: Math.max(1, numOf(g[r][C.best]) ?? 5),
      tolerance: Math.max(0, numOf(g[r][C.tol]) ?? 0),
      perfectEffect: (g[r][C.perfect] || "").trim() || null,
    });
  }
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  await prisma.$transaction([
    prisma.alchemyRecipe.deleteMany(),
    prisma.alchemyRecipe.createMany({ data: rows.map((it, i) => ({ ...it, order: i })) }),
  ]);
  console.log(`반영: 포션 ${rows.length}개`);
  const sample = await prisma.alchemyRecipe.findMany({ select: { id: true, name: true, rank: true, sellPrice: true, bestMinutes: true, tolerance: true, perfectEffect: true } });
  for (const s of sample) console.log(`  ${s.name} ${s.rank} ${s.sellPrice}G ⏱${s.bestMinutes}±${s.tolerance} 완벽:${(s.perfectEffect ?? "").slice(0, 20)}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
