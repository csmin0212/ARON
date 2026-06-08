import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 sm:px-4">{children}</main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
            아리안로드 온라인 갤러리 · 팬 제작 비공식 커뮤니티 · 본 사이트는 디시인사이드와
            무관합니다
          </div>
        </footer>
      </body>
    </html>
  );
}
