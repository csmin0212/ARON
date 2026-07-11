import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { bumpStat, checkAndGrant } from "@/lib/achievements";

// 로그 저장(PDF 내보내기)은 클라이언트에서 일어나므로, 버튼 클릭 시 이 엔드포인트로
// 카운터만 올린다 — '로그저장횟수' 업적 판정용.
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { achStatsJson: true },
  });
  if (sheet) {
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { achStatsJson: bumpStat(sheet.achStatsJson, "로그저장횟수") },
    });
    void checkAndGrant(user.id);
  }
  return Response.json({ ok: true });
}
