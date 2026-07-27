import type { SheetInventoryItem } from "@/lib/googleSheets";
import { detectForgeSlot, type ForgeSlot } from "@/lib/forge";

export type InventoryEquipmentSlot = ForgeSlot | "accessory" | "life";

const CONSUMABLE_TEXT_PATTERN =
  /(?:소모품|포션|물약|요리|음식|해독제|양피지|랜덤박스|든\s*병|HP|MP|피로도|스태미나|AP|페이트|회복|던전\s*(?:클리어|도전)?\s*횟수)/;

const LIFE_EQUIPMENT_NAME_PATTERN =
  /(?:낚싯대|낚시대|곡괭이|채집\s*도구|낚시꾼\s*가방|약초꾼\s*가방|광부\s*가방|\d+\s*칸\s*가방)/;

const ACCESSORY_EQUIPMENT_NAME_PATTERN =
  /(?:장신구|액세서리|악세서리|반지|목걸이|귀걸이|팔찌|벨트|브로치|아뮬렛|부적)/;

const EQUIPMENT_SLOT_PATTERN =
  /(?:^|\s|[·,])(?:한손|양손|머리|몸통|보조|장신구|무기|방어구|갑옷|방패)(?=$|\s|[·,])/;

const CRAFT_CATEGORY_PATTERN =
  /(?:^|\n)\s*Lv\s*\d+\s+(?:단검|장검|양손검|도끼|메이스|창|채찍|카타나|활|방패|몸통|머리|보조|장신구)\b/;

const EQUIPMENT_STAT_PATTERN =
  /(?:명중|공격력|회피|물리\s*방어력|마법\s*방어력|물방|마방|행동|이동력|이동\s*수정|사거리|중량)\s*[+-]\s*\d+/;

function craftedCategorySlot(text: string): InventoryEquipmentSlot | null {
  const match = text.match(
    /(?:^|\n)\s*Lv\s*\d+\s+(단검|장검|양손검|도끼|메이스|창|채찍|카타나|활|방패|몸통|머리|보조|장신구)\b/,
  );
  if (!match) return null;
  const category = match[1];
  if (category === "장신구") return "accessory";
  if (category === "방패" || category === "몸통" || category === "머리" || category === "보조") return "armor";
  return "weapon";
}

function slotHintSlot(text: string): InventoryEquipmentSlot | null {
  if (/(?:^|\s|[·,])장신구(?=$|\s|[·,])/.test(text)) return "accessory";
  if (/(?:^|\s|[·,])(?:머리|몸통|보조|방어구|갑옷|방패)(?=$|\s|[·,])/.test(text)) return "armor";
  if (/(?:^|\s|[·,])(?:한손|양손|무기)(?=$|\s|[·,])/.test(text)) return "weapon";
  return null;
}

export function inventoryEquipmentSlot(item: SheetInventoryItem): InventoryEquipmentSlot | null {
  const name = item.name.trim();
  const effect = item.effect ?? "";
  const text = `${name}\n${effect}`;

  if (CONSUMABLE_TEXT_PATTERN.test(text)) return null;
  if (LIFE_EQUIPMENT_NAME_PATTERN.test(name)) return "life";
  if (CRAFT_CATEGORY_PATTERN.test(text)) return craftedCategorySlot(text);
  if (ACCESSORY_EQUIPMENT_NAME_PATTERN.test(name) && EQUIPMENT_STAT_PATTERN.test(text)) return "accessory";
  const forgeSlot = detectForgeSlot(text);
  if (forgeSlot !== null) return forgeSlot;
  if (!EQUIPMENT_STAT_PATTERN.test(text)) return null;
  return EQUIPMENT_SLOT_PATTERN.test(text) ? slotHintSlot(text) : null;
}

export function isEquipmentLikeInventoryItem(item: SheetInventoryItem): boolean {
  return inventoryEquipmentSlot(item) !== null;
}
