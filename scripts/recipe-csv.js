// 라이브 시트(레시피 탭)를 읽어 → 효과 정리 + 판매가 칸 추가 → 시트 교체용 CSV 출력.
// 숙련도·공개·재료 등 시트 원본값은 그대로 보존. 실행: node scripts/recipe-csv.js
const fs = require("fs");
const path = require("path");

const SHEET_ID = "1_WsaAQJE50iQvK6O6gDcEqd3lQFVKokj924_Pfsxla4";
const GID = "1125022636";
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;

// ── 가격 계산 ──
const BASE = { 달걀: 10, 우유: 10, 고기: 10, 채소: 10, 과일: 10, 물: 5, 밀: 20, 소금: 30, 향신료: 50, 치즈: 50 };
const lifeSrc = fs.readFileSync(path.join(__dirname, "..", "src/lib/lifeSkillData.ts"), "utf8");
function parseItems(c) {
  const s = lifeSrc.indexOf(`${c}: LifeSkillItem[] = [`);
  const block = lifeSrc.slice(s, lifeSrc.indexOf("];", s));
  const re = /name:\s*"([^"]+)",\s*rank:\s*(\d+),\s*weight:\s*\d+,\s*price:\s*(\d+)/g;
  const out = {}; let m;
  while ((m = re.exec(block))) out[m[1]] = { rank: +m[2], price: +m[3] };
  return out;
}
const PLANT = parseItems("PLANT_ITEMS"), FISH = parseItems("FISH_ITEMS");
const clamp = (v, a, b) => (v <= 0 ? a : Math.max(a, Math.min(b, v)));
function plantPrice(it) {
  const t = { 0: Math.min(it.price, 5), 1: clamp(it.price, 3, 10), 2: clamp(it.price, 7, 18), 3: clamp(it.price, 20, 35), 4: clamp(it.price, 400, 750), 5: clamp(it.price, 2000, 3500) };
  return Math.round((t[it.rank] ?? it.price) * 0.85);
}
function ingredientCost(name) {
  if (BASE[name] != null) return BASE[name];
  if (FISH[name]) return Math.round(FISH[name].price * 1.24);
  if (PLANT[name]) return plantPrice(PLANT[name]);
  return 0;
}
function tierMult(effect, rank) {
  const e = effect || "", r = (String(rank).match(/\d+/) || [0])[0] | 0;
  if (/회복/.test(e)) return 1.3; // 회복요리 — 얇은 티어 (HP/MP 모두 포함되므로 먼저 판정)
  if (/세션\s*버프|판정|\bHP\b|\bMP\b|공격|방어|지력|근력|이동|중량|감지|행동|모든|수정치/.test(e)) return r >= 3 ? 1.5 : 1.45;
  if (/행운/.test(e)) return 1.4;
  return 1.3;
}
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

