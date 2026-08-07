"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { prisma } from "@/lib/prisma";
import {
  GM_NPC_SLOT_MAX,
  isGmNpcSlotKey,
  parseGmNpcPersonas,
  serializeGmNpcPersonas,
  type GmNpcPersona,
} from "@/lib/gmNpc";
import { invalidateWorldLocation, invalidateWorldUser } from "@/lib/worldCache";

export type GmNpcState = { ok?: string; error?: string } | undefined;

function cleanAvatar(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("preset:")) return value.slice(0, 60);
  if (/^https?:\/\//.test(value) || value.startsWith("/api/image/")) return value.slice(0, 500);
  return null;
}

async function refreshGmNpcViews(userId: string) {
  const sheet = await prisma.characterSheet.findUnique({
    where: { userId },
    select: { locationId: true },
  });
  invalidateWorldUser(userId);
  invalidateWorldLocation(sheet?.locationId);
  revalidatePath("/profile");
  revalidatePath("/world");
  revalidatePath("/");
}

export async function saveGmNpcPersonas(
  _prev: GmNpcState,
  formData: FormData,
): Promise<GmNpcState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const saved = parseGmNpcPersonas(user.gmNpcPersonasJson);
  // 슬롯 목록은 폼이 들고 온다(추가·제거가 저장 시점에 함께 반영된다).
  // slotKeys 가 아예 없는 요청은 옛 폼이므로, 저장된 슬롯을 그대로 유지해 실수로 날리지 않는다.
  const rawSlotKeys = formData.get("slotKeys");
  const keys =
    rawSlotKeys == null
      ? saved.map((persona) => persona.key)
      : String(rawSlotKeys)
          .split(",")
          .map((key) => key.trim())
          .filter(isGmNpcSlotKey);

  const personas: GmNpcPersona[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key) || personas.length >= GM_NPC_SLOT_MAX) continue;
    seen.add(key);
    const existing = saved.find((persona) => persona.key === key);
    const fallbackName = existing?.name ?? `NPC ${key.slice(3)}`;
    const name = String(formData.get(`${key}Name`) ?? fallbackName).trim().slice(0, 20);
    personas.push({
      key,
      name: name || fallbackName,
      avatar: cleanAvatar(String(formData.get(`${key}Avatar`) ?? existing?.avatar ?? "")),
    });
  }

  const requestedActive = String(formData.get("activeNpcPersonaKey") ?? "");
  const activeNpcPersonaKey =
    requestedActive === "self"
      ? null
      : personas.some((persona) => persona.key === requestedActive)
        ? requestedActive
        // 표시 중이던 NPC 슬롯을 지웠다면 본캐로 돌아간다 — 없는 페르소나를 가리킨 채로 두면 안 된다.
        : personas.some((persona) => persona.key === user.activeNpcPersonaKey)
          ? user.activeNpcPersonaKey
          : null;

  const removed = saved.filter((persona) => !seen.has(persona.key)).length;
  const added = personas.filter((persona) => !saved.some((s) => s.key === persona.key)).length;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      gmNpcPersonasJson: serializeGmNpcPersonas(personas),
      activeNpcPersonaKey,
    },
  });
  await refreshGmNpcViews(user.id);

  const slotNote = [added > 0 ? `+${added}칸` : null, removed > 0 ? `-${removed}칸` : null]
    .filter(Boolean)
    .join(" ");
  const base = activeNpcPersonaKey ? "NPC 페르소나가 저장되고 전환됐어요." : "본인 표시로 돌아왔어요.";
  return { ok: slotNote ? `${base} (슬롯 ${slotNote} · 총 ${personas.length}칸)` : base };
}

export async function switchGmNpcPersona(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return;

  const key = String(formData.get("key") ?? "");
  const personas = parseGmNpcPersonas(user.gmNpcPersonasJson);
  const activeNpcPersonaKey =
    key === "self" ? null : personas.some((persona) => persona.key === key) ? key : user.activeNpcPersonaKey;

  await prisma.user.update({
    where: { id: user.id },
    data: { activeNpcPersonaKey },
  });
  await refreshGmNpcViews(user.id);
}
