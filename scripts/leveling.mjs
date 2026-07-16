// 생활스킬 레벨 도달 일수 — exp 곡선 + 등급별 exp + 레벨 구간표 반영.
import fs from "node:fs";
const ROOT = "C:/Users/joy64/ARON";
const APP = `${ROOT}/arianrod-gallery`;

const lifeSrc = fs.readFileSync(`${APP}/src/lib/lifeSkillData.ts`, "utf8");
function parseItems(name) {
  const start = lifeSrc.indexOf(`${name}: LifeSkillItem[] = [`);
  const block = lifeSrc.slice(start, lifeSrc.indexOf("];", start));
  const re = /name:\s*"([^"]+)",\s*rank:\s*(\d+),\s*weight:\s*(\d+),\s*price:\s*(\d+),\s*exp:\s*(\d+)/g;
  const out = []; let m;
  while ((m = re.exec(block))) out.push({ name: m[1], rank: +m[2], exp: +m[5] });
  return out;
}
const PLANT = parseItems("PLANT_ITEMS");
const FISH = parseItems("FISH_ITEMS");
const seaStart = lifeSrc.indexOf("const SEA_FISH");
const SEA = new Set([...lifeSrc.slice(seaStart, lifeSrc.indexOf("]);", seaStart)).matchAll(/"([^"]+)"/g)].map((m) => m[1]));

const BANDS = [
  { lo: 1, hi: 30, w: [30, 40, 25, 5, 0, 0] },
  { lo: 31, hi: 60, w: [20, 35, 35, 9, 1, 0] },
  { lo: 61, hi: 999, w: [10, 30, 30, 20, 9, 1] },
];
const bandFor = (lv) => BANDS.find((b) => lv >= b.lo && lv <= b.hi).w;
const expForNext = (lv) => Math.round(20 * Math.pow(lv, 1.6));

const poolFor = (k) => (k === "채집" ? PLANT : FISH);
function pickRank(w) {
  const t = w.reduce((s, x) => s + Math.max(0, x), 0);
  if (t <= 0) return 1;
  let r = Math.random() * t;
  for (let i = 0; i < w.length; i++) { r -= Math.max(0, w[i]); if (r <= 0) return i; }
  return w.length - 1;
}
// 맵 목록을 다 비우셨으니 풀 = 전체(낚시는 민물만). 대표 풀로 계산.
function pool(kind) {
  return poolFor(kind).filter((i) => kind !== "낚시" || !SEA.has(i.name));
}
const FISH_EXP_MULT = 1.33; // 낚시 exp 배율 (채집과 레벨링 속도 맞춤)
function expPerAction(kind, weights, N = 300000) {
  const p = pool(kind);
  const avail = new Set(p.map((i) => i.rank));
  const w = weights.map((x, r) => (avail.has(r) ? x : 0));
  const wr = new Set(w.map((x, r) => (x > 0 ? r : null)).filter((r) => r != null));
  const fp = p.filter((i) => wr.has(i.rank));
  const mult = kind === "낚시" ? FISH_EXP_MULT : 1;
  let sum = 0;
  for (let s = 0; s < N; s++) {
    const rank = pickRank(w);
    const rp = fp.filter((i) => i.rank === rank);
    const cands = rp.length ? rp : fp;
    sum += cands[Math.floor(Math.random() * cands.length)].exp * mult;
  }
  return sum / N;
}

// 구간별 기대 exp/행동 미리 계산
const expByBand = {};
for (const kind of ["채집", "낚시"]) {
  expByBand[kind] = BANDS.map((b) => expPerAction(kind, b.w));
}

function actionsTo(kind, target) {
  let lv = 1, exp = 0, actions = 0;
  while (lv < target) {
    const bandIdx = BANDS.findIndex((b) => lv >= b.lo && lv <= b.hi);
    exp += expByBand[kind][bandIdx];
    actions++;
    while (lv < target && exp >= expForNext(lv)) { exp -= expForNext(lv); lv++; }
    if (actions > 5e7) break;
  }
  return actions;
}

const cum = (L) => { let s = 0; for (let l = 1; l < L; l++) s += expForNext(l); return s; };

console.log("구간별 기대 exp/행동 (무특성, 성공 가정):");
for (const kind of ["채집", "낚시"]) {
  console.log(`  ${kind}: Lv1~30 ${expByBand[kind][0].toFixed(1)} · Lv31~60 ${expByBand[kind][1].toFixed(0)} · Lv61+ ${expByBand[kind][2].toFixed(0)}`);
}
console.log(`누적 필요 exp: Lv30 ${cum(30).toLocaleString()} · Lv60 ${cum(60).toLocaleString()}`);
console.log("");
for (const [perDay, tag] of [[30, "300AP/일 (자연240+여관60)"], [24, "240AP/일 (여관 없이)"]]) {
  console.log(`── 행동 ${perDay}회/일 — ${tag} ──`);
  for (const kind of ["채집", "낚시"]) {
    const a30 = actionsTo(kind, 30), a60 = actionsTo(kind, 60);
    console.log(
      `  ${kind}:  Lv30  ${a30.toLocaleString()}회 ≈ ${Math.ceil(a30 / perDay)}일 (${(a30 / perDay / 30).toFixed(1)}달)` +
      `  |  Lv60  ${a60.toLocaleString()}회 ≈ ${Math.ceil(a60 / perDay)}일 (${(a60 / perDay / 30).toFixed(1)}달)`,
    );
  }
  console.log("");
}
