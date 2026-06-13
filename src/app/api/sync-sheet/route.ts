import { getCurrentUser } from "@/lib/auth";
import { pushInventoryForUser } from "@/lib/sheetSync";

// 클라이언트가 3분마다(+페이지 이탈 시) 호출 — DB 내용을 구글 시트에 반영.
// ?force=1 이면 dirty 여부와 상관없이 즉시 반영("지금 시트에 반영" 버튼용).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const force = new URL(req.url).searchParams.get("force") === "1";
  const result = await pushInventoryForUser(user.id, { force });
  return Response.json(result);
}
