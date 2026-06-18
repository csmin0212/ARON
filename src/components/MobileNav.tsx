"use client";

import { useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

export default function MobileNav({
  loggedIn,
  username,
}: {
  loggedIn: boolean;
  username?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const itemClass =
    "block rounded-xl px-3 py-2.5 text-sm font-bold text-content transition hover:bg-subtle-hover";

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="메뉴"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-lg text-xl text-content transition hover:bg-subtle-hover"
      >
        ☰
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute right-0 top-12 z-50 w-44 rounded-2xl border border-line bg-surface p-2 shadow-xl">
            <Link href="/world" onClick={close} className={itemClass}>
              🗺️ 월드
            </Link>
            <Link href="/collection" onClick={close} className={itemClass}>
              📖 도감
            </Link>
            <Link href="/hall" onClick={close} className={itemClass}>
              🏛️ 명예의 전당
            </Link>
            {loggedIn ? (
              <>
                <Link href="/write" onClick={close} className={itemClass}>
                  ✏️ 글쓰기
                </Link>
                {username && (
                  <Link
                    href={`/u/${encodeURIComponent(username)}`}
                    onClick={close}
                    className={itemClass}
                  >
                    🙂 내 프로필
                  </Link>
                )}
                <form action={logout}>
                  <button type="submit" className={`${itemClass} w-full text-left text-faint`}>
                    로그아웃
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" onClick={close} className={itemClass}>
                  로그인
                </Link>
                <Link href="/register" onClick={close} className={itemClass}>
                  회원가입
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
