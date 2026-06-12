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

export type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  desc: string | null;
};

export type DropEntry = { item: string; qty: number; gold: number; weight: number };

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

export const ABILITY_LABELS_KO = ["근력", "재주", "민첩", "지력", "감지", "정신", "행운"];

// ── 공용 ──
function findHeader(
  g: string[][],
  required: string[],
  aliases: Record<string, string>,
): { row: number; col: Record<string, number> } | null {
  for (let r = 0; r < Math.min(g.length, 10); r++) {
    const cells = (g[r] || []).map((v) => (v ?? "").trim());
    if (required.every((h) => cells.includes(h))) {
      const col: Record<string, number> = {};
      cells.forEach((h, c) => {
        const key = aliases[h];
        if (key && col[key] == null) col[key] = c;
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
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}`;
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

export function pickDrop(drops: DropEntry[]): DropEntry {
  const total = drops.reduce((s, d) => s + Math.max(1, d.weight), 0);
  let roll = Math.random() * total;
  for (const d of drops) {
    roll -= Math.max(1, d.weight);
    if (roll <= 0) return d;
  }
  return drops[drops.length - 1];
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

// ── 시트에서 불러오기 (탭 없으면 null — 선택 탭) ──
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
