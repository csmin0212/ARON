import type { StatEntry } from "@/lib/charsheet";
import { adventurerRankGoal, normalizeAdventurerRank } from "@/lib/adventurerRank";
import { computeCollectionProgress } from "@/lib/collectionProgress";
import type { ProfileValues } from "@/lib/profileWidgets";

type SheetLike = {
  charClass: string | null;
  race: string | null;
  attribute: string | null;
  level: number | null;
  hp: number | null;
  mp: number | null;
  fate: number | null;
  gold: string | null;
  statsJson: string | null;
  lifeJson?: string | null;
  curHp?: number | null;
  curMp?: number | null;
  curGold?: number | null;
  adventurerRank?: string | null;
  fame?: number | null;
} | null | undefined;

function currentMax(
  cur: number | null | undefined,
  max: number | null | undefined,
): string | number | null {
  if (cur == null || max == null) return max ?? null;
  return cur === max ? max : `${cur}/${max}`;
}

function parseStats(json: string | null | undefined): { label: string; value: number | null }[] {
  try {
    const raw = json ? (JSON.parse(json) as StatEntry[]) : [];
    return raw.map((s) => ({ label: s.label, value: s.value }));
  } catch {
    return [];
  }
}

// 프로필 위젯이 참조할 값 묶음을 계산. 도감은 필요·열람 가능할 때만 계산(무거움).
export async function computeProfileValues(opts: {
  userId: string;
  sheet: SheetLike;
  postCount: number;
  canViewSheet: boolean;
  includeCollection: boolean;
  canViewCollection?: boolean;
}): Promise<ProfileValues> {
  const { userId, sheet, postCount, canViewSheet, includeCollection } = opts;
  const canViewCollection = opts.canViewCollection !== false;

  const rank = sheet ? normalizeAdventurerRank(sheet.adventurerRank) : null;

  const collection =
    includeCollection && canViewCollection
      ? await computeCollectionProgress(userId, sheet ?? null)
      : null;

  if (!sheet) {
    return {
      hasSheet: false,
      canViewSheet,
      posts: postCount,
      level: null,
      gold: null,
      rank: null,
      fame: null,
      hp: null,
      mp: null,
      fate: null,
      stats: [],
      collection,
    };
  }

  const gold =
    sheet.curGold != null ? `${sheet.curGold.toLocaleString()}G` : sheet.gold ?? null;

  return {
    hasSheet: true,
    canViewSheet,
    posts: postCount,
    level: sheet.level,
    gold,
    rank,
    fame: sheet.fame ?? null,
    hp: currentMax(sheet.curHp, sheet.hp),
    mp: currentMax(sheet.curMp, sheet.mp),
    fate: sheet.fate,
    stats: parseStats(sheet.statsJson),
    collection,
  };
}

// 헤더 정체성(형태 무관 공통) — 아바타/이름/등급/태그/대표 업적.
export interface ProfileIdentity {
  nickname: string;
  username: string;
  avatar: string | null;
  status: string | null;
  level: number | null;
  rank: string | null;
  rankPct: number;
  charClass: string | null;
  race: string | null;
  attribute: string | null;
  title: string | null;
  badge: string | null;
  accent: string | null;
}

export function buildProfileIdentity(
  user: {
    nickname: string;
    username: string;
    avatar: string | null;
    profileStatus?: string | null;
    profileColor?: string | null;
  },
  sheet: SheetLike,
  opts: { title?: string | null; badge?: string | null; canViewSheet?: boolean } = {},
): ProfileIdentity {
  const canViewSheet = opts.canViewSheet !== false && Boolean(sheet);
  const rank = canViewSheet && sheet ? normalizeAdventurerRank(sheet.adventurerRank) : null;
  return {
    nickname: user.nickname,
    username: user.username,
    avatar: user.avatar,
    status: user.profileStatus ?? null,
    accent: user.profileColor ?? null,
    title: opts.title ?? null,
    badge: opts.badge ?? null,
    level: canViewSheet && sheet ? sheet.level : null,
    rank,
    rankPct: rank ? rankProgress(rank, sheet?.fame) : 0,
    charClass: canViewSheet && sheet ? sheet.charClass : null,
    race: canViewSheet && sheet ? sheet.race : null,
    attribute: canViewSheet && sheet ? sheet.attribute : null,
  };
}

// 히어로/카드 헤더의 등급 진행률(0~100).
export function rankProgress(
  rank: string | null | undefined,
  fame: number | null | undefined,
): number {
  const goal = adventurerRankGoal(rank);
  if (goal <= 0) return 100;
  return Math.min(100, Math.round(((fame ?? 0) / goal) * 100));
}
