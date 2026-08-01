import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { readServerLogs, type ServerLogLevel } from "@/lib/serverLog";
import { clearServerLogAction } from "./actions";

export const metadata = { title: "서버 로그 · 아리안로드 온라인 갤러리" };

const PAGE_SIZE = 80;
const LEVELS: Array<"" | ServerLogLevel> = ["", "error", "warn", "info"];

type SearchParams = {
  level?: string;
  scope?: string;
  q?: string;
  page?: string;
};

function prettyJson(value: string | null): string {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function levelClass(level: string): string {
  if (level === "error") return "bg-rose-50 text-rose-700";
  if (level === "warn") return "bg-amber-50 text-amber-700";
  return "bg-sky-50 text-sky-700";
}

export default async function ServerLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const level = LEVELS.includes(sp.level as "" | ServerLogLevel) ? (sp.level ?? "") : "";
  const scope = sp.scope?.trim() ?? "";
  const q = sp.q?.trim() ?? "";
  const { rows, total } = await readServerLogs({ level, scope, q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (patch: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { level, scope, q, page: String(page), ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "1") next.set(key, String(value));
    }
    const s = next.toString();
    return s ? `/admin/logs?${s}` : "/admin/logs";
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-content">서버 로그</h1>
          <p className="mt-1 text-xs font-bold text-faint">
            console.warn/error를 DB에 복사해 GM이 읽을 수 있게 모읍니다. 총 {total.toLocaleString()}건
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/world/log"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-muted transition hover:bg-subtle"
          >
            활동 로그
          </Link>
          <form action={clearServerLogAction}>
            <button
              type="submit"
              className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-black text-white transition hover:bg-rose-600"
            >
              전체 삭제
            </button>
          </form>
        </div>
      </header>

      <form method="get" className="mb-5 grid gap-2 sm:grid-cols-[9rem_1fr_1.4fr_7rem]">
        <select
          name="level"
          defaultValue={level}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content"
        >
          <option value="">전체 레벨</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
        </select>
        <input
          name="scope"
          defaultValue={scope}
          placeholder="scope 예: console.error"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content outline-none"
        />
        <input
          name="q"
          defaultValue={q}
          placeholder="메시지/메타 검색"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-black text-white transition hover:bg-brand-600"
        >
          검색
        </button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-2xl border border-line bg-surface px-4 py-8 text-center text-sm font-bold text-muted">
            조건에 맞는 서버 로그가 없습니다.
          </div>
        )}
        {rows.map((row) => {
          const meta = prettyJson(row.metaJson);
          return (
            <article key={row.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${levelClass(row.level)}`}>
                  {row.level}
                </span>
                <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-bold text-muted">
                  {row.scope ?? "scope 없음"}
                </span>
                <time className="ml-auto text-[11px] font-bold text-faint">
                  {row.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm font-semibold text-content">
                {row.message}
              </p>
              {meta && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-black text-brand-500">meta 보기</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-subtle p-3 text-xs leading-relaxed text-muted">
                    {meta}
                  </pre>
                </details>
              )}
            </article>
          );
        })}
      </div>

      <nav className="mt-5 flex items-center justify-between text-sm font-bold">
        {page > 1 ? (
          <Link href={qs({ page: String(page - 1) })} className="text-brand-500 hover:underline">
            이전
          </Link>
        ) : (
          <span />
        )}
        <span className="text-xs text-faint">
          {page}/{pageCount}
        </span>
        {page < pageCount ? (
          <Link href={qs({ page: String(page + 1) })} className="text-brand-500 hover:underline">
            다음
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
