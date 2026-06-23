// 요리 재료비 → 권장 판매가 표 생성 (시트 '판매가' 칸 붙여넣기용).
// 재료비 = 베이스재료(상점 구매가) + 어획물/약초(시장가). 판매가 = 재료비 × 티어배율.
// 실행: node scripts/recipe-prices.js
const fs = require("fs");
const path = require("path");

// .env 로드 (seed.js 패턴)
try {
  const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {}

// ── 베이스 식재료 구매가 (services.ts FOOD_ITEMS) ──
const BASE = { 달걀: 10, 우유: 10, 고기: 10, 채소: 10, 과일: 10, 물: 5, 밀: 20, 소금: 30, 향신료: 50, 치즈: 50 };

// ── lifeSkillData.ts 파싱: 어획물/약초 시장가 ──
const lifeSrc = fs.readFileSync(path.join(__dirname, "..", "src/lib/lifeSkillData.ts"), "utf8");
function parseItems(constName) {
  const start = lifeSrc.indexOf(`${constName}: LifeSkillItem[] = [`);
  const end = lifeSrc.indexOf("];", start);
  const block = lifeSrc.slice(start, end);
  const re = /name:\s*"([^"]+)",\s*rank:\s*(\d+),\s*weight:\s*\d+,\s*price:\s*(\d+)/g;
  const out = {};
  let m;
  while ((m = re.exec(block))) out[m[1]] = { rank: +m[2], price: +m[3] };
  return out;
}
const PLANT = parseItems("PLANT_ITEMS");
const FISH = parseItems("FISH_ITEMS");
const clamp = (v, min, max) => (v <= 0 ? min : Math.max(min, Math.min(max, v)));
function plantPrice(it) {
  let b;
  switch (it.rank) {
    case 0: b = Math.min(it.price, 5); break;
    case 1: b = clamp(it.price, 3, 10); break;
    case 2: b = clamp(it.price, 7, 18); break;
    case 3: b = clamp(it.price, 20, 35); break;
    case 4: b = clamp(it.price, 400, 750); break;
    case 5: b = clamp(it.price, 2000, 3500); break;
    default: b = it.price;
  }
  return Math.round(b * 0.85);
}
function ingredientCost(name) {
  if (BASE[name] != null) return BASE[name];
  if (FISH[name]) return Math.round(FISH[name].price * 1.24);
  if (PLANT[name]) return plantPrice(PLANT[name]);
  return null; // unknown
}

// ── 티어 배율 (재료비 × ?) ──
function tierMult(effect, rank) {
  const e = effect || "";
  const r = (String(rank).match(/\d+/) || [0])[0] | 0;
  if (/세션\s*버프|판정|\bHP\b|\bMP\b|공격|방어|지력|근력|이동|중량|감지|행동|모든/.test(e)) return r >= 3 ? 1.5 : 1.45;
  if (/행운/.test(e)) return 1.4;
  return 1.3; // 회복/피로도/즉시 (버프 없음)
}
const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

(async () => {
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  const recipes = await prisma.cookingRecipe.findMany({ orderBy: [{ rank: "asc" }, { order: "asc" }] });

  const unknown = new Set();
  const rows = recipes.map((rec) => {
    let ing;
    try { ing = JSON.parse(rec.ingredientsJson); } catch { ing = []; }
    let cost = 0;
    const parts = ing.map((i) => {
      const c = ingredientCost(i.name);
      if (c == null) { unknown.add(i.name); }
      cost += (c ?? 0) * i.qty;
      return `${i.name}x${i.qty}`;
    });
    const mult = tierMult(rec.effect, rec.rank);
    const rec_price = round5(cost * mult);
    return {
      id: rec.id, name: rec.resultName || rec.name, rank: rec.rank, cat: rec.category,
      ingredients: parts.join(", "), cost, cur: rec.sellPrice, mult, rec_price,
      margin: rec_price - cost, effect: (rec.effect || "").split("\n")[0].slice(0, 28),
    };
  });

  // 출력: 붙여넣기용 TSV (레시피ID \t 권장판매가) + 상세표
  console.log("=== 상세 (검토용) ===");
  console.log(["등급", "이름", "재료비", "현재가", "권장가", "마진", "×", "효과"].join("\t"));
  for (const r of rows) {
    console.log([r.rank, r.name, r.cost, r.cur, r.rec_price, r.margin, r.mult, r.effect].join("\t"));
  }
  console.log("\n=== 붙여넣기용 (레시피ID \\t 권장판매가) ===");
  for (const r of rows) console.log(`${r.id}\t${r.rec_price}`);

  if (unknown.size) console.log("\n[경고] 가격 미상 재료(0원 처리됨):", [...unknown].join(", "));
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
