// GM 시트의 '아이템'·'행동' 탭 파서 + 드랍테이블 처리
//
// [아이템 탭]  ID | 이름 | 분류 | 구매가 | 판매가 | 설명
// [행동 탭]    장소ID | 행동 | 라벨 | AP | 판정 | 드랍 | 실패문구
//   판정: "재주:9"  (한글 능력치 라벨 : 목표치) — 비우면 자동 성공
//   드랍: "동굴송어:50, 검은비늘잉어x2:25, 골드x10:15, 꽝:10"
//         이름[x수량][:가중치] — 가중치 비례 추첨. 특수 이름: 골드xN(골드 획득), 꽝(허탕)

import { MASTER_SHEET_ID, parseCsv } from "./charsheet";
import { WORLD_SHEET_ID } from "./world";
import { lifeSkillKindOf } from "./lifeSkillData";

export const ITEMS_TAB = process.env.ITEMS_TAB_NAME || "아이템";
export const ACTIONS_TAB = process.env.ACTIONS_TAB_NAME || "행동";
export const DUNGEON_TAB = process.env.DUNGEON_TAB_NAME || "던전";
export const ACHIEVEMENTS_TAB = process.env.ACHIEVEMENTS_TAB_NAME || "업적";
export const EVENTS_TAB = process.env.EVENTS_TAB_NAME || "이벤트";
export const RECIPES_TAB = process.env.RECIPES_TAB_NAME || "레시피";
export const POTIONS_TAB = process.env.POTIONS_TAB_NAME || "포션";
export const FISH_TAB = process.env.FISH_TAB_NAME || "물고기";
export const GATHER_TAB = process.env.GATHER_TAB_NAME || "채집";
export const MINERAL_TAB = process.env.MINERAL_TAB_NAME || "광물";
export const CRAFT_TAGS_TAB = process.env.CRAFT_TAGS_TAB_NAME || "제작특성";
export const SKILLS_TAB = process.env.SKILLS_TAB_NAME || "스킬";
export const COMBAT_SKILLS_TAB = process.env.COMBAT_SKILLS_TAB_NAME || "전투스킬";

export type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  weight: number | null;
  desc: string | null;
  craftEffect: string | null; // 장비 제작 마이너 재료 효과 (드롭품 등)
};

export type DropEntry = { item: string; qty: number; gold: number; weight: number };
export type IngredientEntry = { name: string; qty: number };

export type ActionRow = {
  locationId: string;
  kind: string;
  label: string | null;
  apCost: number;
  statLabel: string | null;
  dc: number | null;
  drops: DropEntry[];
  failText: string | null;
};

export type DungeonRow = {
  id: string;
  name: string;
  locationId: string;
  dc: number;
  exp: number; // 최소
  expMax: number; // 최대 (exp보다 크면 범위 랜덤)
  drops: DropEntry[]; // 확정 보상 (전부 지급)
  rollDrops: DropEntry[]; // 확률 보상 (가중치로 하나 추첨)
  floor: number;
};

export type AchievementRow = {
  id: string;
  category: string;
  name: string;
  desc: string | null;
  condType: string;
  condValue: string | null;
  rewardTitle: string | null;
  rewardFame: number;
  badge: string | null;
  secret: boolean; // 공개=HIDDEN
};

export type EventRow = {
  id: string;
  locationId: string;
  type: string;
  name: string;
  message: string | null;
  rewards: DropEntry[];
  publicMessage: string | null;
  active: boolean;
};

export type RecipeRow = {
  id: string;
  name: string;
  category: string;
  rank: string;
  facility: string;
  ingredients: IngredientEntry[];
  resultName: string;
  resultQty: number;
  effect: string | null;
  duration: string | null;
  skillExp: number;
  tags: string | null;
  sellPrice: number;
  weight: number;
  isPublic: boolean;
};

// 연금술 포션 — 레시피 공통 필드 + 타이머(최적시간·오차·완벽효과)
export type PotionRow = RecipeRow & {
  bestMinutes: number;
  tolerance: number;
  perfectEffect: string | null;
  adeptPerfectEffect: string | null;
  masterPerfectEffect: string | null;
};

export type SkillRow = {
  id: string;
  name: string;
  category: string;
  kind: string;
  type: string | null;
  rarity: string | null;
  desc: string | null;
  effectKey: string | null;
  effectValue: string | null;
  sourceItem: string | null;
  isPublic: boolean;
  enabled: boolean;
};

export type CombatSkillRow = {
  id: string;
  name: string;
  job: string | null;
  category: string | null;
  subCategory: string | null;
  sl: string | null;
  slMax: string | null;
  timing: string | null;
  range: string | null;
  check: string | null;
  target: string | null;
  cost: string | null;
  condition: string | null;
  effect: string | null;
  critical: string | null;
  sourceItem: string | null;
};

export const ABILITY_LABELS_KO = ["근력", "재주", "민첩", "지력", "감지", "정신", "행운"];

// ── 공용 ──
// 헤더 셀 한 칸에서 별칭으로 매칭해볼 후보들을 만든다.
// 셀에 줄바꿈+예시("확률보상(추첨)\n다이아몬드:5,…")가 섞여 있거나, 끝에 괄호 주석,
// 내부 띄어쓰기("추가 분류")가 있어도 첫 줄·괄호 제거·공백 제거판까지 모두 시도.
function headerKeyCandidates(raw: string): string[] {
  const firstLine = raw.split(/[\r\n]/)[0].trim();
  // 헤더 뒤에 붙은 장식 주석 제거: (), （）, 《》, 〈〉, 【】, [], <>
  // 예: "효과 《포르테》" → "효과"
  const noParen = firstLine.replace(/\s*[(（《〈【[<].*?[)）》〉】\]>]\s*$/, "").trim();
  return [
    raw.trim(),
    firstLine,
    noParen,
    firstLine.replace(/\s+/g, ""),
    noParen.replace(/\s+/g, ""),
  ].filter(Boolean);
}

