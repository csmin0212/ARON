// 레시피 탭이 parseRecipesGrid에서 throw할 조건(중복ID·쉼표ID·빈재료·빈결과)을 찾는다.
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4", GID = "1125022636";
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
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
(async () => {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${GID}`, { redirect: "follow" });
  const g = parseCsv(await res.text());
  const H = g[0]; const col = (n) => H.indexOf(n);
  const cId = col("레시피ID"), cName = col("이름"), cIng = col("재료"), cRes = col("결과");
  console.log("헤더:", H.join("|"));
  const seen = new Map(); let problems = 0;
  for (let r = 1; r < g.length; r++) {
    const row = g[r];
    const name = (row[cName] || "").trim(), ing = (row[cIng] || "").trim(), res = (row[cRes] || "").trim();
    if (!name || !ing || !res) continue;
    const id = (row[cId] || name).trim();
    if (/[,，]/.test(id)) { console.log(`[쉼표ID] 행${r + 1}: "${id}"`); problems++; }
    if (seen.has(id)) { console.log(`[중복ID] 행${r + 1}: "${id}" (앞서 행${seen.get(id)})`); problems++; }
    else seen.set(id, r + 1);
    // parseIngredients가 throw하는 경우: 재료 항목 표기 해석 불가
    for (const part of ing.split(/[,，]/)) {
      const p = part.trim(); if (!p) continue;
      if (!/^(.+?)(?:[xX×](\d+))?$/.test(p)) { console.log(`[재료표기오류] 행${r + 1}: "${p}"`); problems++; }
    }
  }
  console.log(`\n고유 ID ${seen.size}개, 문제 ${problems}건`);
})().catch((e) => console.error("ERR:", e.message));
