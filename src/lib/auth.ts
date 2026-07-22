import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";

const COOKIE_NAME = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET 환경변수가 설정되지 않았습니다.");
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// 로그인 세션 발급 (JWT → httpOnly 쿠키)
export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type SessionUser = {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  profileStatus: string | null;
  profileColor: string | null;
  profileCover: string | null;
  profileVisibilityJson: string | null;
  profileCardStyle: string | null;
  profileMain: string | null;
  profileWidgetsJson: string | null;
  ownedCardSkinsJson: string | null;
  featuredAchievementsJson: string | null;
  equippedTitle: string | null;
  equippedBadge: string | null;
};

// 세션 uid만 — JWT 검증만으로 얻으므로 DB를 전혀 안 친다.
// 초당 수십 번 도는 폴링 라우트(chat/presence/rift GET)에서 유저 행 재조회 egress를 없앤다.
export const getSessionUid = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.uid as string) || null;
  } catch {
    return null;
  }
});

// 현재 로그인 유저 (요청 단위 캐시)
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const uid = payload.uid as string;
    if (!uid) return null;
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        profileStatus: true,
        profileColor: true,
        profileCover: true,
        profileVisibilityJson: true,
        profileCardStyle: true,
        profileMain: true,
        profileWidgetsJson: true,
        ownedCardSkinsJson: true,
        featuredAchievementsJson: true,
        equippedTitle: true,
        equippedBadge: true,
      },
    });
    return user;
  } catch {
    return null;
  }
});