function findHeader(
  g: string[][],
  required: string[],
  aliases: Record<string, string>,
): { row: number; col: Record<string, number> } | null {
  for (let r = 0; r < Math.min(g.length, 10); r++) {
    const cells = (g[r] || []).map((v) => (v ?? "").trim());
    const candsPerCell = cells.map(headerKeyCandidates);
    if (required.every((req) => candsPerCell.some((cands) => cands.includes(req)))) {
      const col: Record<string, number> = {};
      candsPerCell.forEach((cands, c) => {
        for (const cand of cands) {
          const key = aliases[cand];
          if (key) {
            if (col[key] == null) col[key] = c;
            break;
          }
        }
      });
      return { row: r, col };
    }
  }
  return null;
}

const at = (g: string[][], r: number, c: number | undefined) =>
  c == null ? "" : ((g[r]?.[c] ?? "") + "").trim();

const num = (v: string): number | null => {
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
};

async function fetchTab(sheetId: string, tab: string): Promise<string[][] | null> {
  // headers=1 필수 — headers=0 이면 gviz 가 숫자만 있는 컬럼을 number 타입으로 판정해
  // 문자열인 헤더 셀(예: '중량')을 빈 값으로 날려버림 → 컬럼 매핑 실패
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;
  const res = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  if (
    /google\.visualization\.Query|"status":"error"/.test(text) ||
    /^\s*<(!doctype|html)/i.test(text) ||
    text.trim() === ""
  )
    return null;
  return parseCsv(text);
}

