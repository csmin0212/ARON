import "server-only";

import { prisma } from "@/lib/prisma";
import type { SheetInventory } from "@/lib/googleSheets";

export type LanternEmberKey = "fire" | "water" | "earth" | "wind" | "light" | "dark";

export type LanternEmberBuff = {
  key: LanternEmberKey;
  itemId: string;
  itemName: string;
  title: string;
  statLine: string;
  flavor: string;
  icon: string;
};

export const LANTERN_PLAZA_ID = "등불광장";
export const LANTERN_EMBER_COMMAND = "불씨놓기";

const EVENT_PREFIX = "lantern_ember:";

export const LANTERN_EMBERS: LanternEmberBuff[] = [
  {
    key: "fire",
    itemId: "화의불씨",
    itemName: "화의 불씨",
    title: "첫 등불, 타오르는 맹세",
    statLine: "공격력 +5",
    flavor:
      "붉은 불씨가 등불의 심지에 스며든다. 광장 위로 뜨거운 숨결이 번지고, 모든 모험가의 손끝에 싸움의 열이 깃든다.",
    icon: "🔥",
  },
  {
    key: "water",
    itemId: "수의불씨",
    itemName: "수의 불씨",
    title: "둘째 등불, 맑은 생명의 잔",
    statLine: "최대 HP +5, 최대 MP +5",
    flavor:
      "푸른 불꽃이 물결처럼 퍼진다. 오래된 등불은 잔잔한 빛을 흘리고, 모든 모험가의 생명과 마력이 한 모금 깊어진다.",
    icon: "💧",
  },
  {
    key: "earth",
    itemId: "지의불씨",
    itemName: "지의 불씨",
    title: "셋째 등불, 흔들리지 않는 초석",
    statLine: "물리 방어력 +3, 마법 방어력 +3",
    flavor:
      "갈색 불꽃이 돌의 무늬를 그리며 내려앉는다. 대지는 조용히 등을 받치고, 모든 모험가의 갑옷 아래에 굳건한 무게가 생긴다.",
    icon: "🪨",
  },
  {
    key: "wind",
    itemId: "풍의불씨",
    itemName: "풍의 불씨",
    title: "넷째 등불, 길을 여는 숨결",
    statLine: "행동치 +3",
    flavor:
      "연둣빛 불꽃이 바람을 타고 등불 속을 돈다. 광장의 공기가 가벼워지고, 모든 모험가의 첫걸음이 조금 더 빠르게 뻗는다.",
    icon: "🍃",
  },
  {
    key: "light",
    itemId: "광의불씨",
    itemName: "광의 불씨",
    title: "다섯째 등불, 되돌리는 별빛",
    statLine: "아이템·스킬 회복량 +3, 경감치 +3",
    flavor:
      "새하얀 불꽃이 별가루처럼 흩어진다. 상처를 닫는 빛과 막아서는 빛이 함께 깨어나, 모든 모험가의 기도가 한층 선명해진다.",
    icon: "✨",
  },
  {
    key: "dark",
    itemId: "암의불씨",
    itemName: "암의 불씨",
    title: "여섯째 등불, 그림자와 맺은 약속",
    statLine: "명중 판정 +2, 회피 판정 +1",
    flavor:
      "검은 불꽃이 빛을 삼키지 않고 그 가장자리를 또렷하게 만든다. 모든 모험가는 어둠의 박자를 읽고, 놓치지 않으며 비켜선다.",
    icon: "🌑",
  },
];

export function normalizeLanternKeyword(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function lanternEmberEventId(key: LanternEmberKey): string {
  return `${EVENT_PREFIX}${key}`;
}

export function emberAliases(ember: LanternEmberBuff): string[] {
  return [ember.itemId, ember.itemName];
}

export function activeEmberKeysFromClaims(claims: { eventId: string }[]): LanternEmberKey[] {
  const active = new Set(
    claims
      .map((claim) => claim.eventId)
      .filter((eventId) => eventId.startsWith(EVENT_PREFIX))
      .map((eventId) => eventId.slice(EVENT_PREFIX.length)),
  );
  return LANTERN_EMBERS.filter((ember) => active.has(ember.key)).map((ember) => ember.key);
}

export async function loadActiveLanternEmbers(): Promise<LanternEmberBuff[]> {
  const claims = await prisma.worldEventClaim.findMany({
    where: { eventId: { in: LANTERN_EMBERS.map((ember) => lanternEmberEventId(ember.key)) } },
    select: { eventId: true },
  });
  const active = new Set(activeEmberKeysFromClaims(claims));
  return LANTERN_EMBERS.filter((ember) => active.has(ember.key));
}

export function findFirstOwnedEmber(
  inv: SheetInventory,
  active: LanternEmberKey[],
): LanternEmberBuff | null {
  const activeSet = new Set(active);
  for (const ember of LANTERN_EMBERS) {
    if (activeSet.has(ember.key)) continue;
    const aliases = new Set(emberAliases(ember));
    const qty = inv.items
      .filter((item) => aliases.has(item.name.trim()))
      .reduce((sum, item) => sum + Math.max(0, item.qty), 0);
    if (qty > 0) return ember;
  }
  return null;
}

export function consumeEmberFromInventory(
  inv: SheetInventory,
  ember: LanternEmberBuff,
): SheetInventory {
  const aliases = new Set(emberAliases(ember));
  let remaining = 1;
  for (const item of inv.items) {
    if (remaining <= 0 || !aliases.has(item.name.trim())) continue;
    const used = Math.min(Math.max(0, item.qty), remaining);
    item.qty -= used;
    remaining -= used;
  }
  inv.items = inv.items.filter((item) => item.qty > 0);
  return inv;
}

export function lanternHpBonus(active: LanternEmberBuff[]): number {
  return active.some((ember) => ember.key === "water") ? 5 : 0;
}

export function lanternMpBonus(active: LanternEmberBuff[]): number {
  return active.some((ember) => ember.key === "water") ? 5 : 0;
}

export function lanternRecoveryBonus(active: LanternEmberBuff[]): number {
  return active.some((ember) => ember.key === "light") ? 3 : 0;
}

export function lanternReductionBonus(active: LanternEmberBuff[]): number {
  return active.some((ember) => ember.key === "light") ? 3 : 0;
}
