// AP 비례 밸런싱 — 일반(10AP) 기준 등급별 중앙값을 잡고,
//   과일(15AP)=×1.5, 바다 어종(20AP)=×2 로 판매가·숙련도를 맞춘다. (중량·크기는 유지)
// 담수 어종 빈칸은 등급 중앙값으로 채움. 실행: node scripts/balance-tables.js
const fs = require("fs");
const path = require("path");
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
const FISH_GID = "1239524226", GATHER_GID = "1011242625";
const FRUITS = new Set(["사과", "포도", "복숭아", "수박", "오렌지"]);

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim()));
}
const enc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
async function fetchCsv(gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} (gid ${gid})`);
  return parseCsv(await res.text());
}
const num = (v) => Number(String(v ?? "").trim());
const empty = (v) => String(v ?? "").trim() === "";

(async () => {
  const fish = await fetchCsv(FISH_GID);
  const gather = await fetchCsv(GATHER_GID);

  // ── 등급별 표준 중앙값 ──
  function baselines(rows, h, opts) {
    const { gradeC, priceC, expC, std } = opts;
    const by = {};
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!std(r)) continue;
      const g = (r[gradeC] || "").trim();
      (by[g] ||= { p: [], e: [] });
      by[g].p.push(num(r[priceC])); by[g].e.push(num(r[expC]));
    }
    const out = {};
    for (const [g, v] of Object.entries(by)) out[g] = { price: median(v.p), exp: median(v.e) };
    return out;
  }

  // 물고기: 헤더 no,이름,서식지,등급,별등급,중량,판매가,숙련도,크기기본,크기편차,설명
  const fh = fish[0]; const F = (n) => fh.indexOf(n);
  const fHab = F("서식지"), fGr = F("등급"), fW = F("중량"), fP = F("판매가"), fE = F("숙련도"), fSb = F("크기기본"), fSv = F("크기편차");
  const isFresh = (r) => (r[fHab] || "").includes("민물");
  const isSea = (r) => (r[fHab] || "").includes("바다");
  const fishBase = baselines(fish, fh, {
    gradeC: fGr, priceC: fP, expC: fE,
    std: (r) => isFresh(r) && (r[fGr] || "").trim() !== "R0" && !empty(r[fP]) && !empty(r[fE]),
  });
  // 담수 중량·크기 중앙값(빈칸 채움용)
  function fillStat(rows, gradeC, col, stdFn) {
    const by = {};
    for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (!stdFn(r) || empty(r[col])) continue; (by[(r[gradeC] || "").trim()] ||= []).push(num(r[col])); }
    const o = {}; for (const [g, v] of Object.entries(by)) o[g] = Math.round(median(v)); return o;
  }
  const fW_m = fillStat(fish, fGr, fW, isFresh), fSb_m = fillStat(fish, fGr, fSb, isFresh), fSv_m = fillStat(fish, fGr, fSv, isFresh);

  let seaN = 0, fillN = 0;
  for (let i = 1; i < fish.length; i++) {
    const r = fish[i]; const g = (r[fGr] || "").trim();
    if (isFresh(r) && (empty(r[fP]) || empty(r[fE]))) { // 담수 빈칸 채움
      const b = fishBase[g];
      if (b) { if (empty(r[fW])) r[fW] = String(fW_m[g] ?? 1); if (empty(r[fP])) r[fP] = String(Math.round(b.price)); if (empty(r[fE])) r[fE] = String(Math.round(b.exp)); if (empty(r[fSb])) r[fSb] = String(fSb_m[g] ?? 30); if (empty(r[fSv])) r[fSv] = String(fSv_m[g] ?? 10); fillN++; }
    }
    if (isSea(r) && g !== "R0" && fishBase[g]) { // 바다 = ×2
      r[fP] = String(Math.round(fishBase[g].price * 2));
      r[fE] = String(Math.round(fishBase[g].exp * 2));
      seaN++;
    }
  }

  // 채집: 헤더 no,이름,등급,별등급,중량,판매가,숙련도,크기기본,크기편차,설명
  const gh = gather[0]; const G = (n) => gh.indexOf(n);
  const gName = G("이름"), gGr = G("등급"), gP = G("판매가"), gE = G("숙련도");
  const plantBase = baselines(gather, gh, {
    gradeC: gGr, priceC: gP, expC: gE,
    std: (r) => !FRUITS.has((r[gName] || "").trim()) && (r[gGr] || "").trim() !== "R0" && !empty(r[gP]) && !empty(r[gE]),
  });
  let fruitN = 0;
  for (let i = 1; i < gather.length; i++) {
    const r = gather[i];
    if (FRUITS.has((r[gName] || "").trim())) {
      const b = plantBase[(r[gGr] || "").trim()];
      if (b) { r[gP] = String(Math.round(b.price * 1.5)); r[gE] = String(Math.round(b.exp * 1.5)); fruitN++; }
    }
  }

  fs.writeFileSync(path.join(__dirname, "fish_out.csv"), "﻿" + fish.map((r) => r.map(enc).join(",")).join("\n"), "utf8");
  fs.writeFileSync(path.join(__dirname, "gather_out.csv"), "﻿" + gather.map((r) => r.map(enc).join(",")).join("\n"), "utf8");

  console.log("=== 등급별 표준 중앙값 (판매가/숙련도) ===");
  console.log("등급  | 담수어(10AP) | 바다(×2,20AP) | 약초(10AP) | 과일(×1.5,15AP)");
  for (const g of ["R1", "R2", "R3", "R4", "R5"]) {
    const f = fishBase[g] || {}, p = plantBase[g] || {};
    const c = (b, m) => b.price != null ? `${Math.round(b.price * m)}/${Math.round(b.exp * m)}` : "-";
    console.log(`${g}    | ${c(f, 1).padEnd(11)} | ${c(f, 2).padEnd(12)} | ${c(p, 1).padEnd(9)} | ${c(p, 1.5)}`);
  }
  console.log(`\n[저장] fish_out.csv (담수 ${fillN}채움, 바다 ${seaN}조정) · gather_out.csv (과일 ${fruitN}조정)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