// ── 아이템 탭 ──
export function parseItemsGrid(g: string[][]): ItemRow[] {
  // '이름'+'분류' 동시 요구 — 탭이 없을 때 구글이 다른 탭(맵 등)을 대신 반환해도 오인하지 않도록
  const h = findHeader(g, ["이름", "분류"], {
    ID: "id",
    id: "id",
    이름: "name",
    분류: "category",
    구매가: "buyPrice",
    판매가: "sellPrice",
    중량: "weight",
    무게: "weight",
    제작효과: "craftEffect",
    "제작 효과": "craftEffect",
    설명: "desc",
  });
  if (!h) throw new Error("아이템 탭이 없거나 헤더(이름/분류)가 없어요.");

  const rows: ItemRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    if (!name) continue;
    const id = at(g, r, h.col.id) || name; // ID 비우면 이름이 ID
    if (/[,，]/.test(id)) throw new Error(`아이템 ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) throw new Error(`아이템 ID '${id}' 가 중복됐어요.`);
    seen.add(id);
    rows.push({
      id,
      name,
      category: at(g, r, h.col.category) || null,
      buyPrice: num(at(g, r, h.col.buyPrice)),
      sellPrice: num(at(g, r, h.col.sellPrice)),
      weight: num(at(g, r, h.col.weight)),
      craftEffect: at(g, r, h.col.craftEffect) || null,
      desc: at(g, r, h.col.desc) || null,
    });
  }
  if (rows.length === 0) throw new Error("아이템 탭에 아이템이 없어요.");
  return rows;
}

// ── 드랍테이블 ──
export function parseDrops(spec: string): DropEntry[] {
  const out: DropEntry[] = [];
  for (const raw of spec.split(/[,，]/)) {
    const part = raw.trim();
    if (!part) continue;
    // 이름[x수량][:가중치]
    const m = part.match(/^(.+?)(?:[xX×](\d+))?(?::(\d+))?$/);
    if (!m) throw new Error(`드랍 표기 '${part}' 를 해석할 수 없어요.`);
    const name = m[1].trim();
    const qty = m[2] ? parseInt(m[2], 10) : 1;
    const weight = m[3] ? parseInt(m[3], 10) : 1;
    if (name === "골드") out.push({ item: "골드", qty: 0, gold: qty, weight });
    else out.push({ item: name, qty, gold: 0, weight });
  }
  if (out.length === 0) throw new Error("드랍테이블이 비어 있어요.");
  return out;
}

export function parseIngredients(spec: string): IngredientEntry[] {
  const out: IngredientEntry[] = [];
  for (const raw of spec.split(/[,，]/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(.+?)(?:[xX×](\d+))?$/);
    if (!m) throw new Error(`재료 표기 '${part}' 를 해석할 수 없어요.`);
    const name = m[1].trim();
    const qty = m[2] ? parseInt(m[2], 10) : 1;
    const existing = out.find((item) => item.name === name);
    if (existing) existing.qty += qty;
    else out.push({ name, qty });
  }
  if (out.length === 0) throw new Error("재료 목록이 비어 있어요.");
  return out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

function parseOptionalIngredients(spec: string): IngredientEntry[] {
  return spec.trim() ? parseIngredients(spec) : [];
}

function truthySheetFlag(raw: string): boolean {
  return /^(y|yes|true|1|공개|가능|중복|o|○|⭕)$/i.test(raw.replace(/\s+/g, ""));
}

function withAlchemyOptionMetaTags(
  tags: string | null,
  repeatableRaw: string,
  repeatPointStep: number,
): string | null {
  const parts = (tags ?? "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (truthySheetFlag(repeatableRaw) && !parts.includes("중복가능")) parts.push("중복가능");
  if (repeatPointStep > 0 && !parts.some((tag) => /^중복증가\s*:/.test(tag))) {
    parts.push(`중복증가:${repeatPointStep}`);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

// margin(판정 총합 − 목표치, 성공 시 0 이상)이 있으면 꽝 "확률"을 1점당 1%p씩 낮춘다.
// 꽝 확률은 30% 아래로 내리지 않고(원래 30% 이하면 그대로), 빠진 만큼은 나머지
// 드랍에 기존 비율대로 배분된다. 결과 텍스트에는 절대 노출하지 않는다.
export function pickDrop(drops: DropEntry[], margin = 0): DropEntry {
  let pool = drops;
  if (margin > 0) {
    const weightOf = (d: DropEntry) => Math.max(1, d.weight);
    const totalW = drops.reduce((s, d) => s + weightOf(d), 0);
    const missW = drops.filter((d) => d.item === "꽝").reduce((s, d) => s + weightOf(d), 0);
    const otherW = totalW - missW;
    if (missW > 0 && otherW > 0) {
      const basePct = (missW / totalW) * 100;
      const targetPct = Math.min(basePct, Math.max(30, basePct - margin));
      if (targetPct < basePct) {
        // 꽝 확률이 정확히 targetPct 가 되도록 꽝 가중치만 재계산 (나머지는 원래 비율 유지)
        const t = targetPct / 100;
        const scale = (otherW * t) / (1 - t) / missW;
        pool = drops.map((d) =>
          d.item === "꽝" ? { ...d, weight: weightOf(d) * scale } : d,
        );
      }
    }
  }
  const total = pool.reduce((s, d) => s + Math.max(1, d.weight), 0);
  let roll = Math.random() * total;
  for (const d of pool) {
    roll -= Math.max(1, d.weight);
    if (roll <= 0) return d;
  }
  return pool[pool.length - 1];
}

// ── 행동 탭 ──
export function parseActionsGrid(g: string[][], itemIds: Set<string>): ActionRow[] {
  const h = findHeader(g, ["장소ID", "행동"], {
    장소ID: "locationId",
    행동: "kind",
    라벨: "label",
    AP: "apCost",
    ap: "apCost",
    행동치: "apCost",
    피로도: "apCost",
    소모AP: "apCost",
    "소모 AP": "apCost",
    "AP 소모": "apCost",
    판정: "check",
    드랍: "drops",
    실패문구: "failText",
  });
  if (!h) throw new Error("행동 탭이 없거나 헤더(장소ID/행동)가 없어요.");
  if (h.col.apCost == null && h.col.label != null) {
    const inferred = h.col.label + 1;
    const header = (g[h.row]?.[inferred] ?? "").trim();
    if (!header || h.col.check === inferred + 1) h.col.apCost = inferred;
  }

  const rows: ActionRow[] = [];
  for (let r = h.row + 1; r < g.length; r++) {
    const locationId = at(g, r, h.col.locationId);
    const kind = at(g, r, h.col.kind);
    if (!locationId || !kind) continue;

    // 판정 "재주:9"
    let statLabel: string | null = null;
    let dc: number | null = null;
    const check = at(g, r, h.col.check);
    if (check) {
      const cm = check.match(/^(.+?)\s*[:：]\s*(\d+)$/);
      if (!cm || !ABILITY_LABELS_KO.includes(cm[1].trim()))
        throw new Error(
          `행동(${locationId}/${kind})의 판정 '${check}' 형식이 잘못됐어요. 예: 재주:9`,
        );
      statLabel = cm[1].trim();
      dc = parseInt(cm[2], 10);
    }

    // 낚시·채집은 풀을 맵 탭(채집/낚시 컬럼)이 결정하므로 드랍 칸이 비어도 됨
    const isLifeSkill = lifeSkillKindOf(kind, at(g, r, h.col.label) || null) != null;
    const dropsSpec = at(g, r, h.col.drops);
    if (!dropsSpec && !isLifeSkill)
      throw new Error(`행동(${locationId}/${kind})에 드랍이 비어 있어요.`);
    const drops = dropsSpec ? parseDrops(dropsSpec) : [];
    for (const d of drops) {
      if (d.item !== "꽝" && d.item !== "골드" && !itemIds.has(d.item))
        throw new Error(
          `행동(${locationId}/${kind}) 드랍의 '${d.item}' 이 아이템 탭에 없어요.`,
        );
    }

    rows.push({
      locationId,
      kind,
      label: at(g, r, h.col.label) || null,
      apCost: num(at(g, r, h.col.apCost)) ?? 1,
      statLabel,
      dc,
      drops,
      failText: at(g, r, h.col.failText) || null,
    });
  }
  if (rows.length === 0) throw new Error("행동 탭에 행동이 없어요.");
  return rows;
}

// ── 던전 탭 ──  던전ID | 이름 | 장소 | 달성치 | 경험점 | 보상 | 층
export function parseDungeonsGrid(g: string[][], itemIds: Set<string>): DungeonRow[] {
  const h = findHeader(g, ["이름", "장소"], {
    던전ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    장소: "locationId",
    달성치: "dc",
    경험점: "exp",
    보상: "drops",
    확정보상: "drops",
    확률보상: "rollDrops",
    층: "floor",
  });
  if (!h) throw new Error("던전 탭이 없거나 헤더(이름/장소)가 없어요.");

  const rows: DungeonRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    const locationId = at(g, r, h.col.locationId);
    if (!name || !locationId) continue;
    const id = at(g, r, h.col.id) || name;
    if (seen.has(id)) throw new Error(`던전 ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const dropsSpec = at(g, r, h.col.drops);
    const drops = dropsSpec ? parseDrops(dropsSpec) : [];
    const rollSpec = at(g, r, h.col.rollDrops);
    const rollDrops = rollSpec ? parseDrops(rollSpec) : [];
    for (const d of [...drops, ...rollDrops]) {
      if (d.item !== "꽝" && d.item !== "골드" && !itemIds.has(d.item))
        throw new Error(`던전 '${id}' 보상의 '${d.item}' 이 아이템 탭에 없어요.`);
    }

    const expRaw = at(g, r, h.col.exp);
    const range = expRaw.match(/^(\d+)\s*[~\-]\s*(\d+)$/);
    let exp = num(expRaw) ?? 0;
    let expMax = exp;
    if (range) {
      exp = parseInt(range[1], 10);
      expMax = parseInt(range[2], 10);
      if (expMax < exp) [exp, expMax] = [expMax, exp];
    }

    rows.push({
      id,
      name,
      locationId,
      dc: num(at(g, r, h.col.dc)) ?? 0,
      exp,
      expMax,
      drops,
      rollDrops,
      floor: num(at(g, r, h.col.floor)) ?? 1,
    });
  }
  return rows;
}

