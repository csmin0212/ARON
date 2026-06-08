import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

const TABS = [
  { key: "ALL", tab: "전체글" },
  { key: "BEST", tab: "개념글" },
  ...CATEGORIES.map((c) => ({ key: c.key, tab: c.tab })),
];

export default function CategoryTabs({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TABS.map((t) => {
        const active = current === t.key;
        const href = t.key === "ALL" ? "/" : `/?tab=${t.key}`;
        const isBest = t.key === "BEST";
        return (
          <Link
            key={t.key}
            href={href}
            className={
              active
                ? `rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-sm ${
                    isBest ? "bg-rose-500" : "bg-brand-500"
                  }`
                : `rounded-full bg-white px-4 py-1.5 text-sm font-semibold ring-1 ring-line transition hover:bg-slate-50 ${
                    isBest ? "text-rose-500 hover:text-rose-600" : "text-slate-500 hover:text-slate-700"
                  }`
            }
          >
            {isBest && "🔥 "}
            {t.tab}
          </Link>
        );
      })}
    </div>
  );
}
