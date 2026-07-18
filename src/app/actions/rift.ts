"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { postSystem } from "@/lib/play";
import { addVisited, bumpStat, checkAndGrant } from "@/lib/achievements";
import { RIFT_CAPACITY, RIFT_EMOJI, isRiftType, riftInteriorId } from "@/lib/rift";

export type RiftActionState = { error?: string; ok?: string } | undefined;

// ── GM: 균열 열기 ──
export async function openRift(_prev: RiftActionState, formData: FormData): Promise<RiftActionState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const type = String(formData.get("type") ?? "").trim();
  const originId = String(formData.get("originId") ?? "").trim();
  if (!isRiftType(type)) return { error: "균열 종류가 올바르지 않습니다." };
  if (!originId) return { error: "균열을 열 장소를 선택해주세요." };

  const interiorId = riftInteriorId(type);
  const [origin, interior] = await Promise.all([
    prisma.location.findUnique({ where: { id: originId }, select: { id: true, name: true } }),
    prisma.location.findUnique({ where: { id: interiorId }, select: { id: true } }),
  ]);
  if (!origin) return { error: "그 장소를 찾지 못했습니다." };
  if (!interior) {
    return { error: `내부맵 '${interiorId}' 장소가 아직 없어요. 맵 시트에 같은 id로 만들고 동기화해주세요.` };
  }

  const existing = await prisma.rift.findFirst({ where: { originId, status: "open" } });
  if (existing) return { error: "그 장소엔 이미 열린 균열이 있어요." };

  await prisma.rift.create({ data: { type, originId, interiorId, capacity: RIFT_CAPACITY } });
  await postSystem(
    originId,
    `${RIFT_EMOJI[type] ?? "⚡"} ${origin.name}에 '${type}' 균열이 나타났다! 선착순 ${RIFT_CAPACITY}명 진입 가능.`,
  );
  revalidatePath("/world");
  return { ok: `'${type}' 균열을 ${origin.name}에 열었어요.` };
}

// ── GM: 균열 닫기 (새 진입만 차단, 내부 인원은 정상 탈출) ──
export async function closeRift(_prev: RiftActionState, formData: FormData): Promise<RiftActionState> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) return { error: "GM 권한이 필요합니다." };

  const riftId = String(formData.get("riftId") ?? "").trim();
  const rift = await prisma.rift.findUnique({ where: { id: riftId } });
  if (!rift) return { error: "균열을 찾지 못했습니다." };

  // 닫히는 순간 내부에 있던 인원은 '균열 클리어'로 인정 — 균열클리어 업적 카운터
  const members = await prisma.riftMember.findMany({
    where: { riftId },
    select: { userId: true },
  });
  await prisma.rift.update({ where: { id: riftId }, data: { status: "closed" } });
  for (const member of members) {
    const memberSheet = await prisma.characterSheet.findUnique({
      where: { userId: member.userId },
      select: { achStatsJson: true },
    });
    if (!memberSheet) continue;
    await prisma.characterSheet.update({
      where: { userId: member.userId },
      data: { achStatsJson: bumpStat(memberSheet.achStatsJson, "균열클리어") },
    });
    void checkAndGrant(member.userId);
  }
  await postSystem(rift.originId, `${RIFT_EMOJI[rift.type] ?? "⚡"} '${rift.type}' 균열이 닫혔다.`);
  revalidatePath("/world");
  return { ok: `균열을 닫았어요.${members.length > 0 ? ` (내부 ${members.length}명 클리어 인정)` : ""}` };
}

// ── 진입 (선착순 정원) ──
export async function enterRift(riftId: string): Promise<RiftActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { locationId: true, visitedJson: true, achStatsJson: true },
  });
  const rift = await prisma.rift.findUnique({ where: { id: riftId } });
  if (!rift || rift.status !== "open") return { error: "열린 균열이 아니에요." };
  if (sheet?.locationId !== rift.originId) return { error: "균열이 열린 장소에서만 진입할 수 있어요." };

  // 정원 카운트 + 합류를 원자적으로 (동시 진입 초과 방지)
  try {
    await prisma.$transaction(
      async (tx) => {
        const count = await tx.riftMember.count({ where: { riftId } });
        if (count >= rift.capacity) throw new Error("RIFT_FULL");
        await tx.riftMember.create({ data: { riftId, userId: user.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "이미 이 균열에 들어와 있어요." };
    }
    return { error: "정원이 찼거나 동시 진입이 겹쳤어요. (잠시 후 다시)" };
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: {
      locationId: rift.interiorId,
      enteredAt: new Date(),
      visitedJson: addVisited(sheet?.visitedJson, rift.interiorId),
      achStatsJson: bumpStat(sheet?.achStatsJson, "균열입장"),
    },
  });
  void checkAndGrant(user.id);
  await Promise.all([
    postSystem(rift.originId, `🌀 ${user.nickname}님이 '${rift.type}' 균열에 진입합니다.`),
    postSystem(rift.interiorId, `🌀 ${user.nickname}님이 균열에 진입했다.`),
  ]);
  revalidatePath("/world");
  return { ok: "균열에 진입했어요." };
}

// ── 탈출 (열렸던 장소로 복귀) ──
export async function exitRift(): Promise<RiftActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요해요." };

  const membership = await prisma.riftMember.findFirst({
    where: { userId: user.id },
    include: { rift: true },
  });
  if (!membership) return { error: "들어와 있는 균열이 없어요." };

  const { rift } = membership;
  await prisma.riftMember.delete({ where: { id: membership.id } });
  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { locationId: rift.originId, enteredAt: new Date() },
  });
  await Promise.all([
    postSystem(rift.interiorId, `↩️ ${user.nickname}님이 균열에서 나갔다.`),
    postSystem(rift.originId, `↩️ ${user.nickname}님이 균열에서 빠져나왔다.`),
  ]);
  revalidatePath("/world");
  return { ok: "균열에서 나왔어요." };
}