// ── 업적 탭 ──  업적ID | 분류 | 이름 | 설명 | 조건타입 | 조건값 | 보상칭호 | 보상명성 | 배지 | 공개
export function parseAchievementsGrid(g: string[][]): AchievementRow[] {
  const h = findHeader(g, ["이름", "조건타입"], {
    업적ID: "id",
    ID: "id",
    id: "id",
    분류: "category",
    이름: "name",
    설명: "desc",
    조건타입: "condType",
    조건: "condType",
    판정: "condType",
    조건값: "condValue",
    "조건 값": "condValue",
    조건수치: "condValue",
    조건치: "condValue",
    값: "condValue",
    목표: "condValue",
    대상: "condValue",
    보상칭호: "rewardTitle",
    보상명성: "rewardFame",
    배지: "badge",
    공개: "isPublic",
    공개유무: "isPublic",
    "공개 유무": "isPublic",
    공개여부: "isPublic",
    "공개 여부": "isPublic",
  });
  if (!h) throw new Error("업적 탭이 없거나 헤더(이름/조건타입)가 없어요.");

  // 헤더 칸이 비어 있어도 문서화된 컬럼 순서로 복원 —
  // 조건값은 조건타입 오른쪽, 보상명성은 보상칭호 오른쪽, 공개는 배지 오른쪽.
  // (헤더 텍스트가 지워지면 업적이 전부 비공개·조건값 없음으로 동기화되는 사고 방지)
  if (h.col.condValue == null && h.col.condType != null) h.col.condValue = h.col.condType + 1;
  if (h.col.rewardFame == null && h.col.rewardTitle != null) h.col.rewardFame = h.col.rewardTitle + 1;
  if (h.col.isPublic == null && h.col.badge != null) h.col.isPublic = h.col.badge + 1;

  const rows: AchievementRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    const condType = at(g, r, h.col.condType).replace(/\s+/g, "");
    if (!name || !condType) continue;
    const id = at(g, r, h.col.id) || name;
    if (seen.has(id)) throw new Error(`업적 ID '${id}' 가 중복됐어요.`);
    seen.add(id);
    const publicRaw = at(g, r, h.col.isPublic);
    const isPublic = /^(true|yes|y|1|공개)$/i.test(publicRaw);
    rows.push({
      id,
      category: at(g, r, h.col.category) || "기타",
      name,
      desc: at(g, r, h.col.desc) || null,
      condType,
      condValue: at(g, r, h.col.condValue) || null,
      rewardTitle: at(g, r, h.col.rewardTitle) || null,
      rewardFame: num(at(g, r, h.col.rewardFame)) ?? 0,
      badge: at(g, r, h.col.badge) || null,
      secret: !isPublic,
    });
  }
  if (rows.length === 0) throw new Error("업적 탭에 업적이 없어요.");
  return rows;
}

const yes = (value: string): boolean => /^(y|yes|true|1|공개|사용|활성)$/i.test(value.trim());
const no = (value: string): boolean => /^(n|no|x|false|0|비공개|비활성)$/i.test(value.trim());

// ── 이벤트 탭 ──  이벤트ID | 장소ID | 타입 | 이름 | 문구 | 보상 | 공개문구 | 활성
export function parseEventsGrid(g: string[][], itemIds: Set<string>): EventRow[] {
  const h = findHeader(g, ["이벤트ID", "장소ID"], {
    이벤트ID: "id",
    ID: "id",
    id: "id",
    장소ID: "locationId",
    장소: "locationId",
    타입: "type",
    종류: "type",
    이름: "name",
    제목: "name",
    문구: "message",
    개인문구: "message",
    보상: "rewards",
    공개문구: "publicMessage",
    활성: "active",
    사용: "active",
  });
  if (!h) throw new Error("이벤트 탭이 없거나 헤더(이벤트ID/장소ID)가 없어요.");

  const rows: EventRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const id = at(g, r, h.col.id);
    const locationId = at(g, r, h.col.locationId);
    if (!id || !locationId) continue;
    if (/[,，]/.test(id)) throw new Error(`이벤트ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) throw new Error(`이벤트ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const type = (at(g, r, h.col.type) || "최초방문").replace(/\s+/g, "");
    const name = at(g, r, h.col.name) || id;
    const rewardsSpec = at(g, r, h.col.rewards);
    if (!rewardsSpec) throw new Error(`이벤트 '${id}' 보상이 비어 있어요.`);
    const rewards = parseDrops(rewardsSpec);
    for (const d of rewards) {
      if (d.item !== "꽝" && d.item !== "골드" && !itemIds.has(d.item))
        throw new Error(`이벤트 '${id}' 보상의 '${d.item}' 이 아이템 탭에 없어요.`);
    }

    const activeRaw = at(g, r, h.col.active);
    rows.push({
      id,
      locationId,
      type,
      name,
      message: at(g, r, h.col.message) || null,
      rewards,
      publicMessage: at(g, r, h.col.publicMessage) || null,
      active: activeRaw ? !no(activeRaw) : true,
    });
  }
  return rows;
}

