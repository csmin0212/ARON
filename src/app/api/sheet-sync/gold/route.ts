import { getCurrentUser } from "@/lib/auth";
import { processDueSheetGoldSyncs } from "@/lib/sheetGoldSync";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const result = await processDueSheetGoldSyncs({ forceUserId: user.id, limit: 1 });
  return Response.json(result);
}
