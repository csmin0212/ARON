// 현재 레시피 효과 전체 덤프 (공식 버프 기준 대조용). 실행: node scripts/recipe-dump.js
const fs = require("fs");
const path = require("path");
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
(async () => {
  const { PrismaClient } = require(path.join(__dirname, "..", "src/generated/prisma"));
  const prisma = new PrismaClient();
  const recipes = await prisma.cookingRecipe.findMany({ orderBy: [{ rank: "asc" }, { order: "asc" }] });
  for (const r of recipes) {
    let ing = [];
    try { ing = JSON.parse(r.ingredientsJson).map((i) => `${i.name}x${i.qty}`); } catch {}
    console.log([r.rank, r.resultName || r.name, `[${ing.join(",")}]`, r.effect || "-", r.duration || "-", r.tags || "-"].join(" | "));
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
