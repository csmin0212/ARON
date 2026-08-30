import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import {
  FATIGUE_MAX,
  dungeonWeekKey,
  effectiveAp,
  nextFatigueRegenMinutes,
  restedTodayKst,
} from "@/lib/world";
import { ABILITY_LABELS_KO, type DropEntry } from "@/lib/gamedata";
import { enterHome, enterWorld, leaveHome, moveTo } from "@/app/actions/world";
import DungeonPanel, { type DungeonAbility, type DungeonView } from "@/components/DungeonPanel";
import BagInventory from "@/components/BagInventory";
import GuildRankPerks from "@/components/GuildRankPerks";
import GatheringStatus from "@/components/GatheringStatus";
import MiningStatus from "@/components/MiningStatus";
import FishingStatus from "@/components/FishingStatus";
import LocationPresence from "@/components/LocationPresence";
import RiftView from "@/components/RiftView";
import SheetSync from "@/components/SheetSync";
import { type AdminRift } from "@/components/WorldAdmin";
import type { PendingGatherView } from "@/app/actions/gathering";
import type { PendingFishView } from "@/app/actions/fishing";
import type { PendingMineView } from "@/app/actions/mining";
import WorldAdmin from "@/components/WorldAdmin";
import WorldChat from "@/components/WorldChat";
import { WorldSyncProvider } from "@/components/WorldSyncProvider";
import ActiveBuffsBar, { type WorldBuff } from "@/components/ActiveBuffsBar";
import { dailyEventBuffs, dailyLifeEventBonus } from "@/lib/dailyEvents";
import { loadActiveLanternEmbers } from "@/lib/lanternEmbers";
import WorldServices, {
  type CookingView,
  type BlackMarketView,
  type HousingView,
  type InnView,
  type LifeShopView,
  type LifeStorageItemView,
  type GuildView,
  type StorageView,
  type WanderingMerchantView,
} from "@/components/WorldServices";
import {
  ensureBlackMarketStock,
  loadBlackMarketExchangeState,
  loadBlackMarketQuestState,
} from "@/lib/blackMarketServer";
import { BLACK_MARKET_EXCHANGE_OFFERS, BLACK_MARKET_POTIONS } from "@/lib/blackMarket";
import {
  countTodayWanderingMerchantSummons,
  loadActiveWanderingMerchant,
} from "@/lib/wanderingMerchantServer";
import { WANDERING_MERCHANT_LOCATION_ID, WANDERING_MERCHANT_LOCATION_NAME } from "@/lib/wanderingMerchant";
import { inventoryWeightTotal, type SheetInventory, type SheetInventoryItem } from "@/lib/googleSheets";
import { dedupeLifeActions } from "@/lib/locationActions";
import {
  findLifeSkillItem,
  getActiveItems,
  lifeSkillItemKind,
  lifeSkillKindOf,
  type LocationLifeConfig,
} from "@/lib/lifeSkillData";
import { isBlacksmithClass, itemAsCraftMinor, MOON_FRAGMENT } from "@/lib/weaponCraft";
import { resolveMaterialSellPrice } from "@/lib/shop";
import type { CraftMineralView } from "@/components/CraftingForge";
import { loadLifeItems } from "@/lib/lifeSkillLoader";
import { buildDetectorView, type DetectorView } from "@/lib/lifeDetector";
import { SKILLBOOK_META } from "@/lib/skillbook";
import {
  dungeonWeeklyLimit,
  GUILD_LOCATION_ID,
  normalizeAdventurerRank,
  rankAtLeast,
  storageWeightBonus,
  totalFameForRank,
} from "@/lib/adventurerRank";
import { loadGuildQuestState } from "@/lib/guildQuestsServer";
import {
  isUniqueSkillbook,
  rerollCap,
  skillbookNumber,
  FRAG_COST,
  WEEK_GOAL,
} from "@/lib/guildQuests";
import type { BlackMarketQuestOffer } from "@/lib/blackMarket";
import type { QuestOfferView } from "@/components/GuildQuestBoard";
import {
  ALCHEMY_ADEPT_MASTERY,
  ALCHEMY_MASTER_MASTERY,
  alchemyLevel,
  alchemyMasteryRank,
  lifeBagLimit,
  lifeBagWeight,
  parseLifeState,
  productionExpForNext,
} from "@/lib/lifeSkillPerks";
import { parseCookedName } from "@/lib/auction";
import {
  WEAK_PRICE_MULT,
  alchemyAcceleratorMinutes,
  alchemyLabSlotLimit,
  alchemyOptionRepeatPointStep,
  alchemyOptionRepeatable,
  customPotionSellPrice,
  isCustomAlchemyPotionName,
  parsePendingBrew,
  parsePotionName,
} from "@/lib/alchemy";
import { profitAdjustedSellPrice, recipeCostMap } from "@/lib/qualityPricing";
import type { AlchemyRecipeView, AlchemyView } from "@/components/AlchemyLab";
import {
  getAlchemyRecipes,
  getAllLocations,
  getBlackMarketPotionRows,
  getCookingRecipes,
  getCraftEffectItems,
  getCraftTagRows,
  getDungeonsAt,
  getLocationActionsAt,
  getLocationById,
  getLocationCount,
  getLocationsBrief,
} from "@/lib/gameCatalog";
import { parseGoldToInt } from "@/lib/dice";
import {
  HOUSE_OPTIONS,
  accrueHousingProduction,
  hasFurnitureEffect,
  homeDisplayName,
  homeLocationId,
  homeOwnerFromLocationId,
  homeTierFromLocationId,
  houseOption,
  houseSellPrice,
  alchemyToleranceBonus,
  isBellTowerLocation,
  isHomeLocationId,
  ownedAlchemyLab,
  parseHousingState,
  ownedProductionOption,
  productionDailyPoints,
  productionRedeemCost,
  productionSlotCap,
  serializeHousingState,
} from "@/lib/housing";
import FriendsDock from "@/components/FriendsDock";
import GuestbookCard from "@/components/GuestbookCard";
import { isWorldGmOnly } from "@/lib/worldAccess";
import {
  buildWeeklyIncomeEntries,
  parseWeeklyIncomeState,
  type WeeklyIncomeView,
} from "@/lib/weeklyIncome";

export const metadata = { title: "월드 · 아리안로드 온라인 갤러리" };

const STORAGE_UPGRADE_STEP = 10;
const storageUpgradeCost = (maxWeight: number) => Math.max(1000, Math.max(0, maxWeight) * 100);
const ALCHEMY_BOOKS = [
  {
    id: "alchemy_special_recipe_1",
    name: "특별한 레시피 1",
    price: 2000,
    optionLabel: "페이트 회복 +1",
    optionNames: ["페이트 회복 +1"],
  },
  {
    id: "alchemy_special_recipe_2",
    name: "특별한 레시피 2",
    price: 2000,
    optionLabel: "피로도 회복 +20",
    optionNames: ["피로도 회복 +20"],
  },
  {
    id: "alchemy_special_recipe_3",
    name: "특별한 레시피 3",
    price: 2000,
    optionLabel: "HP 50%(소숫점 올림) 회복",
    optionNames: ["HP 50%(소숫점 올림) 회복", "HP 50% 회복"],
  },
  {
    id: "alchemy_special_recipe_4",
    name: "특별한 레시피 4",
    price: 2000,
    optionLabel: "MP 50%(소숫점 올림) 회복",
    optionNames: ["MP 50%(소숫점 올림) 회복", "MP 50% 회복"],
  },
] as const;

function ApBar({ ap, nextRegenMin }: { ap: number; nextRegenMin: number | null }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="text-lg">⚡</span>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-bold text-content">피로도</span>
          <span className="font-semibold text-muted">
            {ap} / {FATIGUE_MAX}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle-hover">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
            style={{ width: `${(ap / FATIGUE_MAX) * 100}%` }}
          />
        </div>
      </div>
      <span className="text-[11px] text-faint">
        {nextRegenMin == null ? "완전히 회복됨" : `다음 회복까지 ${nextRegenMin}분`}
      </span>
      <button
        type="button"
        disabled
        className="rounded-xl border border-line bg-subtle px-3 py-2 text-xs font-bold text-faint opacity-70"
        title="피로도 회복 아이템은 추후 활성화됩니다"
      >
        회복
      </button>
    </div>
  );
}

