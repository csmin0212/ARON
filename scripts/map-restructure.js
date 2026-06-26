// 맵 탭에 채광 컬럼(채광/채광목록/채광확률) 추가 + 채광 스팟 Y 표시. 시트 교체용 CSV 출력.
// 행동 탭(AP/판정/드랍)은 유지 — 맵 탭은 '가능 여부 + 풀', 행동 탭은 'AP·판정·실패문구' 역할.
const fs = require("fs");
const path = require("path");
const SHEET = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
const GID = "0";

// 채광 스팟(돌·수정·광물·갱도). 나머지는 빈칸 — 광물 목록은 광물 탭 만든 뒤 채우면 됨.
const MINING = new Set(["소금평원", "산기슭", "수정갱도", "무너진갱도길", "돌너덜길", "결정방"]);

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

(async () => {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${GID}`, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  const header = rows[0];

  // 끝의 빈 컬럼(이름 없는 trailing) 제거 후, 낚시확률 뒤에 채광 컬럼 삽입
  while (header.length && String(header[header.length - 1]).trim() === "") header.pop();
  const fishRateIdx = header.indexOf("낚시확률");
  const insertAt = fishRateIdx >= 0 ? fishRateIdx + 1 : header.length;
  const idIdx = header.indexOf("ID");

  header.splice(insertAt, 0, "채광", "채광목록", "채광확률");

  const out = [header.map(enc).join(",")];
  let marked = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].slice();
    while (r.length && String(r[r.length - 1]).trim() === "") r.pop(); // 꼬리 빈칸 정리
    while (r.length < insertAt) r.push(""); // 삽입 위치까지 패딩
    const id = String(r[idIdx] ?? "").trim();
    const mining = MINING.has(id) ? "Y" : "";
    if (mining) marked++;
    r.splice(insertAt, 0, mining, "", ""); // 채광, 채광목록, 채광확률
    out.push(r.map(enc).join(","));
  }

  fs.writeFileSync(path.join(__dirname, "map_out.csv"), "﻿" + out.join("\n"), "utf8");
  console.log("새 헤더:", header.join(","));
  console.log(`\n채광 Y 표시: ${[...MINING].join(", ")} (${marked}곳)`);
  console.log(`[저장] scripts/map_out.csv (${rows.length - 1}개 장소)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
