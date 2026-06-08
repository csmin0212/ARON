"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { getMaskedIp, DEFAULT_ANON_NICK } from "@/lib/anon";

export type CommentState = { error?: string; ok?: boolean } | undefined;

export async function createComment(
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const postId = Number(formData.get("postId"));
  const parentRaw = formData.get("parentId");
  const parentId = parentRaw ? Number(parentRaw) : null;
  const content = String(formData.get("content") ?? "").trim();
  const asAnon = formData.get("asAnon") === "on";
  const anonNick = String(formData.get("anonNick") ?? "").trim() || DEFAULT_ANON_NICK;
  const anonPass = String(formData.get("anonPass") ?? "");

  if (!postId) return { error: "잘못된 요청입니다." };
  if (content.length < 1) return { error: "댓글 내용을 입력해주세요." };
  if (content.length > 2000) return { error: "댓글은 2000자 이하로 입력해주세요." };

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });
  if (!post) return { error: "존재하지 않는 게시글입니다." };

  // 대댓글이면 parent 가 같은 글에 속하는지 확인
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { postId: true },
    });
    if (!parent || parent.postId !== postId) return { error: "잘못된 대댓글 대상입니다." };
  }

  const user = await getCurrentUser();
  const asMember = user && !asAnon;

  if (asMember) {
    await prisma.comment.create({
      data: {
        postId,
        parentId,
        content,
        authorId: user!.id,
        isAuthorPost: post.authorId === user!.id,
      },
    });
  } else {
    if (anonPass && (anonPass.length < 3 || anonPass.length > 20))
      return { error: "익명 비밀번호는 3~20자로 입력해주세요." };
    await prisma.comment.create({
      data: {
        postId,
        parentId,
        content,
        anonNick,
        anonIp: await getMaskedIp(),
        anonPass: anonPass ? await hashPassword(anonPass) : null,
      },
    });
  }

  revalidatePath(`/post/${postId}`);
  return { ok: true };
}

export async function deleteComment(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id) return;

  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return;

  const user = await getCurrentUser();

  if (comment.authorId) {
    if (!user || user.id !== comment.authorId) return;
  } else {
    if (!comment.anonPass || !(await verifyPassword(password, comment.anonPass))) return;
  }

  // 소프트 삭제 (대댓글 트리 유지)
  await prisma.comment.update({
    where: { id },
    data: { isDeleted: true, content: "(삭제된 댓글입니다)" },
  });
  revalidatePath(`/post/${comment.postId}`);
}
