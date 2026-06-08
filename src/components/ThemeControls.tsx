"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  type ThemeMode,
} from "@/lib/theme";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export default function ThemeControls({
  initialTheme,
  initialAccent,
}: {
  initialTheme: ThemeMode;
  initialAccent: string;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme);
  const [accent, setAccentState] = useState<string>(initialAccent);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function applyTheme(mode: ThemeMode) {
    document.documentElement.dataset.theme = mode;
    setCookie("theme", mode);
    setThemeState(mode);
  }

  function applyAccent(color: string) {
    document.documentElement.style.setProperty("--accent", color);
    setCookie("accent", color);
    setAccentState(color);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-lg text-faint transition hover:bg-subtle-hover hover:text-content"
        aria-label="테마 설정"
        title="테마 설정"
      >
        {theme === "dark" ? "🌙" : "☀️"}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-60 animate-fadeup rounded-2xl border border-line bg-surface p-4 shadow-xl">
          <p className="mb-2 text-xs font-bold text-faint">화면 모드</p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => applyTheme("light")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                theme === "light"
                  ? "border-brand-400 bg-brand-50 text-brand-600"
                  : "border-line text-muted hover:bg-subtle"
              }`}
            >
              ☀️ 라이트
            </button>
            <button
              onClick={() => applyTheme("dark")}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                theme === "dark"
                  ? "border-brand-400 bg-brand-50 text-brand-600"
                  : "border-line text-muted hover:bg-subtle"
              }`}
            >
              🌙 다크
            </button>
          </div>

          <p className="mb-2 text-xs font-bold text-faint">강조색</p>
          <div className="grid grid-cols-8 gap-1.5">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyAccent(p.color)}
                title={p.label}
                className={`aspect-square rounded-full ring-2 ring-offset-2 ring-offset-surface transition ${
                  accent.toLowerCase() === p.color.toLowerCase()
                    ? "ring-content"
                    : "ring-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: p.color }}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
              <input
                type="color"
                value={accent}
                onChange={(e) => applyAccent(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
              />
              직접 선택
            </label>
            <button
              onClick={() => applyAccent(DEFAULT_ACCENT)}
              className="text-xs font-semibold text-faint transition hover:text-content"
            >
              기본값
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
