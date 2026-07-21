import type { StatEntry } from "@/lib/charsheet";
import { adventurerRankGoal, normalizeAdventurerRank } from "@/lib/adventurerRank";
import type { ProfileCardData, ProfileCardStat } from "@/components/ProfileCard";

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
  curHp?: number | null;
  curMp?: number | null;
  curGold?: number | null;
  adventurerRank?: string | null;
  fame?: number | null;
} | null | undefined;

type UserLike = {
  nickname: string;
  username: string;
  avatar: string | null;
  profileStatus?: string | null;
  profileColor?: string | null;
};

function currentMax(
  cur: number | null | undefined,
  max: number | null | undefined,
): string | number | null {
  if (cur == null || max == null) return max ?? null;
  return cur === max ? max : `${cur}/${max}`;
}

function parseStats(json: string | null | undefined): ProfileCardStat[] {
  try {
    const raw = json ? (JSON.parse(json) as StatEntry[]) : [];
    return raw.map((s) => ({ key: s.key, label: s.label, value: s.value, mod: s.mod }));
  } catch {
    return [];
  }
}

// User(+CharacterSheet) → 프로필 카드 표시 데이터.
// canViewSheet=false 면 능력치·바이탈·등급을 감추고 정체성만 남긴다.
export function buildProfileCardData(
  user: UserLike,
  sheet: SheetLike,
  opts: {
    title?: string | null;
    badge?: string | null;
    canViewSheet?: boolean;
  } = {},
): ProfileCardData {
  const canViewSheet = opts.canViewSheet !== false;
  const base: ProfileCardData = {
    nickname: user.nickname,
    username: user.username,
    avatar: user.avatar,
    status: user.profileStatus ?? null,
    accent: user.profileColor ?? null,
    title: opts.title ?? null,
    badge: opts.badge ?? null,
  };

  if (!sheet || !canViewSheet) return base;

  const rank = normalizeAdventurerRank(sheet.adventurerRank);
  const fame = sheet.fame ?? 0;
  const goal = adventurerRankGoal(rank);
  const rankPct = goal > 0 ? Math.min(100, Math.round((fame / goal) * 100)) : 100;
  const gold =
    sheet.curGold != null ? `${sheet.curGold.toLocaleString()}G` : sheet.gold ?? null;

  return {
    ...base,
    level: sheet.level,
    rank,
    rankPct,
    charClass: sheet.charClass,
    race: sheet.race,
    attribute: sheet.attribute,
    gold,
    hp: currentMax(sheet.curHp, sheet.hp),
    mp: currentMax(sheet.curMp, sheet.mp),
    fate: sheet.fate,
    stats: parseStats(sheet.statsJson),
  };
}
