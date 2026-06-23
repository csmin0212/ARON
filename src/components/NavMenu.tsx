"use client";

import { useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "/world", label: "🗺️ 월드" },
  { href: "/collection", label: "📖 도감" },
  { href: "/hall", label: "🏛️ 명예의 전당" },
  { href: "/market", label: "🏪 경매장" },
];

// 데스크톱 전용 섹션 메뉴 드롭다운 — 항목이 늘어도 헤더 폭에 영향 없게.
export default function NavMenu() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 font-bold text-content transition hover:bg-subtle-hover hover:text-brand-600"
      >
        🧭 메뉴
        <span className={`text-[10px] transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
          <div className="absolute left-0 top-12 z-50 w-44 rounded-2xl border border-line bg-surface p-2 shadow-xl">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="block whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-bold text-content transition hover:bg-subtle-hover hover:text-brand-600"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