// ── 레시피 탭 ──
// 레시피ID | 이름 | 분류 | 등급 | 필요시설 | 재료 | 결과 | 판매가 | 중량 | 효과 | 지속 | 숙련도 | 태그 | 공개
export function parseRecipesGrid(g: string[][]): RecipeRow[] {
  const h = findHeader(g, ["이름", "재료", "결과"], {
    레시피ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    분류: "category",
    등급: "rank",
    필요시설: "facility",
    시설: "facility",
    재료: "ingredients",
    결과: "result",
    판매가: "sellPrice",
    중량: "weight",
    효과: "effect",
    지속: "duration",
    숙련도: "skillExp",
    태그: "tags",
    공개: "isPublic",
    공개유무: "isPublic",
    "공개 유무": "isPublic",
    공개여부: "isPublic",
    "공개 여부": "isPublic",
  });
  if (!h) throw new Error("레시피 탭이 없거나 헤더(이름/재료/결과)가 없어요.");

  // 헤더 칸이 비어 있어도 현재 시트 배치 기준으로 복원 —
  // 숙련도는 지속 오른쪽, 공개는 태그 오른쪽, 판매가는 그 다음 열.
  // (헤더 텍스트가 지워지면 숙련 0·비공개·판매가 1G 로 동기화되는 사고 방지)
  if (h.col.skillExp == null && h.col.duration != null) h.col.skillExp = h.col.duration + 1;
  if (h.col.isPublic == null && h.col.tags != null) h.col.isPublic = h.col.tags + 1;
  if (h.col.sellPrice == null && h.col.tags != null) h.col.sellPrice = h.col.tags + 2;

  const rows: RecipeRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    const ingredientsSpec = at(g, r, h.col.ingredients);
    const resultSpec = at(g, r, h.col.result);
    if (!name || !ingredientsSpec || !resultSpec) continue;

    const id = at(g, r, h.col.id) || name;
    if (/[,，]/.test(id)) throw new Error(`레시피ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) throw new Error(`레시피ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const result = parseIngredients(resultSpec)[0];
    if (!result) throw new Error(`레시피 '${id}' 결과가 비어 있어요.`);
    const publicRaw = at(g, r, h.col.isPublic);
    rows.push({
      id,
      name,
      category: at(g, r, h.col.category) || "요리",
      rank: at(g, r, h.col.rank) || "R1",
      facility: at(g, r, h.col.facility) || "공용 주방",
      ingredients: parseIngredients(ingredientsSpec),
      resultName: result.name,
      resultQty: result.qty,
      effect: at(g, r, h.col.effect) || null,
      duration: at(g, r, h.col.duration) || null,
      skillExp: num(at(g, r, h.col.skillExp)) ?? 0,
      tags: at(g, r, h.col.tags) || null,
      sellPrice: num(at(g, r, h.col.sellPrice)) ?? 1,
      weight: num(at(g, r, h.col.weight)) ?? 1,
      isPublic: /^(y|yes|true|1|공개)$/i.test(publicRaw),
    });
  }
  if (rows.length === 0) throw new Error("레시피 탭에 레시피가 없어요.");
  return rows;
}

