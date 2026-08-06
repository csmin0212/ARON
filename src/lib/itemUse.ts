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

// 한글 뒤에는 \b(단어 경계)가 절대 서지 않는다 — \w가 ASCII만 인정하기 때문.
// 예전엔 여기에 \b가 붙어 있어서 이 패턴이 한 번도 매치되지 않았다(사실상 죽은 분기).
// 경계는 문자열 끝이나 구분자(공백·중점·쉼표·줄바꿈)로 직접 확인한다.
const CRAFT_CATEGORY_BOUNDARY = "(?=$|[\\s·,])";
const CRAFT_CATEGORY_NAMES =
  "격투|단검|장검|양손검|도끼|타격|메이스|창|채찍|카타나|활|방패|몸통|머리|전신|보조|장신구";
const CRAFT_CATEGORY_PATTERN = new RegExp(
  `(?:^|\\n)\\s*Lv\\s*\\d+\\s+(?:${CRAFT_CATEGORY_NAMES})${CRAFT_CATEGORY_BOUNDARY}`,
);

const EQUIPMENT_STAT_PATTERN =
  /(?:명중|공격력|회피|물리\s*방어력|마법\s*방어력|물방|마방|행동|이동력|이동\s*수정|사거리|중량)\s*[+-]\s*\d+/;

const CRAFT_CATEGORY_CAPTURE = new RegExp(
  `(?:^|\\n)\\s*Lv\\s*\\d+\\s+(${CRAFT_CATEGORY_NAMES})${CRAFT_CATEGORY_BOUNDARY}`,
);

function craftedCategorySlot(text: string): InventoryEquipmentSlot | null {
  const match = text.match(CRAFT_CATEGORY_CAPTURE);
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

  // "Lv1 장신구", "Lv3 장검" 같은 카테고리 표기가 가장 확실한 근거라 제일 먼저 본다.
  // 소모품 판정보다 앞이어야 한다 — 장신구 효과문에 흔한 'HP를 회복' 같은 문구가
  // CONSUMABLE_TEXT_PATTERN에 걸려 장비가 아닌 것으로 새는 걸 막는다(성인·재배 세트 등).
  if (CRAFT_CATEGORY_PATTERN.test(text)) return craftedCategorySlot(text);
  if (CONSUMABLE_TEXT_PATTERN.test(text)) return null;
  if (LIFE_EQUIPMENT_NAME_PATTERN.test(name)) return "life";
  if (ACCESSORY_EQUIPMENT_NAME_PATTERN.test(name) && EQUIPMENT_STAT_PATTERN.test(text)) return "accessory";
  const forgeSlot = detectForgeSlot(text);
  if (forgeSlot !== null) return forgeSlot;
  if (!EQUIPMENT_STAT_PATTERN.test(text)) return null;
  return EQUIPMENT_SLOT_PATTERN.test(text) ? slotHintSlot(text) : null;
}

export function isEquipmentLikeInventoryItem(item: SheetInventoryItem): boolean {
  return inventoryEquipmentSlot(item) !== null;
}

// 장비 레벨 — 효과문 첫머리의 "Lv3 장검 · 한손", "Lv1 방어구 · 몸통" 표기에서 읽는다.
// 시트 장비(아이템 탭 설명)와 제작품(effectText) 모두 이 표기를 갖고 있어서,
// 강화 소모량을 플레이어가 직접 고르지 않고 장비에서 바로 뽑아낼 수 있다.
// 표기가 없으면 null — 호출부에서 "레벨을 못 읽었다"고 안내한다.
const EQUIPMENT_LEVEL_PATTERN = /Lv\s*(\d+)/;
export const EQUIPMENT_LEVEL_MAX = 10;

export function equipmentLevelOf(item: Pick<SheetInventoryItem, "name" | "effect">): number | null {
  const match = EQUIPMENT_LEVEL_PATTERN.exec(`${item.name}\n${item.effect ?? ""}`);
  if (!match) return null;
  const level = parseInt(match[1], 10);
  if (!Number.isFinite(level) || level < 1) return null;
  return Math.min(EQUIPMENT_LEVEL_MAX, level);
}