function parseJsonArray(value: string | null | undefined): string[] {
  try {
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function parseSheetInventory(value: string | null | undefined): SheetInventory | null {
  try {
    return value ? (JSON.parse(value) as SheetInventory) : null;
  } catch {
    return null;
  }
}

function parseLocationLife(value: string | null | undefined): LocationLifeConfig | null {
  try {
    return value ? (JSON.parse(value) as LocationLifeConfig) : null;
  } catch {
    return null;
  }
}

function parseRecipeIngredients(value: string): { name: string; qty: number }[] {
  try {
    return JSON.parse(value) as { name: string; qty: number }[];
  } catch {
    return [];
  }
}

function activityBadges(life: LocationLifeConfig | null): { label: string; tone: string }[] {
  if (!life) return [];
  return [
    life.gather?.enabled ? { label: "🌿 채집 가능", tone: "bg-emerald-50 text-emerald-700" } : null,
    life.fish?.enabled ? { label: "🎣 낚시 가능", tone: "bg-sky-50 text-sky-700" } : null,
    life.mine?.enabled ? { label: "⛏️ 채광 가능", tone: "bg-stone-100 text-stone-700" } : null,
    life.combat?.enabled ? { label: "⚔️ 전투 가능", tone: "bg-rose-50 text-rose-700" } : null,
  ].filter((badge): badge is { label: string; tone: string } => !!badge);
}

function hasServiceKeyword(
  here: { id: string; name: string },
  actions: { kind: string; label: string | null }[],
  keywords: string[],
): boolean {
  const source = [here.id, here.name, ...actions.flatMap((a) => [a.kind, a.label ?? ""])]
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => source.includes(keyword.toLowerCase()));
}

const GUILD_BACKYARD_KEYWORDS = [
  "길드 뒷마당",
  "길드뒷마당",
  "guild backyard",
  "guild_backyard",
  "guildbackyard",
  "training yard",
  "training_yard",
  "trainingyard",
];

export default async function WorldPage() {
  const user = await getCurrentUser();
  const isGm = isGmUsername(user?.username);

  // 본편 개시 전 — 월드는 GM만 입장 가능
  if (isWorldGmOnly() && !isGm) {
    return (
      <Gate emoji="🚧" title="월드는 본편 개시 후에 열려요">
        <p className="text-sm text-faint">
          지금은 준비 중이라 잠겨 있어요. 개시되면 바로 입장할 수 있어요!
        </p>
      </Gate>
    );
  }

  await loadLifeItems();

  if (!user) {
    return (
      <Gate emoji="🗺️" title="월드에 입장하려면 로그인이 필요해요">
        <Link href="/login" className="font-bold text-brand-600 hover:underline">
          로그인하러 가기
        </Link>
      </Gate>
    );
  }

  // visitedJson·probeJson 은 월드 화면에서 안 쓰는데 계속 자라는 컬럼 — 렌더마다 나가지 않게 제외.
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    omit: { visitedJson: true, probeJson: true },
  });

  if (!sheet) {
    return (
      <Gate emoji="📜" title="캐릭터 시트를 먼저 연동해주세요">
        <p className="mb-3 text-sm text-faint">월드는 캐릭터의 능력치로 플레이해요.</p>
        <Link href="/profile" className="font-bold text-brand-600 hover:underline">
          프로필에서 연동하기 →
        </Link>
      </Gate>
    );
  }

  const locationCount = await getLocationCount();

  if (locationCount === 0) {
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <Gate emoji="🛠️" title="월드 준비 중이에요">
          <p className="text-sm text-faint">GM이 맵을 만들고 있어요. 조금만 기다려주세요!</p>
        </Gate>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  const ap = effectiveAp(sheet.ap, sheet.apResetAt);
  const nextRegenMin = nextFatigueRegenMinutes(sheet.ap, sheet.apResetAt);
  const atHome = isHomeLocationId(sheet.locationId);
  const housingState = parseHousingState(sheet.housingJson, sheet.houseTier);
  if (accrueHousingProduction(housingState)) {
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { housingJson: serializeHousingState(housingState) },
    });
  }
  const homeOwnerId = homeOwnerFromLocationId(sheet.locationId);
  const atMyHome = atHome && homeOwnerId === user.id; // 친구 집 방문 중이면 false
  const activeHomeTier = homeTierFromLocationId(sheet.locationId) ?? sheet.houseTier;
  const bellTowerLocations =
    atHome || housingState.owned.length > 0 ? await getLocationsBrief() : [];
  const bellTower = bellTowerLocations.find((location) => isBellTowerLocation(location)) ?? null;
  const dbHere =
    sheet.locationId && !atHome ? await getLocationById(sheet.locationId) : null;
  // 내가 보유한 집 (하우징 메뉴·입장 목록용) — 지금 서 있는 집과 별개
  const house = houseOption(housingState.owned[0] ?? sheet.houseTier);
  const hereHouse = houseOption(atHome ? activeHomeTier : null);
  // 친구 집 방문 중이면 주인 정보를 불러와 문패를 표시
  const homeOwner =
    atHome && !atMyHome && homeOwnerId
      ? await prisma.user.findUnique({
          where: { id: homeOwnerId },
          select: { id: true, nickname: true },
        })
      : null;
  const homeOwnerSheet = homeOwner
    ? await prisma.characterSheet.findUnique({
        where: { userId: homeOwner.id },
        select: { housingJson: true, houseTier: true },
      })
    : null;
  const homeOwnerHousing = homeOwner
    ? parseHousingState(homeOwnerSheet?.housingJson, homeOwnerSheet?.houseTier)
    : null;
  const here =
    atHome && hereHouse && homeOwnerId
      ? {
          id: homeLocationId(homeOwnerId, hereHouse.tier),
          name: atMyHome
            ? homeDisplayName(user.nickname, housingState, hereHouse.tier)
            : homeDisplayName(homeOwner?.nickname ?? "누군가", homeOwnerHousing ?? housingState, hereHouse.tier),
          emoji: "🏠",
          desc: atMyHome
            ? `${hereHouse.name}입니다. 하우징 메뉴에서 휴식하고 가구를 배치할 수 있어요.`
            : `${homeOwner?.nickname ?? "친구"}님의 집에 놀러 왔어요. 방명록대가 있다면 인사를 남겨보세요.`,
          image: null,
          connJson: bellTower ? JSON.stringify([bellTower.id]) : "[]",
          hidden: false,
          keyword: null,
          cond: null,
          lifeJson: null,
          isStart: false,
          order: 0,
          updatedAt: new Date(),
        }
      : dbHere;

  if (!here) {
    const start = (await getAllLocations()).find((l) => l.isStart) ?? null;
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">{start?.emoji ?? "🗺️"}</div>
          <h1 className="text-xl font-extrabold text-content">모험을 시작해볼까요?</h1>
          <p className="mt-2 text-sm text-faint">
            {start ? `시작 지점: ${start.name}` : "시작 지점이 설정되지 않았어요."}
          </p>
          {start && (
            <form action={enterWorld} className="mt-5">
              <button
                type="submit"
                className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
              >
                🚪 월드 입장
              </button>
            </form>
          )}
        </div>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  const connIds = parseJsonArray(here.connJson);
  const hereLife = parseLocationLife(here.lifeJson);
  const badges = activityBadges(hereLife);
  const discovered = parseJsonArray(sheet.discoveredJson);
  // 정방향 연결(현재 장소가 가리키는 곳) + 발견한 히든(자기 연결에 현재 장소를 적어둔 곳, 역방향 진입)
  const destinations = (
    atHome
      ? []
      : (await getAllLocations()).filter(
          (l) => connIds.includes(l.id) || (l.hidden && discovered.includes(l.id)),
        )
  ).filter((d) => {
    if (d.hidden && !discovered.includes(d.id)) return false;
    return connIds.includes(d.id) || (d.hidden && parseJsonArray(d.connJson).includes(here.id));
  });
  const canEnterHome = !atHome && isBellTowerLocation(here) && housingState.owned.length > 0;
  const atWanderingMerchantCamp =
    here.id === WANDERING_MERCHANT_LOCATION_ID || here.name === WANDERING_MERCHANT_LOCATION_NAME;
  const ownedHouseOptions = house
    ? [house]
    : HOUSE_OPTIONS.filter((option) => housingState.owned.includes(option.tier)).slice(0, 1);

  // 같은 장소의 다른 플레이어 — 표시엔 user 정보만 쓰므로 무거운 시트 JSON 컬럼은 가져오지 않는다
  // (붐비는 장소에서 매 로드마다 전체 시트를 전송하던 egress 폭증 원인)
  const [others, rawLocActions, invEntries, storageBox] = await Promise.all([
    prisma.characterSheet.findMany({
      where: { locationId: here.id, userId: { not: user.id } },
      select: { userId: true, user: { select: { username: true, nickname: true, avatar: true } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
    getLocationActionsAt(here.id),
    prisma.inventoryEntry.findMany({
      where: { userId: user.id, qty: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.storageBox.findUnique({
      where: { userId: user.id },
      include: {
        entries: {
          where: { qty: { gt: 0 } },
          orderBy: { updatedAt: "desc" },
        },
      },
    }),
  ]);
  const locActions = dedupeLifeActions(rawLocActions);

  // 스킬북 토큰은 invEntries(같은 유저·qty>0 전체)의 부분집합이라 메모리에서 걸러낸다.
  // 서버가 정상 지급한 토큰만 "사용" 대상이라는 규칙은 그대로다 (시트 위조 차단).
  const skillBookTokens = invEntries.filter((e) => e.meta === SKILLBOOK_META);
  const tokenItemIds = [...new Set(skillBookTokens.map((t) => t.itemId))];

  const [invItemRows, skillBookItems] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: invEntries.map((e) => e.itemId) } },
      select: { id: true, name: true, weight: true },
    }),
    tokenItemIds.length
      ? prisma.item.findMany({
          where: { id: { in: tokenItemIds } },
          select: { id: true, name: true, desc: true, weight: true },
        })
      : Promise.resolve([]),
  ]);
  const itemCatalog = new Map(invItemRows.map((it) => [it.id, it]));
  const tokenSkillBookNames = [
    ...new Set([...tokenItemIds, ...skillBookItems.map((item) => item.name)]),
  ];

  const sheetInventory = parseSheetInventory(sheet.invJson);
  const rawBagItems: SheetInventoryItem[] =
    sheetInventory
      ? sheetInventory.items
      : invEntries.map((e) => ({
          name: itemCatalog.get(e.itemId)?.name ?? e.itemId,
          effect: null,
          weight: itemCatalog.get(e.itemId)?.weight ?? null,
          qty: e.qty,
        }));
  const rawBagItemNames = new Set(rawBagItems.map((item) => item.name.trim()));
  const tokenOnlySkillBookItems = tokenItemIds.flatMap<SheetInventoryItem>((itemId) => {
      const item = skillBookItems.find((entry) => entry.id === itemId);
      const name = item?.name ?? itemId;
      if (rawBagItemNames.has(name) || rawBagItemNames.has(itemId)) return [];
      const qty = skillBookTokens
        .filter((token) => token.itemId === itemId)
        .reduce((sum, token) => sum + Math.max(0, token.qty), 0);
      if (qty <= 0) return [];
      return [{
        name,
        effect: item?.desc ?? null,
        weight: item?.weight ?? 1,
        qty,
      }];
    });
  const bagItems = [...rawBagItems, ...tokenOnlySkillBookItems].filter((item) => !lifeSkillItemKind(item.name));

  // '스킬 습득' 버튼은 토큰이 아니라 '이 아이템이 스킬북인가' 로 켠다.
  // 토큰으로 켜면 정상 획득이 아닌 스킬북은 버튼 자체가 사라져, 유저 눈엔 이유 없이
  // 버튼이 없는 것처럼 보인다(스킬북17 사례 — 흰산, 토큰 0). 토큰 검사는 서버가
  // 그대로 하므로 버튼을 보여줘도 위조로 습득되지 않는다. 거절 사유만 전달된다.
  const bagItemNames = [...new Set(bagItems.map((item) => item.name.trim()).filter(Boolean))];
  const bagBookSkills = bagItemNames.length
    ? await prisma.combatSkill.findMany({
        where: { sourceItem: { in: bagItemNames } },
        select: { sourceItem: true },
      })
    : [];
  const skillBookNames = [
    ...new Set([
      ...tokenSkillBookNames,
      ...bagBookSkills.map((skill) => skill.sourceItem).filter((v): v is string => !!v),
    ]),
  ];
  const bagGold =
    sheet.curGold != null
      ? `${sheet.curGold.toLocaleString()}G`
      : (sheetInventory?.gold ?? "0G");
  const computedBagWeight = inventoryWeightTotal(bagItems);
  const bagWeight =
    (computedBagWeight ?? sheetInventory?.curWeight) != null && sheetInventory?.maxWeight != null
      ? `${computedBagWeight ?? sheetInventory.curWeight} / ${sheetInventory.maxWeight}`
      : null;
  const storage: StorageView = {
    maxWeight: (storageBox?.maxWeight ?? 30) + storageWeightBonus(sheet.adventurerRank), // 랭크 특혜
    usedWeight:
      storageBox?.entries.reduce(
        (sum, item) => sum + (item.weight ?? 0) * Math.max(0, item.qty),
        0,
      ) ?? 0,
    upgradeCost: storageUpgradeCost(storageBox?.maxWeight ?? 30),
    upgradeAmount: STORAGE_UPGRADE_STEP,
    items:
      storageBox?.entries.map((item) => ({
        id: item.id,
        sourceKind:
          item.sourceKind === "낚시" || item.sourceKind === "채집" || item.sourceKind === "채광"
            ? item.sourceKind
            : "basic",
        name: item.name,
        effect: item.effect,
        weight: item.weight,
        qty: item.qty,
      })) ?? [],
  };
  const life = parseLifeState(sheet.lifeJson);
  const lifeShop: LifeShopView = {
    gold: sheet.curGold ?? (parseGoldToInt(sheetInventory?.gold) || 0),
    bags: {
      낚시: { name: life.bags.낚시.name, maxWeight: life.bags.낚시.maxWeight },
      채집: { name: life.bags.채집.name, maxWeight: life.bags.채집.maxWeight },
      채광: { name: life.bags.채광.name, maxWeight: life.bags.채광.maxWeight },
    },
    tools: life.tools,
    detectors: life.detectors,
  };
  // 탐지기·감정기 — 지금 서 있는 장소의 등급 확률. 장비가 없거나 여기서 못 하는 스킬은 빠진다.
  const detectorViews: DetectorView[] = (
    [
      ["낚시", hereLife?.fish],
      ["채집", hereLife?.gather],
      ["채광", hereLife?.mine],
    ] as const
  )
    .map(([kind, pool]) =>
      buildDetectorView({
        kind,
        tier: life.detectors[kind] ?? 0,
        life,
        statsJson: sheet.statsJson,
        pool: pool ?? null,
        locationName: here.name,
      }),
    )
    .filter((view): view is DetectorView => view != null);
  const lifeStorageItems: LifeStorageItemView[] = (["낚시", "채집", "채광"] as const).flatMap((kind) =>
    life.bags[kind].items.map((item) => ({
      sourceKind: kind,
      name: item.name,
      rank: item.rank,
      effect: `R${item.rank} · ${item.text}`,
      weight: item.weight,
      qty: item.qty,
    })),
  );
  const lifeBags = ([
    { kind: "낚시" as const, emoji: "🎣" },
    { kind: "채집" as const, emoji: "🌿" },
    { kind: "채광" as const, emoji: "⛏️" },
  ]).map(({ kind, emoji }) => {
    const bag = life.bags[kind];
    const max = lifeBagLimit(life, kind);
    return {
      kind,
      name: bag.name,
      emoji,
      weight: `${lifeBagWeight(bag)} / ${max}`,
      items: bag.items.map((item) => ({
        name: item.name,
        effect: `R${item.rank} · ${item.text}`,
        weight: item.weight,
        qty: item.qty,
      })),
    };
  });
  const canGuild = hasServiceKeyword(here, locActions, ["길드", "guild"]);
  const canGuildBackyard = hasServiceKeyword(here, locActions, GUILD_BACKYARD_KEYWORDS);
  // 길드 일일 의뢰 — lazy 리셋(자정/주간) + 보유 수량·스킬북 교환 목록 조립.
  // 창고(storageBox) 재고도 납품 가능하므로 보유 수량에 합산한다.
  const { state: gq } = await loadGuildQuestState(user.id, sheet);
  const questStorageQty = (offer: (typeof gq.offers)[number]): number => {
    const t = offer.itemName.trim();
    return (
      storageBox?.entries
        .filter((entry) => {
          const n = entry.name.trim();
          // 요리 의뢰는 등급 접두 인정, 그 외는 정확히 일치
          return offer.kind === "요리" ? n === t || n.endsWith(` ${t}`) : n === t;
        })
        .reduce((sum, entry) => sum + Math.max(0, entry.qty), 0) ?? 0
    );
  };
  const questOffers: QuestOfferView[] = gq.offers.map((offer) => ({
    ...offer,
    have:
      (offer.kind === "요리"
        ? rawBagItems
            .filter((item) => {
              const n = item.name.trim();
              const t = offer.itemName.trim();
              return n === t || n.endsWith(` ${t}`);
            })
            .reduce((sum, item) => sum + Math.max(0, item.qty), 0)
        : life.bags[offer.kind].items
            .filter((item) => item.name.trim() === offer.itemName.trim())
            .reduce((sum, item) => sum + Math.max(0, item.qty), 0)) + questStorageQty(offer),
  }));
  // 위쪽 skillBookTokens 와 완전히 같은 조회라 그대로 재사용한다 (같은 렌더에서 두 번 갈 이유가 없다)
  const bookTokens = skillBookTokens;
  const bookSkills = bookTokens.length
    ? await prisma.combatSkill.findMany({
        where: { sourceItem: { in: bookTokens.map((token) => token.itemId) } },
        select: { sourceItem: true, name: true, job: true },
      })
    : [];
  const questBooks = bookTokens
    .map((token) => {
      const num = skillbookNumber(token.itemId);
      if (num == null) return null;
      const skill = bookSkills.find((entry) => entry.sourceItem === token.itemId);
      return {
        name: token.itemId,
        qty: token.qty,
        skillName: skill?.name ?? token.itemId,
        job: skill?.job ?? null,
        unique: isUniqueSkillbook(num),
      };
    })
    .filter((book): book is NonNullable<typeof book> => book != null);
  // 길드 뒷마당 단련 — 누적 카운터(단련횟수)로 밀린 능력치 선택 수를 계산.
  // 100~900회마다 1회씩(최대 9회) 능력치를 성장시킬 수 있다.
  const trainingStats: { key: string; label: string; value: number | null }[] = (() => {
    try {
      const arr = JSON.parse(sheet.statsJson ?? "[]") as {
        key?: string;
        label?: string;
        value?: number | null;
      }[];
      return arr
        .filter((s) => s.label)
        .map((s) => ({ key: s.key ?? s.label!, label: s.label!, value: s.value ?? null }));
    } catch {
      return [];
    }
  })();
  const { trainingCount, trainingPending, trainingConsumed } = (() => {
    try {
      const stats = JSON.parse(sheet.achStatsJson ?? "{}") as Record<string, number>;
      const count = stats["단련횟수"] ?? 0;
      const consumed = stats["단련성장선택"] ?? 0;
      return {
        trainingCount: count,
        trainingConsumed: consumed,
        trainingPending: Math.max(0, Math.min(9, Math.floor(count / 100)) - consumed),
      };
    } catch {
      return { trainingCount: 0, trainingConsumed: 0, trainingPending: 0 };
    }
  })();
  const guild: GuildView = {
    rank: sheet.adventurerRank,
    fame: totalFameForRank(sheet.adventurerRank, sheet.fame),
    training: {
      count: trainingCount,
      pendingPicks: trainingPending,
      // 지금 고를 선택은 (이미 소비한 선택 + 1) 번째 마일스톤 = ×100회
      currentMilestone: trainingPending > 0 ? (trainingConsumed + 1) * 100 : null,
      stats: trainingStats,
    },
    quests: {
      offers: questOffers,
      acceptedId: gq.acceptedId,
      delivered: !!gq.deliveredAt,
      rerolls: gq.rerolls,
      rerollMax: rerollCap(normalizeAdventurerRank(sheet.adventurerRank)),
      weekCount: gq.weekCount,
      weekGoal: WEEK_GOAL,
      frags: gq.frags,
      fragCost: FRAG_COST,
      books: questBooks,
    },
  };
  // 대장간 장비 제작 — 보유 광물(채광 가방 + 기본 인벤) × 활성 광물 풀(분류/제작효과)
  // 효과는 한 번이라도 제작에 써본 광물만 공개(achStats '제작광물:이름' 마크)
  let usedCraftMinerals = new Set<string>();
  try {
    const achStats = JSON.parse(sheet.achStatsJson ?? "{}") as Record<string, number>;
    usedCraftMinerals = new Set(
      Object.keys(achStats)
        .filter((key) => key.startsWith("제작광물:"))
        .map((key) => key.slice("제작광물:".length)),
    );
  } catch {
    usedCraftMinerals = new Set();
  }
  const mineralCraftViews: CraftMineralView[] = getActiveItems("채광")
    .filter((def) => def.craftRole === "메이저" || def.craftRole === "마이너")
    .map((def) => ({
      def,
      have:
        life.bags.채광.items
          .filter((item) => item.name.trim() === def.name)
          .reduce((sum, item) => sum + Math.max(0, item.qty), 0) +
        rawBagItems
          .filter((item) => item.name.trim() === def.name)
          .reduce((sum, item) => sum + Math.max(0, item.qty), 0) +
        (storageBox?.entries
          .filter((item) => item.name.trim() === def.name)
          .reduce((sum, item) => sum + Math.max(0, item.qty), 0) ?? 0),
      used: usedCraftMinerals.has(def.name),
    }))
    .filter((entry) => entry.have > 0);
  // 아이템 탭 드롭품(제작효과 有) — 마이너 재료로 합류 (그리폰 깃털 등). 정적 카탈로그라 캐시.
  const dropMinorDefs = await getCraftEffectItems();
  const mineralNames = new Set(mineralCraftViews.map((entry) => entry.def.name));
  const dropMinorViews: CraftMineralView[] = dropMinorDefs
    .filter((it) => !mineralNames.has(it.name.trim()))
    .map((it) => ({
      def: itemAsCraftMinor(it),
      have:
        rawBagItems
          .filter((item) => item.name.trim() === it.name.trim())
          .reduce((sum, item) => sum + Math.max(0, item.qty), 0) +
        (storageBox?.entries
          .filter((item) => item.name.trim() === it.name.trim())
          .reduce((sum, item) => sum + Math.max(0, item.qty), 0) ?? 0),
      used: usedCraftMinerals.has(it.name.trim()),
    }))
    .filter((entry) => entry.have > 0);
  // 달의 파편 — 광물 탭이 아니라 던전 산출물이지만 Lv6~10 티어를 여는 메이저다.
  const moonHave =
    rawBagItems
      .filter((item) => item.name.trim() === MOON_FRAGMENT)
      .reduce((sum, item) => sum + Math.max(0, item.qty), 0) +
    (storageBox?.entries
      .filter((item) => item.name.trim() === MOON_FRAGMENT)
      .reduce((sum, item) => sum + Math.max(0, item.qty), 0) ?? 0);
  // 재료가치는 실제 제작(actions/craft.ts)과 같은 기준이어야 한다 — 도감(시트) 판매가가 먼저다.
  const moonItem = await prisma.item.findFirst({
    where: { OR: [{ id: MOON_FRAGMENT }, { name: MOON_FRAGMENT }] },
    select: { sellPrice: true, weight: true },
  });
  const moonViews: CraftMineralView[] = [
    {
      def: {
        ...itemAsCraftMinor({
          name: MOON_FRAGMENT,
          craftEffect: null,
          sellPrice: resolveMaterialSellPrice(MOON_FRAGMENT, moonItem?.sellPrice),
          desc: "장비 레벨을 6~10으로 끌어올린다. 넣은 개수가 곧 단계.",
          weight: moonItem?.weight ?? 1,
        }),
        craftRole: "메이저",
      },
      have: moonHave,
      used: usedCraftMinerals.has(MOON_FRAGMENT),
    },
  ];
  const craftMinerals = [...mineralCraftViews, ...moonViews, ...dropMinorViews];
  // [태그] 룰 사전 — 제작특성 탭 동기화본 (정적 카탈로그라 캐시)
  const craftTagRows = await getCraftTagRows();
  const craftTags = Object.fromEntries(craftTagRows.map((tag) => [tag.name, tag.desc]));
  const craftTagSlots = Object.fromEntries(craftTagRows.map((tag) => [tag.name, tag.slot]));
  const canMarket = hasServiceKeyword(here, locActions, [
    "상점",
    "시장",
    "잡화",
    "구매",
    "shop",
    "store",
    "market",
  ]);
  // 대장간은 시장과 분리 — '대장간' 장소(또는 강화/제련 행동)에서만 노출.
  const canForge = hasServiceKeyword(here, locActions, [
    "대장간",
    "강화",
    "제련",
    "forge",
    "smith",
    "blacksmith",
  ]);
  const canBlackMarket = hasServiceKeyword(here, locActions, [
    "암시장",
    "뒷골목",
    "black market",
    "back alley",
  ]);
  const canAlchemyBookShop = [here.id, here.name].some((value) => value.includes("오두막"));
  const canStorage =
    atMyHome || canGuild || hasServiceKeyword(here, locActions, ["창고", "보관", "storage", "warehouse"]);
  const canInn = hasServiceKeyword(here, locActions, ["여관", "숙소", "inn"]);
  const inn: InnView = {
    gold: sheet.curGold ?? 0,
    ap,
    maxAp: FATIGUE_MAX,
    restedToday: restedTodayKst(sheet.restedAt),
  };
  // ── 친구 목록 + 현재 위치 (히든 장소는 가림) ──
  // 친구·친구요청·집초대는 서로 무관하므로 한 번에 보낸다.
  const [friendRows, friendRequestRows, houseInviteRows] = await Promise.all([
    prisma.friendship.findMany({
      where: { status: "accepted", OR: [{ userId: user.id }, { friendId: user.id }] },
      include: {
        user: { select: { id: true, nickname: true, username: true } },
        friend: { select: { id: true, nickname: true, username: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.friendship.findMany({
      where: { friendId: user.id, status: "pending" },
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.houseInvite.findMany({
      where: { toId: user.id },
      include: { from: { select: { nickname: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const friendUsers = friendRows.map((row) => (row.userId === user.id ? row.friend : row.user));
  const friendSheets = friendUsers.length
    ? await prisma.characterSheet.findMany({
        where: { userId: { in: friendUsers.map((f) => f.id) } },
        select: { userId: true, locationId: true },
      })
    : [];
  const friendLocIds = [
    ...new Set(
      friendSheets
        .map((s) => s.locationId)
        .filter((id): id is string => !!id && !isHomeLocationId(id)),
    ),
  ];
  const friendLocs = friendLocIds.length
    ? await prisma.location.findMany({
        where: { id: { in: friendLocIds } },
        select: { id: true, name: true, emoji: true, hidden: true },
      })
    : [];
  const friendLocById = new Map(friendLocs.map((l) => [l.id, l]));
  const friendSheetByUser = new Map(friendSheets.map((s) => [s.userId, s]));
  const friendViews = friendUsers.map((f) => {
    const locId = friendSheetByUser.get(f.id)?.locationId ?? null;
    let where = "🚪 월드 밖";
    if (locId && isHomeLocationId(locId)) {
      where = homeOwnerFromLocationId(locId) === f.id ? "🏠 자택" : "🏠 친구 집 방문 중";
    } else if (locId) {
      const loc = friendLocById.get(locId);
      where = !loc || loc.hidden ? "🕶️ 어딘가…" : `${loc.emoji ?? "📍"} ${loc.name}`;
    }
    return { id: f.id, username: f.username, nickname: f.nickname, where };
  });
  const friendRequests = friendRequestRows.map((row) => ({
    id: row.id,
    nickname: row.user.nickname,
  }));
  const houseInvites = houseInviteRows.map((row) => ({
    id: row.id,
    nickname: row.from.nickname,
  }));

  // ── 방명록 — 지금 서 있는 집(내 집 또는 친구 집)의 것 ──
  const guestbookHousing = atMyHome ? housingState : homeOwnerHousing;
  const hasGuestbookStand = guestbookHousing
    ? hasFurnitureEffect(guestbookHousing, "guestbook")
    : false;
  const guestbookEntries =
    atHome && homeOwnerId && hasGuestbookStand
      ? (
          await prisma.houseGuestbook.findMany({
            where: { ownerId: homeOwnerId },
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { author: { select: { nickname: true } } },
          })
        ).map((entry) => ({
          id: entry.id,
          author: entry.author.nickname,
          content: entry.content,
          at: entry.createdAt.toISOString(),
        }))
      : [];

  const housingProduction = (["낚시", "채집"] as const).reduce(
    (acc, kind) => {
      const production = housingState.production[kind];
      const bagItems = life.bags[kind].items
        .filter((item) => item.qty > 0)
        .map((item) => ({
          name: item.name,
          rank: item.rank,
          qty: item.qty,
        }));
      const redeemItems = life.collection[kind]
        .map((name) => findLifeSkillItem(kind, name))
        .filter((item): item is NonNullable<typeof item> => item != null)
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ko"))
        .map((item) => ({
          name: item.name,
          rank: item.rank,
          cost: productionRedeemCost(item.rank),
        }));
      const facility = ownedProductionOption(housingState, kind);
      acc[kind] = {
        points: production.points,
        dailyPoints: productionDailyPoints(production),
        capacity: productionSlotCap(housingState, kind),
        facilityName: facility?.name ?? (kind === "낚시" ? "어항" : "약초 화분"),
        facilityEmoji: facility?.emoji ?? (kind === "낚시" ? "🐠" : "🪴"),
        slots: production.slots,
        bagItems,
        redeemItems,
      };
      return acc;
    },
    {} as HousingView["production"],
  );

  const housing: HousingView = {
    gold: sheet.curGold ?? (parseGoldToInt(sheetInventory?.gold) || 0),
    ap,
    maxAp: FATIGUE_MAX,
    tier: house?.tier ?? null,
    name: house?.name ?? null,
    restAmount: house?.restAmount ?? null,
    restedToday: restedTodayKst(sheet.houseRestedAt),
    atHome: atMyHome,
    options: HOUSE_OPTIONS.map((option) => ({
      tier: option.tier,
      name: option.name,
      price: option.price,
      restAmount: option.restAmount,
      note: option.note,
      owned: option.tier === house?.tier,
      sellPrice: houseSellPrice(option.tier),
    })),
    furnitureOwned: housingState.items,
    furnitureUsedToday: Object.fromEntries(
      housingState.items.map((id) => [
        id,
        housingState.usedAt[id] ? restedTodayKst(new Date(housingState.usedAt[id])) : false,
      ]),
    ),
    production: housingProduction,
    homeName: housingState.homeName,
    friends: friendViews.map((f) => ({ id: f.id, nickname: f.nickname })),
  };
  const canHousing = atMyHome || isBellTowerLocation(here);
  // 분수 광장 — 주간 수입 (프리 플레이 스킬·우상 환전)
  const atPlaza = `${here.id} ${here.name}`.includes("분수");
  let weeklyIncome: WeeklyIncomeView | null = null;
  if (atPlaza) {
    const week = dungeonWeekKey();
    const incomeState = parseWeeklyIncomeState(sheet.weeklyIncomeJson, week);
    weeklyIncome = {
      week,
      entries: buildWeeklyIncomeEntries({
        sheetSkillsJson: sheet.sheetSkillsJson,
        statsJson: sheet.statsJson,
        invJson: sheet.invJson,
        level: sheet.level,
        claimed: incomeState.claimed,
      }),
    };
  }
  const cookingEnabled = canMarket || atMyHome;
  const cookingFacility = atMyHome ? "home" : "public";
  const allRecipes = cookingEnabled ? await getCookingRecipes() : [];
  const discoveredRecipes = cookingEnabled
    ? await prisma.userRecipe.findMany({
        where: { userId: user.id },
        select: { recipeId: true },
      })
    : [];
  const discoveredRecipeIds = new Set(discoveredRecipes.map((recipe) => recipe.recipeId));
  const knownRecipes = allRecipes
    .filter((recipe) => recipe.isPublic || discoveredRecipeIds.has(recipe.id))
    .map((recipe) => {
      const ingredientList = parseRecipeIngredients(recipe.ingredientsJson).map((ingredient) => ({
        name: ingredient.name,
        qty: ingredient.qty,
      }));
      return {
        id: recipe.id,
        name: recipe.name,
        rank: recipe.rank,
        category: recipe.category,
        ingredients: ingredientList.map((i) => `${i.name}x${i.qty}`).join(", "),
        ingredientList, // 원클릭 담기용 구조화 재료
        resultName: recipe.resultName,
        sellPrice: recipe.sellPrice,
        effect: recipe.effect,
        tags: recipe.tags,
      };
    });
  const cookedPrice = new Map(allRecipes.map((recipe) => [recipe.resultName, recipe.sellPrice]));
  const cookedCost = await recipeCostMap(allRecipes);
  cookedPrice.set("실패한 요리", 1);
  // 등급 요리("고품질 ○○", "○○의 △△")도 판매 목록에 포함 — 접두어를 떼어 기본 레시피와 대조하고
  // 등급 배수(priceMult)를 곱한 단가를 표기. 접두어만 우연히 걸리는 재료는 base 매칭으로 걸러진다.
  const cookedFoods = bagItems
    .map((item) => {
      const raw = item.name.trim();
      if (cookedPrice.has(raw)) {
        return { name: raw, qty: item.qty, unitPrice: cookedPrice.get(raw) ?? 1, effect: item.effect };
      }
      const { base, grade } = parseCookedName(raw);
      if (grade && cookedPrice.has(base)) {
        const unit = profitAdjustedSellPrice(cookedPrice.get(base) ?? 1, cookedCost.get(base) ?? 0, grade);
        return { name: raw, qty: item.qty, unitPrice: unit, effect: item.effect };
      }
      return null;
    })
    .filter((food): food is NonNullable<typeof food> => food != null && food.qty > 0);
  const cooking: CookingView = {
    enabled: cookingEnabled,
    facility: cookingFacility,
    facilityName: atMyHome ? "집 주방" : "공용 주방",
    maxIngredients: atMyHome ? 4 : 3,
    ap,
    knownRecipes,
    cookedFoods,
  };
  // ── 연금술 — 본인 집 + 연금술 공방 가구가 있을 때만 ──
  const alchemyLab = ownedAlchemyLab(housingState);
  const alchemyEnabled = atMyHome && alchemyLab != null;
  const alchemyRecipes = alchemyEnabled || canAlchemyBookShop ? await getAlchemyRecipes() : [];
  const unlockedAlchemyRecipeIds = new Set(life.alchemyPerfect);
  const visibleAlchemyRecipes = alchemyRecipes.filter(
    (recipe) => recipe.isPublic || unlockedAlchemyRecipeIds.has(recipe.id),
  );
  const alchemyRecipeViews: AlchemyRecipeView[] = visibleAlchemyRecipes.map((recipe) => {
    const ingredientList = parseRecipeIngredients(recipe.ingredientsJson).map((ingredient) => ({
      name: ingredient.name,
      qty: ingredient.qty,
    }));
    // 최적시간·완벽효과는 비밀 — 완벽 제조에 성공한 포션만 공개
    const mastered = life.alchemyPerfect.includes(recipe.id);
    const masteryExp = life.alchemyMastery[recipe.id] ?? 0;
    const masteryRank = alchemyMasteryRank(masteryExp);
    const nextMastery =
      masteryExp < ALCHEMY_ADEPT_MASTERY
        ? ALCHEMY_ADEPT_MASTERY
        : masteryExp < ALCHEMY_MASTER_MASTERY
          ? ALCHEMY_MASTER_MASTERY
          : null;
    return {
      id: recipe.id,
      name: recipe.name,
      rank: recipe.rank,
      category: recipe.category,
      ingredients: ingredientList.map((i) => `${i.name}x${i.qty}`).join(", "),
      ingredientList,
      resultName: recipe.resultName,
      sellPrice: recipe.sellPrice,
      effect: recipe.effect,
      duration: recipe.duration,
      skillExp: recipe.skillExp,
      tags: recipe.tags,
      mastered,
      masteryExp,
      masteryRank,
      nextMastery,
      bestMinutes: mastered ? recipe.bestMinutes : null,
      perfectEffect: mastered ? recipe.perfectEffect : null,
      adeptPerfectEffect: mastered ? recipe.perfectEffect : null,
      masterPerfectEffect: null,
      pointCost: Math.max(0, recipe.skillExp),
      requiredMaterials: ingredientList,
      optionPrice: Math.max(0, recipe.sellPrice),
      repeatable: alchemyOptionRepeatable(recipe.tags),
      repeatPointStep: alchemyOptionRepeatPointStep(recipe.tags),
    };
  });
  const potionPrice = new Map(alchemyRecipes.map((recipe) => [recipe.resultName, recipe.sellPrice]));
  const potionCost = await recipeCostMap(alchemyRecipes);
  const potionsForSale = alchemyEnabled
    ? bagItems
        .map((item) => {
          const raw = item.name.trim();
          if (isCustomAlchemyPotionName(raw) || customPotionSellPrice(item.effect) != null) {
            const unitPrice = customPotionSellPrice(item.effect);
            return unitPrice != null ? { name: raw, qty: item.qty, unitPrice, effect: item.effect } : null;
          }
          const { base, modifier, grade } = parsePotionName(raw);
          if (!potionPrice.has(base)) return null;
          const acceleratorMinutes = alchemyAcceleratorMinutes(raw, item.effect);
          const basePrice = Math.round((potionPrice.get(base) ?? 1) * (modifier === "약한" ? WEAK_PRICE_MULT : 1));
          const unit =
            acceleratorMinutes != null
              ? Math.round(((potionPrice.get(base) ?? 1) * acceleratorMinutes) / 10)
              : profitAdjustedSellPrice(basePrice, potionCost.get(base) ?? 0, grade);
          return { name: raw, qty: item.qty, unitPrice: unit, effect: item.effect };
        })
        .filter((potion): potion is NonNullable<typeof potion> => potion != null && potion.qty > 0)
    : [];
  const alchemyAccelerators = alchemyEnabled
    ? bagItems
        .map((item) => {
          const raw = item.name.trim();
          const minutes = alchemyAcceleratorMinutes(raw, item.effect);
          return minutes ? { name: raw, qty: item.qty, minutes } : null;
        })
        .filter((item): item is NonNullable<typeof item> => item != null && item.qty > 0)
    : [];
  let brewing: AlchemyView["brewing"] = null;
  if (alchemyEnabled && sheet.pendingBrewJson) {
    const pendingBrew = parsePendingBrew(sheet.pendingBrewJson);
    if (pendingBrew) {
      const brewRecipe = alchemyRecipes.find((recipe) => recipe.id === pendingBrew.recipeId);
      brewing = {
        recipeId: pendingBrew.recipeId,
        recipeName: pendingBrew.resultName ?? brewRecipe?.name ?? "알 수 없는 포션",
        minutes: pendingBrew.minutes,
        startedAt: pendingBrew.startedAt,
        readyAt: pendingBrew.readyAt,
      };
    }
  }
  const alchemy: AlchemyView = {
    enabled: alchemyEnabled,
    labName: alchemyLab?.name ?? "연금술 공방",
    labEmoji: alchemyLab?.emoji ?? "⚗️",
    labTier: alchemyLab?.tier ?? 0,
    tolerance: alchemyToleranceBonus(housingState) ?? 0,
    ap,
    gold: housing.gold,
    level: alchemyLevel(life),
    exp: life.alchemy.exp,
    nextExp: productionExpForNext("alchemy", life.alchemy.level),
    recipeCount: visibleAlchemyRecipes.length,
    maxIngredients: alchemyLabSlotLimit(alchemyLab?.tier ?? 1),
    recipes: alchemyRecipeViews,
    brewing,
    potions: potionsForSale,
    accelerators: alchemyAccelerators,
  };
  // 서로 의존이 없어 한 번에 보낸다 — 순서대로 기다리면 왕복 4번이 그대로 함수 실행시간이 된다.
  const [blackMarketQuest, blackMarketExchange, blackMarketStock, blackMarketPotionRows] =
    await Promise.all([
      loadBlackMarketQuestState(user.id, sheet),
      loadBlackMarketExchangeState(user.id, sheet),
      ensureBlackMarketStock(),
      getBlackMarketPotionRows(),
    ]);
  const blackMarketPotionByKey = new Map(
    blackMarketPotionRows.flatMap((item) => [
      [item.id, item],
      [item.name, item],
    ]),
  );
  const blackQuestHave = (offer: BlackMarketQuestOffer | null): number => {
    if (!offer) return 0;
    const target = offer.itemName.trim();
    return (
      rawBagItems
        .filter((item) => item.name.trim() === target)
        .reduce((sum, item) => sum + Math.max(0, item.qty), 0) +
      (storageBox?.entries
        .filter((item) => item.name.trim() === target)
        .reduce((sum, item) => sum + Math.max(0, item.qty), 0) ?? 0)
    );
  };
  const blackMarket: BlackMarketView = {
    gold: housing.gold,
    coins: sheet.blackMarketCoins ?? 0,
    isGm,
    quest: blackMarketQuest.offer
      ? {
          ...blackMarketQuest.offer,
          have: blackQuestHave(blackMarketQuest.offer),
          delivered: !!blackMarketQuest.deliveredAt,
        }
      : null,
    stock: blackMarketStock.map((item) => {
      let skillName: string | null = null;
      if (item.meta) {
        try {
          skillName = (JSON.parse(item.meta) as { skillName?: string }).skillName ?? null;
        } catch {
          skillName = null;
        }
      }
      return { ...item, skillName };
    }),
    potions: BLACK_MARKET_POTIONS.map((potion) => {
      const item = blackMarketPotionByKey.get(potion.id) ?? blackMarketPotionByKey.get(potion.itemName);
      return {
        id: potion.id,
        itemName: item?.name ?? potion.itemName,
        desc: item?.desc ?? null,
        weight: item?.weight ?? 1,
        coinPrice: potion.coinPrice,
      };
    }),
    exchanges: BLACK_MARKET_EXCHANGE_OFFERS.map((offer) => {
      const used = blackMarketExchange.used[offer.id] ?? 0;
      return {
        id: offer.id,
        goldCost: offer.goldCost,
        coinReward: offer.coinReward,
        dailyLimit: offer.dailyLimit,
        used,
        remaining: offer.dailyLimit == null ? null : Math.max(0, offer.dailyLimit - used),
      };
    }),
    books: ALCHEMY_BOOKS.map((book) => {
      const recipe = alchemyRecipes.find(
        (candidate) =>
          book.optionNames.some((name) => name === candidate.id || name === candidate.name),
      );
      return {
        ...book,
        optionNames: [...book.optionNames],
        total: recipe ? 1 : 0,
        unlocked: recipe && unlockedAlchemyRecipeIds.has(recipe.id) ? 1 : 0,
      };
    }),
  };
  const [activeWanderingMerchant, wanderingMerchantSummonCount] = atWanderingMerchantCamp
    ? await Promise.all([loadActiveWanderingMerchant(), countTodayWanderingMerchantSummons()])
    : [null, 0];
  const wanderingMerchant: WanderingMerchantView = {
    enabled: atWanderingMerchantCamp,
    isGm,
    gold: housing.gold,
    todaySummonCount: wanderingMerchantSummonCount,
    active: activeWanderingMerchant
      ? {
          id: activeWanderingMerchant.id,
          startsAt: activeWanderingMerchant.startsAt.toISOString(),
          endsAt: activeWanderingMerchant.endsAt.toISOString(),
          stock: activeWanderingMerchant.stock.map((item) => ({
            id: item.id,
            slot: item.slot,
            kind: item.kind,
            itemName: item.itemName,
            rank: item.rank,
            price: item.price,
            stock: item.stock,
            initialStock: item.initialStock,
            meta: item.meta,
          })),
        }
      : null,
  };
  let gatherPending: PendingGatherView | null = null;
  if (sheet.pendingGatherJson) {
    try {
      const p = JSON.parse(sheet.pendingGatherJson) as {
        status?: string;
        rarity?: string;
        readyAt?: number;
      };
      if (p.status === "searching" && typeof p.readyAt === "number") {
        gatherPending = { status: "searching", rarity: p.rarity ?? "", readyAt: p.readyAt };
      }
    } catch {
      gatherPending = null;
    }
  }
  let fishPending: PendingFishView | null = null;
  if (sheet.pendingCatchJson) {
    try {
      const p = JSON.parse(sheet.pendingCatchJson) as {
        status?: string;
        rarity?: string;
        readyAt?: number;
      };
      if (p.status === "searching" && typeof p.readyAt === "number") {
        fishPending = { status: "searching", rarity: p.rarity ?? "", readyAt: p.readyAt };
      }
    } catch {
      fishPending = null;
    }
  }
  let minePending: PendingMineView | null = null;
  if (sheet.pendingMineJson) {
    try {
      const p = JSON.parse(sheet.pendingMineJson) as {
        status?: string;
        rarity?: string;
        readyAt?: number;
      };
      if (p.status === "searching" && typeof p.readyAt === "number") {
        minePending = { status: "searching", rarity: p.rarity ?? "", readyAt: p.readyAt };
      }
    } catch {
      minePending = null;
    }
  }

  const dungeonsHere = await getDungeonsAt(here.id);
  let dungeonView: DungeonView[] = [];
  let dungeonAbilities: DungeonAbility[] = [];
  let dungeonRunsLeft = 0;
  let dungeonWeekly = 3;
  if (dungeonsHere.length > 0) {
    dungeonView = dungeonsHere.map((d) => {
      let drops: DropEntry[] = [];
      try {
        drops = JSON.parse(d.dropsJson) as DropEntry[];
      } catch {
        drops = [];
      }
      let rollDrops: DropEntry[] = [];
      try {
        rollDrops = d.rollDropsJson ? (JSON.parse(d.rollDropsJson) as DropEntry[]) : [];
      } catch {
        rollDrops = [];
      }
      return {
        id: d.id,
        name: d.name,
        dc: d.dc,
        exp: d.exp,
        expMax: d.expMax,
        floor: d.floor,
        rewards: drops
          .filter((x) => x.item !== "꽝")
          .map((x) => (x.item === "골드" ? `${x.gold}G` : `${x.item} x${x.qty}`)),
        hasRandom: rollDrops.some((x) => x.item !== "꽝"),
      };
    });
    let stats: { label: string; mod: number | null }[] = [];
    try {
      stats = JSON.parse(sheet.statsJson ?? "[]") as { label: string; mod: number | null }[];
    } catch {
      stats = [];
    }
    dungeonAbilities = ABILITY_LABELS_KO.map((label) => ({
      label,
      mod: stats.find((s) => s.label === label)?.mod ?? null,
    }));
    const week = dungeonWeekKey();
    const used = sheet.dungeonWeek === week ? sheet.dungeonRuns : 0;
    dungeonWeekly = dungeonWeeklyLimit(sheet.adventurerRank);
    dungeonRunsLeft = Math.max(0, dungeonWeekly - used);
  }

  let adminLocations: { id: string; name: string }[] = [];
  let adminRifts: AdminRift[] = [];
  let adminPlayers: { userId: string; label: string }[] = [];
  if (isGm) {
    const [playerSheets, locations, openRifts] = await Promise.all([
      prisma.characterSheet.findMany({
        select: { userId: true, sheetTab: true, user: { select: { nickname: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.location.findMany({ select: { id: true, name: true }, orderBy: { order: "asc" } }),
      prisma.rift.findMany({ where: { status: "open" }, orderBy: { createdAt: "desc" } }),
    ]);
    adminPlayers = playerSheets.map((s) => ({
      userId: s.userId,
      label: `${s.user.nickname} · ${s.sheetTab}`,
    }));
    adminLocations = locations;
    const locName = new Map(adminLocations.map((l) => [l.id, l.name]));
    // 균열마다 count 를 따로 세면 N+1 — groupBy 한 번으로 끝낸다.
    const memberCounts = openRifts.length
      ? await prisma.riftMember.groupBy({
          by: ["riftId"],
          where: { riftId: { in: openRifts.map((r) => r.id) } },
          _count: { _all: true },
        })
      : [];
    const countByRift = new Map(memberCounts.map((c) => [c.riftId, c._count._all]));
    adminRifts = openRifts.map((r) => ({
      id: r.id,
      type: r.type,
      originName: locName.get(r.originId) ?? r.originId,
      count: countByRift.get(r.id) ?? 0,
    }));
  }

  // 적용 중인 이벤트·요리 버프 — 월드 상단 표시용 (같은 요리에서 나온 생활 행운은 한 칩으로 합침)
  const activeLanternEmbers = await loadActiveLanternEmbers();
  const buffRows: WorldBuff[] = [
    ...dailyEventBuffs().map((buff) => ({ ...buff, source: "event" as const })),
    ...activeLanternEmbers.map((ember) => ({
      icon: ember.icon,
      label: `${ember.itemName} · ${ember.statLine}`,
      until: null,
      source: "lantern" as const,
    })),
  ];
  for (const buff of life.cookingBuffs.lifeLuck) {
    const kinds =
      buff.kind === "all"
        ? ["낚시", "채집", "채광"]
        : buff.kind === "both"
          ? ["낚시", "채집"]
          : [buff.kind];
    const found = buffRows.find(
      (row) => row.until === buff.until && row.label.endsWith(`행운 +${buff.amount}`) && row.icon === "🍀",
    );
    if (found) {
      const [head] = found.label.split(" 행운 ");
      const merged = [...new Set([...head.split("·"), ...kinds])];
      found.label = `${merged.join("·")} 행운 +${buff.amount}`;
    } else {
      buffRows.push({ icon: "🍀", label: `${kinds.join("·")} 행운 +${buff.amount}`, until: buff.until, source: "food" });
    }
  }
  for (const buff of life.cookingBuffs.potionLifeLuck) {
    const kinds =
      buff.kind === "all"
        ? ["낚시", "채집", "채광"]
        : buff.kind === "both"
          ? ["낚시", "채집"]
          : [buff.kind];
    buffRows.push({
      icon: "🍀",
      label: `${kinds.join("·")} 행운 +${buff.amount}`,
      until: buff.until,
      source: "potion",
    });
  }
  for (const buff of life.cookingBuffs.stat) {
    buffRows.push({
      icon: "🎲",
      label: `${buff.label === "모든" ? "모든 능력" : buff.label} 판정 +${buff.amount}`,
      until: buff.until,
      source: "food",
    });
  }
  for (const buff of life.cookingBuffs.potionStat) {
    buffRows.push({
      icon: "🎲",
      label: `${buff.label === "모든" ? "모든 능력" : buff.label} +${buff.amount}`,
      until: buff.until,
      source: "potion",
    });
  }
  const displayActionApCost = (action: (typeof locActions)[number]): number => {
    const kind = lifeSkillKindOf(action.kind, action.label);
    if (!kind) return action.apCost;
    return Math.max(1, action.apCost - dailyLifeEventBonus(kind).apCostDown);
  };

  return (
    <div className="animate-fadeup space-y-4 py-1">
      <ApBar ap={ap} nextRegenMin={nextRegenMin} />

      <ActiveBuffsBar buffs={buffRows} />

      {/* 랭크 특혜 팝업은 카드 밖으로 넘치므로 overflow-hidden 바깥에 둔다 */}
      <div className="relative">
      {here.id === GUILD_LOCATION_ID && <GuildRankPerks rank={guild.rank} fame={guild.fame} />}
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="relative">
          {here.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={here.image}
              alt={here.name}
              className="h-44 w-full object-cover sm:h-60"
            />
          ) : (
            <div className="grid h-44 w-full place-items-center bg-gradient-to-br from-brand-500 to-brand-700 sm:h-60">
              <span className="text-7xl drop-shadow">{here.emoji ?? "📍"}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-6 pb-4 pt-12">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/70">
              현재 위치
              {here.hidden && (
                <span className="rounded bg-violet-500/85 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white">
                  [히든]
                </span>
              )}
            </p>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white drop-shadow">
              {here.emoji && <span>{here.emoji}</span>} {here.name}
            </h1>
          </div>
        </div>
        {here.desc && (
          <p className="whitespace-pre-wrap px-6 py-4 text-[15px] leading-relaxed text-content">
            {here.desc}
          </p>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line px-6 py-3">
            {badges.map((badge) => (
              <span
                key={badge.label}
                className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${badge.tone}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>
      </div>

      {atHome && hasGuestbookStand && (
        <GuestbookCard
          entries={guestbookEntries}
          canWrite={!atMyHome}
          ownerNickname={atMyHome ? user.nickname : (homeOwner?.nickname ?? "친구")}
        />
      )}

      {/* 장소가 바뀌면 통째로 리마운트 — 폴링 상태(batch·after·people)가 이전 맵 것을
          그대로 들고 있으면, 새로 마운트된 WorldChat 이 옛 맵 대사를 다시 채워 넣는다. */}
      <WorldSyncProvider key={here.id}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorldChat
            key={here.id}
            locationName={here.name}
            myUsername={user.username}
            actions={locActions.map((a) => ({
              kind: a.kind,
              label: a.label,
              apCost: displayActionApCost(a),
              statLabel: a.statLabel,
            }))}
          />
        </div>

        <div className="space-y-4">
          {here.name.includes("광장") && (
            <Link
              href="/hall"
              className="flex items-center gap-3 rounded-3xl border border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/60 p-4 shadow-sm transition hover:border-amber-400 hover:shadow"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-200 text-2xl">
                🏛️
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-content">명예의 전당</span>
                <span className="block text-xs text-muted">
                  광장 비석에 새겨진 분야별 랭킹을 봅니다 →
                </span>
              </span>
            </Link>
          )}
          <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
            <h2 className="mb-3 px-1 text-sm font-extrabold text-content">
              🧭 이동 가능 구역
            </h2>
            {destinations.length === 0 && !canEnterHome && !atHome ? (
              <p className="py-3 text-center text-sm text-faint">이동할 수 있는 곳이 없어요.</p>
            ) : (
              <div className="space-y-2">
                {atHome && bellTower && (
                  <form action={leaveHome}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      <span className="text-xl">{bellTower.emoji ?? "🕰️"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-content">
                          종탑 거리로 나가기
                        </span>
                      </span>
                      <span className="ml-auto text-faint2">→</span>
                    </button>
                  </form>
                )}
                {canEnterHome &&
                  ownedHouseOptions.map((option) => (
                    <form key={option.tier} action={enterHome}>
                      <input type="hidden" name="tier" value={option.tier} />
                      <button
                        type="submit"
                        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                      >
                        <span className="text-xl">🏠</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-content">
                            {option.name}
                          </span>
                          <span className="text-[11px] text-faint">본인 집</span>
                        </span>
                        <span className="ml-auto text-faint2">→</span>
                      </button>
                    </form>
                  ))}
                {destinations.map((d) => (
                  <form key={d.id} action={moveTo}>
                    <input type="hidden" name="target" value={d.id} />
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                    >
                      <span className="text-xl">{d.emoji ?? "📍"}</span>
                      <span className="min-w-0">
                        {d.hidden && (
                          <span className="block text-[10px] font-extrabold tracking-wide text-violet-400">
                            [히든]
                          </span>
                        )}
                        <span className="block truncate text-sm font-bold text-content">
                          {d.name}
                        </span>
                      </span>
                      <span className="ml-auto text-faint2">→</span>
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>

          <RiftView />

          <DungeonPanel
            dungeons={dungeonView}
            runsLeft={dungeonRunsLeft}
            weeklyLimit={dungeonWeekly}
            abilities={dungeonAbilities}
          />

          <FishingStatus pending={fishPending} />

          <GatheringStatus pending={gatherPending} />

          <MiningStatus pending={minePending} />

          <WorldServices
            canForge={canForge}
            canGuild={canGuild && !canGuildBackyard}
            canGuildBackyard={canGuildBackyard}
            canMarket={canMarket}
            canStorage={canStorage && !canGuildBackyard}
            canInn={canInn}
            canHousing={canHousing}
            canGacha={here.id === "대상야영지"}
            canBlackMarket={canBlackMarket}
            canAlchemyBookShop={canAlchemyBookShop}
            cooking={cooking}
            alchemy={alchemy}
            blackMarket={blackMarket}
            wanderingMerchant={wanderingMerchant}
            inventoryItems={bagItems}
            lifeStorageItems={lifeStorageItems}
            lifeShop={lifeShop}
            inn={inn}
            housing={housing}
            storage={storage}
            guild={guild}
            craftMinerals={craftMinerals}
            isBlacksmith={isBlacksmithClass(sheet.charClass)}
            craftSmithLevel={life.smithing.level}
            craftAp={ap}
            craftTags={craftTags}
            craftTagSlots={craftTagSlots}
            weeklyIncome={weeklyIncome}
            canStarword={atPlaza}
            canMahjong={atPlaza}
          />

          <FriendsDock
            friends={friendViews}
            requests={friendRequests}
            invites={houseInvites}
            canInvite={housingState.owned.length > 0}
          />

          <BagInventory
            gold={bagGold}
            weight={bagWeight}
            items={bagItems}
            lifeBags={lifeBags}
            skillBooks={skillBookNames}
            tagDict={craftTags}
            detectors={detectorViews}
          />

          <SheetSync />

          <LocationPresence
            key={here.id}
            initial={[
              { username: user.username, nickname: user.nickname, avatar: user.avatar, isMe: true },
              ...others.map((o) => ({
                username: o.user.username,
                nickname: o.user.nickname,
                avatar: o.user.avatar,
                isMe: false,
              })),
            ]}
          />
        </div>
      </div>
      </WorldSyncProvider>

      {isGm && (
        <WorldAdmin locations={adminLocations} openRifts={adminRifts} players={adminPlayers} />
      )}
    </div>
  );
}

function Gate({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl animate-fadeup py-6">
      <div className="rounded-3xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mb-3 text-5xl">{emoji}</div>
        <h1 className="mb-2 text-xl font-extrabold text-content">{title}</h1>
        {children}
      </div>
    </div>
  );
}
