import "server-only";

import { prisma } from "@/lib/prisma";
import { setLifeItems, type LifeSkillItem } from "@/lib/lifeSkillData";

// DB(LifeSkillItem)에서 낚시/채집 풀을 읽어 활성 풀로 설정. 비어 있으면 seed 폴백 유지.
// TTL 캐시 — 인스턴스당 주기적으로만 재조회(동기화 후 최대 TTL 안에 반영).
let loadedAt = 0;
const TTL_MS = 30_000;

export async function loadLifeItems(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  let rows;
  try {
    rows = await prisma.lifeSkillItem.findMany({ orderBy: { order: "asc" } });
  } catch {
    return; // DB 오류 시 seed 유지
  }
  loadedAt = Date.now();
  if (rows.length === 0) return; // 시트 미동기화 → seed 폴백

  const toItem = (r: (typeof rows)[number]): LifeSkillItem => ({
    no: r.order + 1,
    name: r.name,
    rank: r.rank,
    rarity: r.rarity ?? "",
    weight: r.weight,
    price: r.price,
    exp: r.exp,
    sizeBase: r.sizeBase,
    sizeVariance: r.sizeVar,
    text: r.text ?? "",
  });
  const fish = rows.filter((r) => r.kind === "낚시").map(toItem);
  const plant = rows.filter((r) => r.kind === "채집").map(toItem);
  const sea = rows
    .filter((r) => r.kind === "낚시" && (r.habitat ?? "").includes("바다"))
    .map((r) => r.name);
  setLifeItems(fish, plant, sea);
}
