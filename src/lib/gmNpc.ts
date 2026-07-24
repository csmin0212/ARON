import { isGmUsername } from "./gm";

export type GmNpcPersona = {
  key: string;
  name: string;
  avatar: string | null;
};

export type PersonaCapableUser = {
  username: string;
  nickname: string;
  avatar: string | null;
  gmNpcPersonasJson?: string | null;
  activeNpcPersonaKey?: string | null;
};

export type DisplayPersona = {
  key: string | null;
  name: string;
  avatar: string | null;
  isNpc: boolean;
};

export const GM_NPC_SLOT_COUNT = 6;

const DEFAULT_PERSONAS: GmNpcPersona[] = Array.from({ length: GM_NPC_SLOT_COUNT }, (_, i) => ({
  key: `npc${i + 1}`,
  name: `NPC ${i + 1}`,
  avatar: null,
}));

function cleanName(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return raw.slice(0, 20);
}

function cleanAvatar(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("preset:")) return raw.slice(0, 60);
  if (/^https?:\/\//.test(raw) || raw.startsWith("/api/image/")) return raw.slice(0, 500);
  return null;
}

export function parseGmNpcPersonas(json: string | null | undefined): GmNpcPersona[] {
  let parsed: unknown = null;
  try {
    parsed = json ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  const byKey = new Map<string, Partial<GmNpcPersona>>();
  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const key = String((entry as { key?: unknown }).key ?? "");
      if (!key) continue;
      byKey.set(key, entry as Partial<GmNpcPersona>);
    }
  }
  return DEFAULT_PERSONAS.map((base) => {
    const saved = byKey.get(base.key);
    return {
      key: base.key,
      name: cleanName(saved?.name, base.name),
      avatar: cleanAvatar(saved?.avatar),
    };
  });
}

export function serializeGmNpcPersonas(personas: GmNpcPersona[]): string {
  return JSON.stringify(
    DEFAULT_PERSONAS.map((base) => {
      const saved = personas.find((persona) => persona.key === base.key);
      return {
        key: base.key,
        name: cleanName(saved?.name, base.name),
        avatar: cleanAvatar(saved?.avatar),
      };
    }),
  );
}

export function activeDisplayPersona(user: PersonaCapableUser): DisplayPersona {
  if (!isGmUsername(user.username)) {
    return { key: null, name: user.nickname, avatar: user.avatar, isNpc: false };
  }
  const activeKey = user.activeNpcPersonaKey;
  const persona = activeKey
    ? parseGmNpcPersonas(user.gmNpcPersonasJson).find((entry) => entry.key === activeKey)
    : null;
  if (!persona) return { key: null, name: user.nickname, avatar: user.avatar, isNpc: false };
  return { key: persona.key, name: persona.name, avatar: persona.avatar, isNpc: true };
}

export function displaySnapshot(user: PersonaCapableUser): { authorName: string | null; authorAvatar: string | null } {
  const persona = activeDisplayPersona(user);
  return persona.isNpc ? { authorName: persona.name, authorAvatar: persona.avatar } : { authorName: null, authorAvatar: null };
}

export function findGmNpcPersonaBySnapshot(
  user: PersonaCapableUser,
  snapshot: { authorName?: string | null; authorAvatar?: string | null },
): GmNpcPersona | null {
  if (!isGmUsername(user.username) || !snapshot.authorName) return null;
  const personas = parseGmNpcPersonas(user.gmNpcPersonasJson);
  const sameName = personas.filter((persona) => persona.name === snapshot.authorName);
  if (sameName.length === 0) return null;
  if (sameName.length === 1) return sameName[0];
  return sameName.find((persona) => (persona.avatar ?? null) === (snapshot.authorAvatar ?? null)) ?? sameName[0];
}

export function profileHrefForPersonaSnapshot(
  user: PersonaCapableUser,
  snapshot: { authorName?: string | null; authorAvatar?: string | null },
): string {
  const base = `/u/${encodeURIComponent(user.username)}`;
  const persona = findGmNpcPersonaBySnapshot(user, snapshot);
  return persona ? `${base}?npc=${encodeURIComponent(persona.key)}` : base;
}
