import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

// 이미지 업로드 → DB 저장 후 { id, url } 반환 (글 저장 시 postId 로 연결)
export async function POST(req: Request) {
  // 비회원도 익명 글에 이미지를 올릴 수 있으므로 로그인 강제는 안 함
  await getCurrentUser();

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json(
      { error: "PNG · JPG · GIF · WEBP 이미지만 업로드할 수 있습니다." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "이미지는 4MB 이하만 가능합니다." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const img = await prisma.image.create({ data: { data: buf, mime: file.type } });

  return Response.json({ id: img.id, url: `/api/image/${img.id}` });
}
