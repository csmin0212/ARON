import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Header from "@/components/Header";
import {
  THEME_COOKIE,
  ACCENT_COOKIE,
  DEFAULT_THEME,
  DEFAULT_ACCENT,
  isThemeMode,
  isHexColor,
} from "@/lib/theme";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "아리안로드 온라인 갤러리",
  description: "아리안로드 온라인 유저들이 모이는 갤러리 — 정보 공유, 공략, 잡담",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await cookies();
  const themeCookie = store.get(THEME_COOKIE)?.value;
  const accentCookie = store.get(ACCENT_COOKIE)?.value;
  const theme = isThemeMode(themeCookie) ? themeCookie : DEFAULT_THEME;
  const accent = isHexColor(accentCookie) ? accentCookie : DEFAULT_ACCENT;

  return (
    <html
      lang="ko"
      data-theme={theme}
      style={{ "--accent": accent } as React.CSSProperties}
      className={`${notoSansKr.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 sm:px-4">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-faint">
            아리안로드 온라인 갤러리 · 팬 제작 비공식 커뮤니티 · 본 사이트는 디시인사이드와
            무관합니다
          </div>
        </footer>
      </body>
    </html>
  );
}
