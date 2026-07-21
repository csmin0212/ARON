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
import { isHexColor } from "@/lib/theme";
import {
  profileVisibilityFromForm,
  uniqueFeaturedAchievementIds,
} from "@/lib/profile";
import { normalizeCardStyle } from "@/lib/profileCard";

export type FormState = { error?: string } | undefined;

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

// 커버 이미지 주소 검증 — 빈값이면 null(제거), 업로드 이미지(/api/image/..)나
// http(s) 링크면 허용, 그 외엔 undefined(거부).
function cleanCover(v: string): string | null | undefined {
  if (!v) return null;
  if (v.length > 800) return undefined;
  if (v.startsWith("/api/image/")) return v;
  if (/^https?:\/\//i.test(v)) return v;
  return undefined;
}

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
  const statusRaw = String(formData.get("profileStatus") ?? "").trim();

  if (nickname.length < 1 || nickname.length > 12)
    return { error: "닉네임은 1~12자로 입력해주세요." };
  if (statusRaw.length > 20) return { error: "상태 표시는 20자 이내로 입력해주세요." };

  const colorRaw = String(formData.get("profileColor") ?? "").trim();
  const profileColor = isHexColor(colorRaw) ? colorRaw : null;

  const profileCover = cleanCover(String(formData.get("profileCover") ?? "").trim());
  if (profileCover === undefined)
    return { error: "커버 이미지 주소가 올바르지 않아요. (http(s) 링크 또는 업로드 이미지)" };

  const requestedAchievementIds = uniqueFeaturedAchievementIds(
    formData.getAll("featuredAchievementId").map((value) => String(value)),
  );
  const earnedRows =
    requestedAchievementIds.length > 0
      ? await prisma.userAchievement.findMany({
          where: { userId: user.id, achId: { in: requestedAchievementIds } },
          select: { achId: true },
        })
      : [];
  const earnedIds = new Set(earnedRows.map((row) => row.achId));
  const featuredAchievementIds = requestedAchievementIds.filter((id) => earnedIds.has(id));
  const mainAchievement =
    featuredAchievementIds.length > 0
      ? await prisma.achievement.findUnique({
          where: { id: featuredAchievementIds[0] },
          select: { rewardTitle: true, badge: true },
        })
      : null;
  const visibility = profileVisibilityFromForm(formData);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      nickname,
      avatar: avatar || null,
      profileStatus: statusRaw || null,
      profileColor,
      profileCover,
      profileVisibilityJson: JSON.stringify(visibility),
      featuredAchievementsJson: JSON.stringify(featuredAchievementIds),
      equippedTitle: mainAchievement?.rewardTitle ?? null,
      equippedBadge: mainAchievement?.badge ?? null,
    },
  });

  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}

export async function updateProfileCardStyle(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const style = normalizeCardStyle(String(formData.get("cardStyle") ?? ""));
  await prisma.user.update({
    where: { id: user.id },
    data: { profileCardStyle: style },
  });

  revalidatePath("/", "layout");
  redirect("/profile/card?saved=1");
}