// ── 포션(연금술) 탭 ──
// 새 형식: 옵션ID | 이름 | 분류 | 필요포인트 | 필요재료 | 효과 | 판매가 | 태그 | 공개
// 하위호환: 포션ID | 이름 | 분류 | 등급 | 필요시설 | 재료 | 결과 | 효과 | ...
export function parsePotionsGrid(g: string[][]): PotionRow[] {
  const optionHeader = findHeader(g, ["이름", "포인트"], {
    옵션ID: "id",
    포션ID: "id",
    레시피ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    분류: "category",
    등급: "rank",
    필요시설: "facility",
    시설: "facility",
    필요재료: "ingredients",
    "필요 재료": "ingredients",
    특수재료: "ingredients",
    "특수 재료": "ingredients",
    재료: "ingredients",
    결과: "result",
    필요포인트: "pointCost",
    "필요 포인트": "pointCost",
    포인트: "pointCost",
    연금포인트: "pointCost",
    "연금 포인트": "pointCost",
    판매가: "sellPrice",
    중량: "weight",
    효과: "effect",
    지속: "duration",
    태그: "tags",
    공개: "isPublic",
    중복가능: "repeatable",
    "중복 가능": "repeatable",
    중복: "repeatable",
    중복증가: "repeatPointStep",
    "중복 증가": "repeatPointStep",
    중복시증가: "repeatPointStep",
    "중복시 증가": "repeatPointStep",
    중복포인트증가: "repeatPointStep",
    "중복 포인트 증가": "repeatPointStep",
  });
  if (optionHeader) {
    const rows: PotionRow[] = [];
    const seen = new Set<string>();
    for (let r = optionHeader.row + 1; r < g.length; r++) {
      const name = at(g, r, optionHeader.col.name);
      if (!name) continue;
      const pointCost = Math.max(0, num(at(g, r, optionHeader.col.pointCost)) ?? 0);
      const id = at(g, r, optionHeader.col.id) || name;
      if (/[,，]/.test(id)) throw new Error(`포션 옵션ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
      if (seen.has(id)) throw new Error(`포션 옵션ID '${id}' 가 중복됐어요.`);
      seen.add(id);
      const publicRaw = at(g, r, optionHeader.col.isPublic);
      const result = parseOptionalIngredients(at(g, r, optionHeader.col.result))[0];
      const tags = withAlchemyOptionMetaTags(
        at(g, r, optionHeader.col.tags) || null,
        at(g, r, optionHeader.col.repeatable),
        Math.max(0, num(at(g, r, optionHeader.col.repeatPointStep)) ?? 0),
      );
      rows.push({
        id,
        name,
        category: at(g, r, optionHeader.col.category) || "일반옵션",
        rank: at(g, r, optionHeader.col.rank) || "R1",
        facility: at(g, r, optionHeader.col.facility) || "연금술 공방",
        ingredients: parseOptionalIngredients(at(g, r, optionHeader.col.ingredients)),
        resultName: result?.name ?? "조제 포션",
        resultQty: result?.qty ?? 1,
        effect: at(g, r, optionHeader.col.effect) || null,
        duration: at(g, r, optionHeader.col.duration) || null,
        skillExp: pointCost,
        tags,
        sellPrice: num(at(g, r, optionHeader.col.sellPrice)) ?? 0,
        weight: num(at(g, r, optionHeader.col.weight)) ?? 1,
        isPublic: /^(y|yes|true|1|공개)$/i.test(publicRaw),
        bestMinutes: 5,
        tolerance: 0,
        perfectEffect: null,
        adeptPerfectEffect: null,
        masterPerfectEffect: null,
      });
    }
    if (rows.length === 0) throw new Error("포션 탭에 옵션이 없어요.");
    return rows;
  }

  const h = findHeader(g, ["이름", "재료", "최적시간"], {
    포션ID: "id",
    레시피ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    분류: "category",
    등급: "rank",
    필요시설: "facility",
    시설: "facility",
    재료: "ingredients",
    결과: "result",
    판매가: "sellPrice",
    중량: "weight",
    효과: "effect",
    지속: "duration",
    숙련도: "skillExp",
    태그: "tags",
    공개: "isPublic",
    최적시간: "bestMinutes",
    오차: "tolerance",
    완벽효과: "perfectEffect",
    "완벽 효과": "perfectEffect",
    숙련완벽효과: "adeptPerfectEffect",
    "숙련 완벽효과": "adeptPerfectEffect",
    "숙련 완벽 효과": "adeptPerfectEffect",
    장인완벽효과: "masterPerfectEffect",
    "장인 완벽효과": "masterPerfectEffect",
    "장인 완벽 효과": "masterPerfectEffect",
  });
  if (!h) throw new Error("포션 탭이 없거나 헤더(이름/재료/최적시간)가 없어요.");

  const rows: PotionRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    const ingredientsSpec = at(g, r, h.col.ingredients);
    const resultSpec = at(g, r, h.col.result);
    if (!name || !ingredientsSpec || !resultSpec) continue;

    const id = at(g, r, h.col.id) || name;
    if (/[,，]/.test(id)) throw new Error(`포션ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) throw new Error(`포션ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const result = parseIngredients(resultSpec)[0];
    if (!result) throw new Error(`포션 '${id}' 결과가 비어 있어요.`);
    const publicRaw = at(g, r, h.col.isPublic);
    rows.push({
      id,
      name,
      category: at(g, r, h.col.category) || "포션",
      rank: at(g, r, h.col.rank) || "R1",
      facility: at(g, r, h.col.facility) || "연금술 공방",
      ingredients: parseIngredients(ingredientsSpec),
      resultName: result.name,
      resultQty: result.qty,
      effect: at(g, r, h.col.effect) || null,
      duration: at(g, r, h.col.duration) || null,
      skillExp: num(at(g, r, h.col.skillExp)) ?? 0,
      tags: at(g, r, h.col.tags) || null,
      sellPrice: num(at(g, r, h.col.sellPrice)) ?? 1,
      weight: num(at(g, r, h.col.weight)) ?? 1,
      isPublic: /^(y|yes|true|1|공개)$/i.test(publicRaw),
      bestMinutes: Math.max(1, num(at(g, r, h.col.bestMinutes)) ?? 5),
      tolerance: Math.max(0, num(at(g, r, h.col.tolerance)) ?? 0),
      perfectEffect: at(g, r, h.col.perfectEffect) || null,
      adeptPerfectEffect: at(g, r, h.col.adeptPerfectEffect) || null,
      masterPerfectEffect: at(g, r, h.col.masterPerfectEffect) || null,
    });
  }
  if (rows.length === 0) throw new Error("포션 탭에 포션이 없어요.");
  return rows;
}

// ── 스킬 탭 ──
// 스킬ID | 이름 | 계열 | 직업/종류 | 타입 | 등급 | 설명 | 효과키 | 효과값 | 소모품 | 공개유무 | 활성
export function parseSkillsGrid(g: string[][]): SkillRow[] {
  const h = findHeader(g, ["이름", "계열"], {
    스킬ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    계열: "category",
    분류: "category",
    "직업/종류": "kind",
    직업: "kind",
    종류: "kind",
    대상: "kind",
    타입: "type",
    유형: "type",
    등급: "rarity",
    희귀도: "rarity",
    설명: "desc",
    효과키: "effectKey",
    "효과 키": "effectKey",
    효과값: "effectValue",
    "효과 값": "effectValue",
    값: "effectValue",
    소모품: "sourceItem",
    출처아이템: "sourceItem",
    공개: "isPublic",
    공개유무: "isPublic",
    "공개 유무": "isPublic",
    공개여부: "isPublic",
    "공개 여부": "isPublic",
    활성: "enabled",
    사용: "enabled",
  });
  if (!h) throw new Error("스킬 탭이 없거나 헤더(이름/계열)가 없어요.");

  // 헤더 칸이 비어 있어도 문서화된 컬럼 순서로 복원 — '효과값'은 '효과키' 바로 오른쪽 열.
  // (헤더 텍스트가 지워지면 효과값이 전부 null 로 동기화되는 사고 방지)
  if (h.col.effectValue == null && h.col.effectKey != null) h.col.effectValue = h.col.effectKey + 1;

  const rows: SkillRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    const category = at(g, r, h.col.category);
    if (!name || !category) continue;

    const id = at(g, r, h.col.id) || name;
    if (/[,，]/.test(id)) throw new Error(`스킬ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) throw new Error(`스킬ID '${id}' 가 중복됐어요.`);
    seen.add(id);

    const publicRaw = at(g, r, h.col.isPublic);
    const enabledRaw = at(g, r, h.col.enabled);
    const kind = at(g, r, h.col.kind) || "공용";
    let effectKey = at(g, r, h.col.effectKey) || null;
    // 채광엔 피로도 감소(ap_cost_down) 특성이 없다 — 채광의 ap_cost_down 은 항상 '일석이조'.
    // 시트에 ap_cost_down 으로 적어도 동기화 시 광물 2개 드랍(double_drop_pct)으로 자동 교정.
    if (kind === "채광" && effectKey === "ap_cost_down") effectKey = "double_drop_pct";
    rows.push({
      id,
      name,
      category,
      kind,
      type: at(g, r, h.col.type) || null,
      rarity: at(g, r, h.col.rarity) || null,
      desc: at(g, r, h.col.desc) || null,
      effectKey,
      effectValue: at(g, r, h.col.effectValue) || null,
      sourceItem: at(g, r, h.col.sourceItem) || null,
      isPublic: publicRaw ? yes(publicRaw) : true,
      enabled: enabledRaw ? !no(enabledRaw) : true,
    });
  }
  if (rows.length === 0) throw new Error("스킬 탭에 스킬이 없어요.");
  return rows;
}

// ── 전투스킬 탭 ──
// 스킬ID | 직업 | 이름 | 분류 | 추가분류 | SL | SL상한 | 타이밍 | 사거리 | 판정 | 대상 | 코스트 | 사용조건 | 효과 | 크리티컬 | 출처아이템
// 직업: 클래스 전용 제한(캐릭터 클래스와 대조). 분류: 마술/주가 등(시트에 기입).
// 출처아이템 칸에 아이템 ID 를 적으면, 그 스킬북을 사용했을 때 이 스킬을 시트에 기입한다.
export function parseCombatSkillsGrid(g: string[][]): CombatSkillRow[] {
  const h = findHeader(g, ["이름", "효과"], {
    스킬ID: "id",
    ID: "id",
    id: "id",
    이름: "name",
    스킬이름: "name",
    스킬명: "name",
    직업: "job",
    클래스: "job",
    분류: "category",
    계열: "category",
    추가분류: "subCategory",
    SL: "sl",
    SL상한: "slMax",
    타이밍: "timing",
    사거리: "range",
    거리: "range",
    판정: "check",
    대상: "target",
    코스트: "cost",
    비용: "cost",
    사용조건: "condition",
    조건: "condition",
    효과: "effect",
    크리티컬: "critical",
    크리: "critical",
    출처아이템: "sourceItem",
    출처: "sourceItem",
    소모품: "sourceItem",
    스킬북: "sourceItem",
  });
  if (!h) throw new Error("전투스킬 탭이 없거나 헤더(이름/효과)가 없어요.");

  const rows: CombatSkillRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    if (!name) continue;
    // 스킬ID 는 동기화 시 고유키로만 쓰임(사용 조회는 출처아이템 기준).
    // 비워두면 이름을 쓰고, 그래도 겹치면 자동으로 번호를 붙여 고유화한다.
    const rawId = at(g, r, h.col.id);
    let id = rawId || name;
    if (/[,，]/.test(id)) throw new Error(`전투스킬 ID '${id}' 에는 쉼표를 쓸 수 없어요.`);
    if (seen.has(id)) {
      if (rawId) throw new Error(`전투스킬 ID '${id}' 가 중복됐어요.`);
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    seen.add(id);
    rows.push({
      id,
      name,
      job: at(g, r, h.col.job) || null,
      category: at(g, r, h.col.category) || null,
      subCategory: at(g, r, h.col.subCategory) || null,
      sl: at(g, r, h.col.sl) || null,
      slMax: at(g, r, h.col.slMax) || null,
      timing: at(g, r, h.col.timing) || null,
      range: at(g, r, h.col.range) || null,
      check: at(g, r, h.col.check) || null,
      target: at(g, r, h.col.target) || null,
      cost: at(g, r, h.col.cost) || null,
      condition: at(g, r, h.col.condition) || null,
      effect: at(g, r, h.col.effect) || null,
      critical: at(g, r, h.col.critical) || null,
      sourceItem: at(g, r, h.col.sourceItem) || null,
    });
  }
  if (rows.length === 0) throw new Error("전투스킬 탭에 스킬이 없어요.");
  return rows;
}

// ── 시트에서 불러오기 (탭 없으면 null — 선택 탭) ──
export async function fetchDungeonsRows(itemIds: Set<string>): Promise<DungeonRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, DUNGEON_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, DUNGEON_TAB));
  if (!g) return null;
  return parseDungeonsGrid(g, itemIds);
}

