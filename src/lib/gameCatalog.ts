import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { BLACK_MARKET_POTIONS } from "./blackMarket";

// 정적 참조 데이터(요리 레시피·제작특성·제작효과 아이템)는 GM 시트 동기화 때만 바뀐다.
// 매 페이지 로드마다 DB에서 다시 읽으면 전송량(egress)이 크게 늘어나므로 캐시한다.
// 동기화 액션(syncWorldMap)에서 revalidateTag(CATALOG_TAG) 로 즉시 무효화하고,
// 그와 별개로 TTL 로도 갱신되어 캐시가 영구히 낡지 않는다.
export const CATALOG_TAG = "game-catalog";
// 참조 데이터(레시피·장소·아이템 도감…)는 GM 이 시트를 동기화할 때만 바뀌고,
// 그때 revalidateTag(CATALOG_TAG) 로 전부 즉시 비운다. TTL 은 그 신호를 놓쳤을 때의 안전망일 뿐.
// 5분이면 플레이 중 11개 캐시가 5분마다 만료돼 DB 를 깨우고, 그때마다 Neon 자동 정지 타이머가
// 초기화돼서 영영 잠들지 못한다 — CU-시간이 거기서 샌다.
const CATALOG_TTL = 3600; // 초 — 동기화를 놓쳐도 최대 1시간 내 반영

export const getCookingRecipes = unstable_cache(
  () => prisma.cookingRecipe.findMany({ orderBy: { order: "asc" } }),
  ["catalog:cooking-recipes"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getAlchemyRecipes = unstable_cache(
  () => prisma.alchemyRecipe.findMany({ orderBy: { order: "asc" } }),
  ["catalog:alchemy-recipes"],
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

// ── 월드 참조 데이터 — 유저와 무관하게 동일(맵 동기화 때만 변경). 15명이 캐시를 공유해
//    매 렌더/새로고침마다 DB를 다시 안 친다. (모두 Date 컬럼 미사용 → 캐시 직렬화 안전)
export const getLocationCount = unstable_cache(
  () => prisma.location.count(),
  ["catalog:location-count"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getLocationById = unstable_cache(
  (id: string) => prisma.location.findUnique({ where: { id } }),
  ["catalog:location-by-id"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getLocationsBrief = unstable_cache(
  () =>
    prisma.location.findMany({
      select: { id: true, name: true, emoji: true },
      orderBy: { order: "asc" },
    }),
  ["catalog:locations-brief"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

// 암시장 포션 아이템 행 — 상수 목록 기반이라 유저 무관. updatedAt(Date)은 캐시 직렬화 안전을 위해 제외.
export const getBlackMarketPotionRows = unstable_cache(
  () =>
    prisma.item.findMany({
      where: {
        OR: BLACK_MARKET_POTIONS.flatMap((item) => [{ id: item.id }, { name: item.itemName }]),
      },
      omit: { updatedAt: true },
    }),
  ["catalog:black-market-potions"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getAllLocations = unstable_cache(
  () => prisma.location.findMany({ orderBy: { order: "asc" } }),
  ["catalog:locations-all"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getLocationActionsAt = unstable_cache(
  (locationId: string) =>
    prisma.locationAction.findMany({ where: { locationId }, orderBy: { order: "asc" } }),
  ["catalog:location-actions"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);

export const getDungeonsAt = unstable_cache(
  (locationId: string) =>
    prisma.dungeon.findMany({ where: { locationId }, orderBy: { order: "asc" } }),
  ["catalog:dungeons-at"],
  { revalidate: CATALOG_TTL, tags: [CATALOG_TAG] },
);
