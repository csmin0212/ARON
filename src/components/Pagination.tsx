import Link from "next/link";

export default function Pagination({
  current,
  totalPages,
  makeHref,
}: {
  current: number;
  totalPages: number;
  makeHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, current - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const base =
    "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-semibold transition";

  return (
    <nav className="mt-5 flex items-center justify-center gap-1.5">
      {current > 1 && (
        <Link href={makeHref(current - 1)} className={`${base} bg-surface text-muted ring-1 ring-line hover:bg-subtle`}>
          ‹
        </Link>
      )}
      {start > 1 && (
        <Link href={makeHref(1)} className={`${base} bg-surface text-muted ring-1 ring-line hover:bg-subtle`}>
          1
        </Link>
      )}
      {start > 2 && <span className="px-1 text-faint2">…</span>}

      {pages.map((p) =>
        p === current ? (
          <span key={p} className={`${base} bg-brand-500 text-white shadow-sm`}>
            {p}
          </span>
        ) : (
          <Link key={p} href={makeHref(p)} className={`${base} bg-surface text-muted ring-1 ring-line hover:bg-subtle`}>
            {p}
          </Link>
        ),
      )}

      {end < totalPages - 1 && <span className="px-1 text-faint2">…</span>}
      {end < totalPages && (
        <Link href={makeHref(totalPages)} className={`${base} bg-surface text-muted ring-1 ring-line hover:bg-subtle`}>
          {totalPages}
        </Link>
      )}
      {current < totalPages && (
        <Link href={makeHref(current + 1)} className={`${base} bg-surface text-muted ring-1 ring-line hover:bg-subtle`}>
          ›
        </Link>
      )}
    </nav>
  );
}
