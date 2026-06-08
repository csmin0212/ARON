import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import Avatar from "./Avatar";
import ThemeControls from "./ThemeControls";
import {
  THEME_COOKIE,
  ACCENT_COOKIE,
  DEFAULT_THEME,
  DEFAULT_ACCENT,
  isThemeMode,
  isHexColor,
} from "@/lib/theme";

export default async function Header() {
  const user = await getCurrentUser();
  const store = await cookies();
  const themeCookie = store.get(THEME_COOKIE)?.value;
  const accentCookie = store.get(ACCENT_COOKIE)?.value;
  const theme = isThemeMode(themeCookie) ? themeCookie : DEFAULT_THEME;
  const accent = isHexColor(accentCookie) ? accentCookie : DEFAULT_ACCENT;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg shadow-sm ring-1 ring-black/5">
            ⚔️
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-extrabold tracking-tight text-content group-hover:text-brand-600">
              아리안로드 온라인 갤러리
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-faint">
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

          <ThemeControls initialTheme={theme} initialAccent={accent} />

          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href={`/u/${encodeURIComponent(user.username)}`}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-subtle-hover"
              >
                <Avatar name={user.nickname} avatar={user.avatar} size={30} />
                <span className="max-w-[90px] truncate text-sm font-semibold text-content">
                  {user.nickname}
                </span>
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-lg px-2.5 py-2 text-faint transition hover:bg-subtle-hover hover:text-content"
                >
                  로그아웃
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 font-semibold text-content transition hover:bg-subtle-hover"
              >
                로그인
              </Link>
              <Link
                href="/register"
                className="rounded-lg border border-line px-3 py-2 font-semibold text-content transition hover:bg-subtle"
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
