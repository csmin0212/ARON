"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { prisma } from "@/lib/prisma";
import {
  GM_NPC_SLOT_COUNT,
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
  const personas: GmNpcPersona[] = Array.from({ length: GM_NPC_SLOT_COUNT }, (_, index) => {
    const key = `npc${index + 1}`;
    const existing = saved.find((persona) => persona.key === key);
    const name = String(formData.get(`${key}Name`) ?? existing?.name ?? `NPC ${index + 1}`)
      .trim()
      .slice(0, 20);
    return {
      key,
      name: name || `NPC ${index + 1}`,
      avatar: cleanAvatar(String(formData.get(`${key}Avatar`) ?? existing?.avatar ?? "")),
    };
  });

  const requestedActive = String(formData.get("activeNpcPersonaKey") ?? "");
  const activeNpcPersonaKey =
    requestedActive === "self"
      ? null
      : personas.some((persona) => persona.key === requestedActive)
        ? requestedActive
        : user.activeNpcPersonaKey;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      gmNpcPersonasJson: serializeGmNpcPersonas(personas),
      activeNpcPersonaKey,
    },
  });
  await refreshGmNpcViews(user.id);
  return { ok: activeNpcPersonaKey ? "NPC 페르소나가 저장되고 전환됐어요." : "본인 표시로 돌아왔어요." };
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
