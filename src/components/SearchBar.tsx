"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBar({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/?q=${encodeURIComponent(term)}` : "/");
  }

  return (
    <form onSubmit={submit} className="relative w-full sm:w-64">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="제목·내용 검색"
        className="w-full rounded-full border border-line bg-surface py-2 pl-4 pr-10 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
      <button
        type="submit"
        className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-faint transition hover:bg-subtle-hover hover:text-brand-500"
        aria-label="검색"
      >
        🔍
      </button>
    </form>
  );
}