// ── 효과 정리 오버라이드 (변경분만; 나머지 시트값 유지) ──
const EFFECT = {
  basic_omelet: "세션 버프: 최대 HP +2", basic_meat_skewer: "세션 버프: 공격 대미지 +1",
  basic_spiced_meat: "세션 버프: 공격 대미지 +1", basic_cheese_omelet: "세션 버프: 최대 HP +2",
  basic_cheese_soup: "세션 버프: 물리 방어력 +1", basic_hunter_stew: "세션 버프: 공격 대미지 +1",
  cook_crayfish_cheese: "세션 버프: 공격 대미지 +1", cook_flower_catfish_stew: "세션 버프: 감지 판정 +1",
  cook_angel_fish_meuniere: "세션 버프: 최대 MP +1", cook_cordyceps_soup: "세션 버프: 최대 HP +2",
  cook_rockfruit_pie: "세션 버프: 최대 HP +2", cook_arowana_cutlet: "세션 버프: 공격 대미지 +1",
  cook_green_mandarin_fish: "세션 버프: 민첩 판정 +1", cook_blue_rose_tea: "세션 버프: 최대 MP +1",
  cook_goliath_fish_platter: "세션 버프: 공격 대미지 +1", cook_adventurer_stew: "세션 버프: 원하는 능력 판정 +1",
  cook_icicle_carp_sorbet: "세션 버프: 마법 방어력 +1", cook_pyrelthus_spicy_grill: "세션 버프: 공격 대미지 +1",
  cook_ruby_star_chowder: "세션 버프: 행운 수정치 +1", cook_rebel_fish_steak: "세션 버프: 공격 대미지 +1",
  cook_udumbara_tea: "세션 버프: 행운 수정치 +1", cook_mandrake_omelet: "세션 버프: 최대 HP +2",
  cook_ghost_hand_risotto: "세션 버프: 지력 판정 +1", cook_dragon_flower_roast: "세션 버프: 공격 대미지 +1",
  cook_marigold_cookie: "세션 버프: 행운 수정치 +1", cook_waterdrop_flower_cake: "세션 버프: 최대 HP +2, 최대 MP +1",

  // 회복요리(빈 효과 채움) — 가격대(등급)에 맞춘 HP/MP 회복. 고기·생선·달걀=HP, 채소·과일·약초·버섯=MP.
  cook_boiled_egg: "HP [1D] 회복", cook_milk_porridge: "HP [1D] 회복", cook_vegetable_soup: "MP [1D] 회복",
  cook_flatbread: "HP [1D] 회복", basic_salted_bread: "HP [1D] 회복", basic_vegetable_soup: "MP [1D] 회복",
  basic_fruit_milk: "MP [1D] 회복", basic_meat_soup: "HP [1D] 회복", cook_cheese_bread: "HP [2D] 회복",
  cook_deodeok_grill: "MP [1D] 회복", cook_licorice_milk: "MP [1D] 회복", cook_carp_soup: "HP [2D] 회복",
  cook_trout_roast: "HP [1D] 회복", cook_tilapia_wrap: "HP [1D] 회복", cook_hot_spring_fish: "HP [2D] 회복",
  basic_fruit_tart: "MP [2D] 회복", basic_hearty_breakfast: "HP [2D] 회복",
  cook_sansam_chicken: "HP [1D] 회복, MP [1D] 회복", cook_reishi_hotpot: "MP [1D] 회복",
  cook_mountain_trout_soup: "HP [2D] 회복", cook_baekyang_elixir_soup: "MP [2D] 회복",
  cook_hasuo_root_stew: "MP [2D] 회복", cook_heaven_berry_tart: "HP [2D] 회복, MP [2D] 회복",
  cook_platinum_fish_pie: "HP [4D] 회복",
};

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
function parseIngredients(spec) {
  return (spec || "").split(/[,，]/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const m = p.match(/^(.+?)(?:[xX×](\d+))?$/);
    return { name: m[1].trim(), qty: m[2] ? +m[2] : 1 };
  });
}

(async () => {
  const res = await fetch(URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`시트 가져오기 실패: HTTP ${res.status}`);
  const rows = parseCsv(await res.text()).filter((r) => r.some((c) => c.trim()));
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const cId = idx("레시피ID"), cEffect = idx("효과"), cIng = idx("재료"), cRank = idx("등급");
  const cPrice = idx("판매가"); // 시트에 이미 판매가 칸이 있으면 그 자리에 덮어쓰고, 없으면 끝에 추가
  if (cId < 0 || cEffect < 0 || cIng < 0) throw new Error("헤더에서 레시피ID/효과/재료를 못 찾음");

  const outHeader = cPrice >= 0 ? header : [...header, "판매가"];
  const out = [outHeader.map(enc).join(",")];
  let n = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i].slice();
    const id = (r[cId] || "").trim();
    if (!id) continue;
    if (EFFECT[id] !== undefined) r[cEffect] = EFFECT[id];
    let cost = 0;
    for (const ing of parseIngredients(r[cIng])) cost += ingredientCost(ing.name) * ing.qty;
    const price = round5(cost * tierMult(r[cEffect], r[cRank]));
    let rowOut;
    if (cPrice >= 0) { r[cPrice] = String(price); rowOut = r; }
    else { rowOut = [...r, String(price)]; }
    out.push(rowOut.map(enc).join(","));
    n++;
  }

  const csv = out.join("\n");
  fs.writeFileSync(path.join(__dirname, "recipes_out.csv"), "﻿" + csv, "utf8");
  console.log(csv);
  console.log(`\n[저장됨] scripts/recipes_out.csv (${n}개, 시트 원본 보존 + 효과 정리 + 판매가 추가)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