export async function fetchEventsRows(itemIds: Set<string>): Promise<EventRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, EVENTS_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, EVENTS_TAB));
  if (!g) return null;
  return parseEventsGrid(g, itemIds);
}

export async function fetchAchievementsRows(): Promise<AchievementRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, ACHIEVEMENTS_TAB)) ??
    (await fetchTab(MASTER_SHEET_ID, ACHIEVEMENTS_TAB));
  if (!g) return null;
  return parseAchievementsGrid(g);
}

export async function fetchRecipesRows(): Promise<RecipeRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, RECIPES_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, RECIPES_TAB));
  if (!g) return null;
  return parseRecipesGrid(g);
}

export async function fetchPotionsRows(): Promise<PotionRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, POTIONS_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, POTIONS_TAB));
  if (!g) return null;
  return parsePotionsGrid(g);
}

// ── 물고기/채집/광물 탭 → 생활 아이템 ──
export type LifeItemRow = {
  kind: "낚시" | "채집" | "채광";
  name: string;
  rank: number;
  rarity: string | null;
  weight: number;
  price: number;
  exp: number;
  sizeBase: number;
  sizeVar: number;
  habitat: string | null;
  text: string | null;
  craftRole: string | null; // 광물 전용 — 메이저/마이너/잡석
  craftEffect: string | null; // 광물 전용 — 제작효과
};

function rankToNum(s: string): number {
  const m = s.toUpperCase().match(/R?\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function parseLifeItemsGrid(g: string[][], kind: "낚시" | "채집" | "채광"): LifeItemRow[] {
  const h = findHeader(g, ["이름", "등급"], {
    이름: "name",
    등급: "rank",
    별등급: "rarity",
    중량: "weight",
    판매가: "price",
    숙련도: "exp",
    크기기본: "sizeBase",
    크기편차: "sizeVar",
    서식지: "habitat",
    분류: "craftRole",
    제작효과: "craftEffect",
    "제작 효과": "craftEffect",
    설명: "text",
  });
  if (!h) throw new Error(`${kind} 탭 헤더(이름/등급)를 찾지 못했어요.`);

  // 헤더 칸이 비어 있어도 문서화된 컬럼 순서로 복원 —
  // 중량·판매가·숙련도·크기기본·크기편차는 항상 '별등급' 오른쪽에 이 순서로 붙는다.
  // (헤더 텍스트가 지워지면 판매가·숙련도가 전부 0으로 동기화되는 사고 방지)
  if (h.col.rarity != null) {
    const base = h.col.rarity;
    if (h.col.weight == null) h.col.weight = base + 1;
    if (h.col.price == null) h.col.price = base + 2;
    if (h.col.exp == null) h.col.exp = base + 3;
    if (h.col.sizeBase == null) h.col.sizeBase = base + 4;
    if (h.col.sizeVar == null) h.col.sizeVar = base + 5;
  }

  const rows: LifeItemRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name);
    if (!name) continue;
    if (seen.has(name)) continue; // 중복 이름은 첫 행만 채택
    seen.add(name);
    rows.push({
      kind,
      name,
      rank: rankToNum(at(g, r, h.col.rank)),
      rarity: at(g, r, h.col.rarity) || null,
      weight: num(at(g, r, h.col.weight)) ?? 1,
      price: num(at(g, r, h.col.price)) ?? 0,
      exp: num(at(g, r, h.col.exp)) ?? 1,
      sizeBase: num(at(g, r, h.col.sizeBase)) ?? 1,
      sizeVar: num(at(g, r, h.col.sizeVar)) ?? 1,
      habitat: at(g, r, h.col.habitat) || null,
      craftRole: at(g, r, h.col.craftRole) || null,
      craftEffect: at(g, r, h.col.craftEffect) || null,
      text: at(g, r, h.col.text) || null,
    });
  }
  if (rows.length === 0) throw new Error(`${kind} 탭에서 항목을 찾지 못했어요.`);
  return rows;
}

