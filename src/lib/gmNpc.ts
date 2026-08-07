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

// 슬롯은 고정이 아니라 가변이다 — 아래 값은 '처음 GM이 됐을 때 깔리는 기본 개수'일 뿐이고,
// 실제 개수는 저장된 JSON 배열의 길이가 정한다.
export const GM_NPC_DEFAULT_SLOT_COUNT = 6;
export const GM_NPC_SLOT_MAX = 20;

const DEFAULT_PERSONAS: GmNpcPersona[] = Array.from({ length: GM_NPC_DEFAULT_SLOT_COUNT }, (_, i) => ({
  key: `npc${i + 1}`,
  name: `NPC ${i + 1}`,
  avatar: null,
}));

// 슬롯 키는 한 번 정해지면 절대 바꾸지 않는다. 중간 슬롯을 지워도 뒤 번호를 당기지 않는 이유:
// 이미 쓴 글·프로필 링크가 이 키를 가리키고 있어서, 번호를 밀면 다른 NPC가 되어버린다.
export function isGmNpcSlotKey(key: string): boolean {
  return /^npc([1-9]\d{0,2})$/.test(key);
}

function defaultNameForKey(key: string): string {
  return `NPC ${key.slice(3)}`;
}

// 비어 있는 가장 작은 번호를 새 슬롯 키로 준다 (npc1, npc2 … 중 빠진 자리부터).
export function nextGmNpcSlotKey(personas: GmNpcPersona[]): string | null {
  const used = new Set(personas.map((persona) => persona.key));
  for (let i = 1; i <= 999; i += 1) {
    const key = `npc${i}`;
    if (!used.has(key)) return key;
  }
  return null;
}

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

// 저장된 배열이 곧 슬롯 목록이다. 한 번도 저장한 적 없으면(=null/깨진 JSON) 기본 6칸을 깔아 준다.
// 저장된 값이 빈 배열이면 '슬롯을 전부 지웠다'는 뜻이라 그대로 0칸을 돌려준다.
export function parseGmNpcPersonas(json: string | null | undefined): GmNpcPersona[] {
  let parsed: unknown = null;
  try {
    parsed = json ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  if (!Array.isArray(parsed)) return DEFAULT_PERSONAS.map((base) => ({ ...base }));
  return normalizeGmNpcPersonas(
    parsed.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object"),
  );
}

// 키 유효성·중복·개수 상한을 한 곳에서 정리한다. 저장할 때도 읽을 때도 같은 규칙을 태운다.
function normalizeGmNpcPersonas(entries: Record<string, unknown>[]): GmNpcPersona[] {
  const out: GmNpcPersona[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = String(entry.key ?? "").trim();
    if (!isGmNpcSlotKey(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: cleanName(entry.name, defaultNameForKey(key)),
      avatar: cleanAvatar(entry.avatar),
    });
    if (out.length >= GM_NPC_SLOT_MAX) break;
  }
  return out;
}

export function serializeGmNpcPersonas(personas: GmNpcPersona[]): string {
  return JSON.stringify(
    normalizeGmNpcPersonas(
      personas.map((persona) => ({ key: persona.key, name: persona.name, avatar: persona.avatar })),
    ),
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
