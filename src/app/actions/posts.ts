"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { getMaskedIp, DEFAULT_ANON_NICK } from "@/lib/anon";
import { isValidCategory } from "@/lib/categories";

export type FormState = { error?: string } | undefined;

export async function createPost(_prev: FormState, formData: FormData): Promise<FormState> {
  const category = String(formData.get("category") ?? "GENERAL");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const asAnon = formData.get("asAnon") === "on";
  const anonNick = String(formData.get("anonNick") ?? "").trim() || DEFAULT_ANON_NICK;
  const anonPass = String(formData.get("anonPass") ?? "");
  const imageIds = String(formData.get("imageIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 10);

  if (!isValidCategory(category)) return { error: "잘못된 말머리입니다." };
  if (title.length < 1 || title.length > 100)
    return { error: "제목은 1~100자로 입력해주세요." };
  if (content.length < 1 || content.length > 10000)
    return { error: "내용을 입력해주세요. (최대 10000자)" };

  const user = await getCurrentUser();
  const writeAsMember = user && !asAnon;

  if (category === "NOTICE" && !user)
    return { error: "공지는 로그인 후 작성할 수 있습니다." };

  let newId: number;

  if (writeAsMember) {
    const post = await prisma.post.create({
      data: { category, title, content, authorId: user!.id },
    });
    newId = post.id;
  } else {
    // 익명 작성
    if (anonPass && (anonPass.length < 3 || anonPass.length > 20))
      return { error: "익명 비밀번호는 3~20자로 입력해주세요." };
    const post = await prisma.post.create({
      data: {
        category,
        title,
        content,
        anonNick,
        anonIp: await getMaskedIp(),
        anonPass: anonPass ? await hashPassword(anonPass) : null,
      },
    });
    newId = post.id;
  }

  // 업로드해 둔 이미지(아직 글에 연결 안 됨)를 이 글에 연결
  if (imageIds.length > 0) {
    await prisma.image.updateMany({
      where: { id: { in: imageIds }, postId: null },
      data: { postId: newId },
    });
  }

  revalidatePath("/");
  redirect(`/post/${newId}`);
}

export async function deletePost(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id) return;

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) return;

  const user = await getCurrentUser();

  // 회원 글: 본인만
  if (post.authorId) {
    if (!user || user.id !== post.authorId) return;
  } else {
    // 익명 글: 비밀번호 일치해야
    if (!post.anonPass || !(await verifyPassword(password, post.anonPass))) return;
  }

  await prisma.post.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}
