// 캐릭터 프리셋 아바타 (이미지 URL 대신 간편 선택용)
// 저장 형식: "preset:<key>" 또는 일반 이미지 URL

export interface AvatarPreset {
  key: string;
  emoji: string;
  bg: string; // tailwind 그라데이션
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: "knight", emoji: "⚔️", bg: "from-slate-400 to-slate-600" },
  { key: "shield", emoji: "🛡️", bg: "from-sky-400 to-blue-600" },
  { key: "archer", emoji: "🏹", bg: "from-emerald-400 to-green-600" },
  { key: "mage", emoji: "🔮", bg: "from-violet-400 to-purple-600" },
  { key: "dragon", emoji: "🐉", bg: "from-red-400 to-rose-600" },
  { key: "eagle", emoji: "🦅", bg: "from-amber-400 to-orange-600" },
  { key: "wizard", emoji: "🧙", bg: "from-indigo-400 to-indigo-600" },
  { key: "wolf", emoji: "🐺", bg: "from-zinc-400 to-zinc-600" },
  { key: "gem", emoji: "💎", bg: "from-cyan-400 to-teal-600" },
  { key: "moon", emoji: "🌙", bg: "from-fuchsia-400 to-pink-600" },
  { key: "fire", emoji: "🔥", bg: "from-orange-400 to-red-600" },
  { key: "star", emoji: "⭐", bg: "from-yellow-300 to-amber-500" },
];

export const PRESET_MAP: Record<string, AvatarPreset> = Object.fromEntries(
  AVATAR_PRESETS.map((p) => [p.key, p]),
);

export function getPreset(avatar: string | null | undefined): AvatarPreset | null {
  if (!avatar) return null;
  if (avatar.startsWith("preset:")) {
    return PRESET_MAP[avatar.slice(7)] ?? null;
  }
  return null;
}

export function isImageUrl(avatar: string | null | undefined): boolean {
  return !!avatar && !avatar.startsWith("preset:") && /^https?:\/\//.test(avatar);
}