// 탭이 없으면 gviz가 다른 탭(맵 등)을 대신 반환하므로, 생활아이템 헤더(이름/등급)가
// 실제로 있는 그리드만 채택한다. 없으면 '탭 없음'으로 보고 조용히 건너뛴다.
function isLifeItemGrid(g: string[][] | null): g is string[][] {
  return !!g && findHeader(g, ["이름", "등급"], { 이름: "name", 등급: "rank" }) != null;
}

export async function fetchLifeItemsRows(): Promise<LifeItemRow[] | null> {
  const fishRaw = (await fetchTab(WORLD_SHEET_ID, FISH_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, FISH_TAB));
  const gathRaw = (await fetchTab(WORLD_SHEET_ID, GATHER_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, GATHER_TAB));
  const mineRaw = (await fetchTab(WORLD_SHEET_ID, MINERAL_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, MINERAL_TAB));
  const fishG = isLifeItemGrid(fishRaw) ? fishRaw : null;
  const gathG = isLifeItemGrid(gathRaw) ? gathRaw : null;
  const mineG = isLifeItemGrid(mineRaw) ? mineRaw : null;
  if (!fishG && !gathG && !mineG) return null;
  const out: LifeItemRow[] = [];
  if (fishG) out.push(...parseLifeItemsGrid(fishG, "낚시"));
  if (gathG) out.push(...parseLifeItemsGrid(gathG, "채집"));
  if (mineG) out.push(...parseLifeItemsGrid(mineG, "채광"));
  return out;
}

// ── 제작특성 탭 ──  태그 | 설명  — 장비 [태그]의 룰 사전 (UI 클릭 조회용)
export type CraftTagRow = { name: string; desc: string; slot: string; stackable: boolean };

// 슬롯 정규화 — 무기/방어구 아니면 공용
function normSlot(v: string): string {
  const s = v.replace(/\s+/g, "");
  if (/^(무기|weapon|w)$/i.test(s)) return "무기";
  if (/^(방어구|방어|armor|a)$/i.test(s)) return "방어구";
  return "공용";
}

export function parseCraftTagsGrid(g: string[][]): CraftTagRow[] {
  const h = findHeader(g, ["태그", "설명"], {
    태그: "name",
    특성: "name",
    이름: "name",
    설명: "desc",
    룰: "desc",
    효과: "desc",
    슬롯: "slot",
    분류: "slot",
    장비: "slot",
    "무기/방어구": "slot",
    중복: "stackable",
    중복가능: "stackable",
    "중복 가능": "stackable",
  });
  if (!h) throw new Error("제작특성 탭 헤더(태그/설명)를 찾지 못했어요.");
  const rows: CraftTagRow[] = [];
  const seen = new Set<string>();
  for (let r = h.row + 1; r < g.length; r++) {
    const name = at(g, r, h.col.name).replace(/^\[|\]$/g, "").trim();
    const desc = at(g, r, h.col.desc);
    if (!name || !desc || seen.has(name)) continue;
    seen.add(name);
    const stackRaw = at(g, r, h.col.stackable);
    rows.push({
      name,
      desc,
      slot: normSlot(at(g, r, h.col.slot)),
      stackable: /^(y|yes|true|1|가능|중복|o)$/i.test(stackRaw.replace(/\s+/g, "")),
    });
  }
  return rows;
}

export async function fetchCraftTagsRows(): Promise<CraftTagRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, CRAFT_TAGS_TAB)) ??
    (await fetchTab(MASTER_SHEET_ID, CRAFT_TAGS_TAB));
  if (!g) return null;
  // 탭 부재 시 gviz가 맵을 대신 반환할 수 있음 — 헤더 없으면 조용히 건너뜀
  try {
    const rows = parseCraftTagsGrid(g);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

export async function fetchSkillsRows(): Promise<SkillRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, SKILLS_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, SKILLS_TAB));
  if (!g) return null;
  return parseSkillsGrid(g);
}

export async function fetchCombatSkillsRows(): Promise<CombatSkillRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, COMBAT_SKILLS_TAB)) ??
    (await fetchTab(MASTER_SHEET_ID, COMBAT_SKILLS_TAB));
  if (!g) return null;
  return parseCombatSkillsGrid(g);
}

export async function fetchItemsRows(): Promise<ItemRow[] | null> {
  const g = (await fetchTab(WORLD_SHEET_ID, ITEMS_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, ITEMS_TAB));
  if (!g) return null;
  return parseItemsGrid(g);
}

export async function fetchActionsRows(itemIds: Set<string>): Promise<ActionRow[] | null> {
  const g =
    (await fetchTab(WORLD_SHEET_ID, ACTIONS_TAB)) ?? (await fetchTab(MASTER_SHEET_ID, ACTIONS_TAB));
  if (!g) return null;
  return parseActionsGrid(g, itemIds);
}
