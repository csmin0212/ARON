// 낚시/채집 골드 — 게임 실제 가격(lifeSkillMarketPrice) + 레벨 구간표 기준 (무특성 baseline).
import fs from "node:fs";

const ROOT = "C:/Users/joy64/ARON";
const APP = `${ROOT}/arianrod-gallery`;

const lifeSrc = fs.readFileSync(`${APP}/src/lib/lifeSkillData.ts`, "utf8");
function parseItems(constName) {
  const start = lifeSrc.indexOf(`${constName}: LifeSkillItem[] = [`);
  const end = lifeSrc.indexOf("];", start);
  const block = lifeSrc.slice(start, end);
  const re = /name:\s*"([^"]+)",\s*rank:\s*(\d+),\s*weight:\s*(\d+),\s*price:\s*(\d+)/g;
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push({ name: m[1], rank: +m[2], price: +m[4] });
  return out;
}
const PLANT_ITEMS = parseItems("PLANT_ITEMS");
const FISH_ITEMS = parseItems("FISH_ITEMS");
const seaStart = lifeSrc.indexOf("const SEA_FISH");
const seaBlock = lifeSrc.slice(seaStart, lifeSrc.indexOf("]);", seaStart));
const SEA_FISH = new Set([...seaBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

// 게임 실제 가격 로직 + 종류별 배율 (채집↓ / 낚시↑ 로 수급 균형)
const PLANT_MULT = 0.85;
const FISH_MULT = 1.24;
const clamp = (v, min, max) => (v <= 0 ? min : Math.max(min, Math.min(max, v)));
function marketPrice(kind, item) {
  if (kind === "낚시") return Math.round(item.price * FISH_MULT);
  let banded;
  switch (item.rank) {
    case 0: banded = Math.min(item.price, 5); break;
    case 1: banded = clamp(item.price, 3, 10); break;
    case 2: banded = clamp(item.price, 7, 18); break;
    case 3: banded = clamp(item.price, 20, 35); break;
    case 4: banded = clamp(item.price, 400, 750); break;
    case 5: banded = clamp(item.price, 2000, 3500); break;
    default: banded = item.price;
  }
  return Math.round(banded * PLANT_MULT);
}

// 새 레벨 구간표 (lifeSkillPerks.ts LEVEL_BANDS)
const BANDS = [
  { label: "Lv1~30", w: [30, 40, 25, 5, 0, 0] },
  { label: "Lv31~60", w: [20, 35, 35, 9, 1, 0] },
  { label: "Lv61+", w: [10, 30, 30, 20, 9, 1] },
];

function pickRank(weights) {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return 1;
  let roll = Math.random() * total;
  for (let r = 0; r < weights.length; r++) { roll -= Math.max(0, weights[r]); if (roll <= 0) return r; }
  return weights.length - 1;
}
const poolFor = (k) => (k === "채집" ? PLANT_ITEMS : FISH_ITEMS);
function pick(kind, config, weights) {
  const allowed = new Set((config.items || []).map((n) => n.trim()).filter(Boolean));
  const excluded = new Set((config.exclude || []).map((n) => n.trim()).filter(Boolean));
  const water = config.water ?? "민물";
  const pool = poolFor(kind).filter((item) => {
    if (allowed.size > 0 && !allowed.has(item.name)) return false;
    if (excluded.has(item.name)) return false;
    if (kind === "낚시" && water !== "전체" && (water === "바다") !== SEA_FISH.has(item.name)) return false;
    return true;
  });
  const fallback = pool.length > 0 ? pool : poolFor(kind).filter((i) => kind !== "낚시" || !SEA_FISH.has(i.name));
  const avail = new Set(fallback.map((i) => i.rank));
  const rw = weights.map((w, rank) => (avail.has(rank) ? w : 0));
  const wRanks = new Set(rw.map((w, rank) => (w > 0 ? rank : null)).filter((r) => r != null));
  const finalPool = fallback.filter((i) => wRanks.has(i.rank));
  const rank = pickRank(rw);
  const rp = finalPool.filter((i) => i.rank === rank);
  const cands = rp.length > 0 ? rp : finalPool.length > 0 ? finalPool : fallback;
  return cands[Math.floor(Math.random() * cands.length)];
}

function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}
const yes = (v) => /^(y|yes|o|ㅇ|true|1)$/i.test((v || "").trim());
const splitList = (v) => (v || "").split(/[,，;\n]/).map((s) => s.trim()).filter(Boolean);

const mapRows = parseCsv(fs.readFileSync(`${APP}/scripts/newmap.csv`, "utf8"));
const mh = mapRows[0];
const col = (n) => mh.indexOf(n);
const C = {
  name: col("이름"),
  gather: col("채집"), gExclude: col("채집제외"), gList: col("채집목록"),
  fish: col("낚시"), fList: col("낚시목록"), fExclude: col("낚시제외"),
};

const N = 200000;
const rows = [];
for (let i = 1; i < mapRows.length; i++) {
  const r = mapRows[i];
  for (const kind of ["채집", "낚시"]) {
    if (!(kind === "채집" ? yes(r[C.gather]) : yes(r[C.fish]))) continue;
    const config = kind === "채집"
      ? { items: splitList(r[C.gList]), exclude: splitList(r[C.gExclude]) }
      : { items: splitList(r[C.fList]), exclude: splitList(r[C.fExclude]) };
    const per = {};
    const junk = {};
    for (const band of BANDS) {
      let sum = 0, zero = 0;
      for (let s = 0; s < N; s++) {
        const it = pick(kind, config, band.w);
        sum += marketPrice(kind, it);
        if (it.rank === 0) zero++;
      }
      per[band.label] = (sum / N) * 30;
      junk[band.label] = (zero / N) * 100;
    }
    rows.push({ name: r[C.name], kind, per, junk });
  }
}

rows.sort((a, b) => b.per["Lv1~30"] - a.per["Lv1~30"]);
console.log("장소           종류   /300AP (Lv1~30 / 31~60 / 61+)   0성%(Lv1~30)");
console.log("─".repeat(74));
for (const r of rows) {
  const cells = BANDS.map((b) => String(Math.round(r.per[b.label])).padStart(5)).join(" /");
  console.log((r.name || "").padEnd(13), r.kind, " ", cells, "   ", `${Math.round(r.junk["Lv1~30"])}%`.padStart(4));
}
const avg = (k, b) => {
  const xs = rows.filter((r) => r.kind === k);
  return Math.round(xs.reduce((s, r) => s + r.per[b], 0) / xs.length);
};
console.log("─".repeat(74));
for (const b of BANDS) console.log(`${b.label}  평균  채집 ${avg("채집", b.label)} · 낚시 ${avg("낚시", b.label)}`);
