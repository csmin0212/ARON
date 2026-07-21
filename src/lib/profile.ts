export const PROFILE_VISIBILITY_KEYS = [
  "sheet",
  "lifeProfile",
  "collection",
  "skills",
  "achievements",
] as const;

export type ProfileVisibilityKey = (typeof PROFILE_VISIBILITY_KEYS)[number];
export type ProfileVisibility = Record<ProfileVisibilityKey, boolean>;

export const PROFILE_VISIBILITY_LABELS: Record<ProfileVisibilityKey, string> = {
  sheet: "캐릭터 시트",
  lifeProfile: "생활 데이터 프로필",
  collection: "도감",
  skills: "스킬",
  achievements: "업적",
};

export const DEFAULT_PROFILE_VISIBILITY: ProfileVisibility = {
  sheet: true,
  lifeProfile: true,
  collection: true,
  skills: true,
  achievements: true,
};

export function parseProfileVisibility(json: string | null | undefined): ProfileVisibility {
  if (!json) return { ...DEFAULT_PROFILE_VISIBILITY };
  try {
    const parsed = JSON.parse(json) as Partial<Record<ProfileVisibilityKey, unknown>>;
    return Object.fromEntries(
      PROFILE_VISIBILITY_KEYS.map((key) => [key, parsed[key] !== false]),
    ) as ProfileVisibility;
  } catch {
    return { ...DEFAULT_PROFILE_VISIBILITY };
  }
}

export function profileVisibilityFromForm(formData: FormData): ProfileVisibility {
  return Object.fromEntries(
    PROFILE_VISIBILITY_KEYS.map((key) => [
      key,
      String(formData.get(`visibility.${key}`) ?? "public") === "public",
    ]),
  ) as ProfileVisibility;
}

export function parseFeaturedAchievementIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniqueFeaturedAchievementIds(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return [];
  }
}

export function uniqueFeaturedAchievementIds(ids: (string | null | undefined)[]): string[] {
  const unique: string[] = [];
  for (const id of ids) {
    const clean = (id ?? "").trim();
    if (!clean || unique.includes(clean)) continue;
    unique.push(clean);
    if (unique.length === 3) break;
  }
  return unique;
}
