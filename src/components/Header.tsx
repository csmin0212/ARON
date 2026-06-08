import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import Avatar from "./Avatar";

export default async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-sm ring-1 ring-black/5">
            ⚔️
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-extrabold tracking-tight text-slate-800 group-hover:text-brand-600">
              아리안로드 온라인 갤러리
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-slate-400">
              ArianRod Online Gallery
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/write"
            className="hidden rounded-lg bg-brand-500 px-3.5 py-2 font-semibold text-white shadow-sm transition hover:bg-brand-600 sm:inline-block"
          >
            ✏️ 글쓰기
          </Link>

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-slate-100"
              >
                <Avatar name={user.nickname} avatar={user.avatar} size={30} />
                <span className="max-w-[90px] truncate text-sm font-semibold text-slate-700">
                  {user.nickname}
                </span>
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg px-2.5 py-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  로그아웃
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                로그인
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-line px-3 py-2 font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                회원가입
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
