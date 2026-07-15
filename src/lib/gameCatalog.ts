import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// 정적 참조 데이터(요리 레시피·제작특성·제작효과 아이템)는 GM 시트 동기화 때만 바뀐다.
// 매 페이지 로드마다 DB에서 다시 읽으면 전송량(egress)이 크게 늘어나므로 캐시한다.
// 동기화 액션(syncWorldMap)에서 revalidateTag(CATALOG_TAG) 로 즉시 무효화하고,
// 그와 별개로 TTL 로도 갱신되어 캐시가 영구히 낡지 않는다.
export const CATALOG_TAG = "game-catalog";
const CATALOG_TTL = 300; // 초 — 동기화를 놓쳐도 최대 5분 내 반영

export const getCookingRecipes = unstable_cache(
  () => prisma.cookingRecipe.findMany({ orderBy: { order: "asc" } }),
  ["catalog:cooking-recipes"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getCraftTagRows = unstable_cache(
  () =>
    prisma.craftTag.findMany({
      orderBy: { order: "asc" },
      select: { name: true, desc: true, slot: true, stackable: true },
    }),
  ["catalog:craft-tags"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getCraftEffectItems = unstable_cache(
  () =>
    prisma.item.findMany({
      where: { craftEffect: { not: null } },
      select: { name: true, craftEffect: true, sellPrice: true, desc: true, weight: true },
    }),
  ["catalog:craft-effect-items"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);
