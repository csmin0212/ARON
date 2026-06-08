"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getCurrentUser,
} from "@/lib/auth";

export type FormState = { error?: string } | undefined;

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();

  if (!USERNAME_RE.test(username))
    return { error: "아이디는 영문/숫자 4~20자로 입력해주세요." };
  if (password.length < 4) return { error: "비밀번호는 4자 이상이어야 합니다." };
  if (nickname.length < 1 || nickname.length > 12)
    return { error: "닉네임은 1~12자로 입력해주세요." };

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return { error: "이미 사용 중인 아이디입니다." };

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      nickname,
      avatar: "preset:knight",
    },
  });

  await createSession(user.id);
  redirect("/");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) return { error: "아이디와 비밀번호를 입력해주세요." };

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await verifyPassword(password, user.passwordHash)))
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다." };

  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const nickname = String(formData.get("nickname") ?? "").trim();
  const avatar = String(formData.get("avatar") ?? "").trim();

  if (nickname.length < 1 || nickname.length > 12)
    return { error: "닉네임은 1~12자로 입력해주세요." };

  await prisma.user.update({
    where: { id: user.id },
    data: { nickname, avatar: avatar || null },
  });

  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
