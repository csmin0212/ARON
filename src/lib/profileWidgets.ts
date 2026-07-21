// 프로필 헤더(메인/카드 공용) 내용물 위젯 카탈로그.
// 유저가 최대 6개를 순서대로 골라 담고, 형태(hero/card)와 무관하게 같은 위젯 세트를 쓴다.
// 값 계산에 필요한 원본은 ProfileValues(lib/profileValues.ts)로 주입된다.

export const WIDGET_KEYS = [
  "posts",
  "level",
  "gold",
  "rank",
  "fame",
  "hp",
  "mp",
  "fate",
  "stats",
  "collection",
] as const;

export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const MAX_WIDGETS = 6;

export type WidgetKind = "tile" | "stats" | "collection";

export interface WidgetMeta {
  key: WidgetKey;
  label: string;
  emoji: string;
  kind: WidgetKind;
  accent?: boolean; // 값 강조(골드 등)
  needsSheet?: boolean; // 시트 비공개 시 숨김
}

export const WIDGET_META: Record<WidgetKey, WidgetMeta> = {
  posts: { key: "posts", label: "작성한 글", emoji: "📝", kind: "tile" },
  level: { key: "level", label: "레벨", emoji: "⭐", kind: "tile", needsSheet: true },
  gold: { key: "gold", label: "소지금", emoji: "🪙", kind: "tile", accent: true, needsSheet: true },
  rank: { key: "rank", label: "모험가 등급", emoji: "🎖️", kind: "tile", needsSheet: true },
  fame: { key: "fame", label: "명성", emoji: "🔥", kind: "tile", needsSheet: true },
  hp: { key: "hp", label: "HP", emoji: "❤️", kind: "tile", needsSheet: true },
  mp: { key: "mp", label: "MP", emoji: "💧", kind: "tile", needsSheet: true },
  fate: { key: "fate", label: "페이트", emoji: "🍀", kind: "tile", needsSheet: true },
  stats: { key: "stats", label: "능력치", emoji: "📊", kind: "stats", needsSheet: true },
  collection: { key: "collection", label: "도감 완성률", emoji: "📖", kind: "collection" },
};

export const WIDGET_LIST: WidgetMeta[] = WIDGET_KEYS.map((k) => WIDGET_META[k]);

// 기존 히어로 푸터(작성글/레벨/소지금)와 동일한 기본 구성 — 하위호환.
export const DEFAULT_WIDGETS: WidgetKey[] = ["posts", "level", "gold"];

export function parseProfileWidgets(json: string | null | undefined): WidgetKey[] {
  if (json == null) return [...DEFAULT_WIDGETS];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [...DEFAULT_WIDGETS];
    const seen = new Set<string>();
    const out: WidgetKey[] = [];
    for (const v of raw) {
      if (typeof v !== "string" || !(v in WIDGET_META) || seen.has(v)) continue;
      seen.add(v);
      out.push(v as WidgetKey);
      if (out.length >= MAX_WIDGETS) break;
    }
    return out;
  } catch {
    return [...DEFAULT_WIDGETS];
  }
}

export function sanitizeWidgets(keys: (string | null | undefined)[]): WidgetKey[] {
  const seen = new Set<string>();
  const out: WidgetKey[] = [];
  for (const k of keys) {
    const v = (k ?? "").trim();
    if (!v || !(v in WIDGET_META) || seen.has(v)) continue;
    seen.add(v);
    out.push(v as WidgetKey);
    if (out.length >= MAX_WIDGETS) break;
  }
  return out;
}

// ── 값 주입용 ──
export interface ProfileValues {
  hasSheet: boolean;
  canViewSheet: boolean;
  posts: number;
  level: number | null;
  gold: string | null;
  rank: string | null;
  fame: number | null;
  hp: string | number | null;
  mp: string | number | null;
  fate: number | null;
  stats: { label: string; value: number | null }[];
  // 도감 완성률 — 비공개거나 미계산이면 null
  collection: { emoji: string; label: string; pct: number }[] | null;
}

export type ResolvedWidget =
  | { kind: "tile"; key: WidgetKey; emoji: string; label: string; value: string; accent: boolean }
  | { kind: "stats"; key: WidgetKey; stats: { label: string; value: number | null }[] }
  | { kind: "collection"; key: WidgetKey; rows: { emoji: string; label: string; pct: number }[] };

function tileValue(key: WidgetKey, v: ProfileValues): string {
  switch (key) {
    case "posts":
      return String(v.posts);
    case "level":
      return v.level != null ? `Lv.${v.level}` : "-";
    case "gold":
      return v.gold ?? "-";
    case "rank":
      return v.rank ? `${v.rank}` : "-";
    case "fame":
      return v.fame != null ? v.fame.toLocaleString() : "-";
    case "hp":
      return v.hp != null ? String(v.hp) : "-";
    case "mp":
      return v.mp != null ? String(v.mp) : "-";
    case "fate":
      return v.fate != null ? String(v.fate) : "-";
    default:
      return "-";
  }
}

// 선택 위젯 → 렌더 가능한 형태로 해석. 데이터 없으면(시트 비공개 등) 자동 제외.
export function resolveWidgets(keys: WidgetKey[], v: ProfileValues): ResolvedWidget[] {
  const out: ResolvedWidget[] = [];
  for (const key of keys) {
    const meta = WIDGET_META[key];
    if (meta.needsSheet && (!v.hasSheet || !v.canViewSheet)) continue;
    if (meta.kind === "stats") {
      if (v.stats.length > 0) out.push({ kind: "stats", key, stats: v.stats });
    } else if (meta.kind === "collection") {
      if (v.collection && v.collection.length > 0)
        out.push({ kind: "collection", key, rows: v.collection });
    } else {
      out.push({
        kind: "tile",
        key,
        emoji: meta.emoji,
        label: meta.label,
        value: tileValue(key, v),
        accent: Boolean(meta.accent),
      });
    }
  }
  return out;
}
