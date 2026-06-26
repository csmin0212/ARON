// 물고기 탭을 읽어 → 빈 수치(중량·판매가·숙련도·크기기본·크기편차)를 등급별 평균으로 채움 → CSV 출력.
// 평균은 '담수(강/민물)·해당 등급·이미 채워진' 행에서 계산 (바다 플레이스홀더 제외). 실행: node scripts/fish-fill.js
const fs = require("fs");
const path = require("path");

const SHEET_ID = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
const GID = "1239524226";
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

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
  return rows;
}
const enc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const r0 = (n) => Math.max(1, Math.round(n)); // 중량용 (최소 1)
const rN = (n) => Math.round(n);

(async () => {
  const res = await fetch(URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`시트 가져오기 실패 HTTP ${res.status}`);
  const rows = parseCsv(await res.text()).filter((r) => r.some((c) => String(c).trim()));
  const header = rows[0];
  const ix = (n) => header.indexOf(n);
  const C = {
    habitat: ix("서식지"), grade: ix("등급"),
    weight: ix("중량"), price: ix("판매가"), exp: ix("숙련도"),
    sizeBase: ix("크기기본"), sizeVar: ix("크기편차"),
  };
  const numCols = [C.weight, C.price, C.exp, C.sizeBase, C.sizeVar];
  const isEmpty = (r) => numCols.some((c) => String(r[c] ?? "").trim() === "");
  const isFreshFilled = (r) =>
    String(r[C.habitat] ?? "").includes("민물") && !isEmpty(r) && (r[C.grade] || "").trim() !== "R0";

  // 등급별 담수 평균
  const byGrade = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!isFreshFilled(r)) continue;
    const g = (r[C.grade] || "").trim();
    (byGrade[g] ||= []).push(r);
  }
  const avg = {};
  for (const [g, list] of Object.entries(byGrade)) {
    const m = (c) => list.reduce((s, r) => s + Number(r[c] || 0), 0) / list.length;
    avg[g] = {
      weight: r0(m(C.weight)), price: rN(m(C.price)), exp: rN(m(C.exp)),
      sizeBase: rN(m(C.sizeBase)), sizeVar: rN(m(C.sizeVar)),
    };
  }

  // 빈 칸 채우기
  let filled = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!isEmpty(r)) continue;
    const a = avg[(r[C.grade] || "").trim()];
    if (!a) continue;
    if (!String(r[C.weight] ?? "").trim()) r[C.weight] = String(a.weight);
    if (!String(r[C.price] ?? "").trim()) r[C.price] = String(a.price);
    if (!String(r[C.exp] ?? "").trim()) r[C.exp] = String(a.exp);
    if (!String(r[C.sizeBase] ?? "").trim()) r[C.sizeBase] = String(a.sizeBase);
    if (!String(r[C.sizeVar] ?? "").trim()) r[C.sizeVar] = String(a.sizeVar);
    filled++;
  }

  const out = rows.map((r) => r.map(enc).join(",")).join("\n");
  fs.writeFileSync(path.join(__dirname, "fish_out.csv"), "﻿" + out, "utf8");
  console.log("=== 등급별 담수 평균(빈칸 채움값) ===");
  for (const g of ["R1", "R2", "R3", "R4", "R5"]) if (avg[g]) console.log(g, JSON.stringify(avg[g]));
  console.log(`\n[저장] scripts/fish_out.csv — ${filled}개 행 채움`);
  console.log("\n" + out);
})().catch((e) => { console.error(e.message); process.exit(1); });
