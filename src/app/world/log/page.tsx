import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { getLocationsBrief } from "@/lib/gameCatalog";
import { ACTIVITY_KINDS } from "@/lib/activityLog";

export const metadata = { title: "활동 로그 · 아리안로드 온라인 갤러리" };

const PAGE_SIZE = 100;

type SearchParams = {
  loc?: string;
  who?: string;
  kind?: string;
  q?: string;
  page?: string;
};

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await getCurrentUser();
  // GM 전용 — 다른 캐릭터의 기록까지 다 보이므로 일반 계정에는 존재 자체를 숨긴다.
  if (!user || !isGmUsername(user.username)) notFound();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const loc = sp.loc?.trim() || "";
  const who = sp.who?.trim() || "";
  const kind = sp.kind?.trim() || "";
  const q = sp.q?.trim() || "";

  const where = {
    ...(loc ? { locationId: loc } : {}),
    ...(who ? { userId: who } : {}),
    ...(kind ? { kind } : {}),
    ...(q ? { content: { contains: q } } : {}),
  };

  const [rows, total, locations, actors] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        actorName: true,
        locationId: true,
        kind: true,
        content: true,
      },
    }),
    prisma.activityLog.count({ where }),
    getLocationsBrief(),
    // 필터 드롭다운용 캐릭터 목록 — 로그를 남긴 적 있는 사람만
    prisma.activityLog.groupBy({
      by: ["userId", "actorName"],
      where: { userId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
  ]);

  const locName = new Map(locations.map((l) => [l.id, l.name]));
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (patch: Partial<SearchParams>) => {
    const next = new URLSearchParams();
    const merged = { loc, who, kind, q, page: String(page), ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "1") next.set(k, String(v));
    const s = next.toString();
    return s ? `/world/log?${s}` : "/world/log";
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-black text-content">활동 로그</h1>
        <p className="text-xs font-bold text-faint">
          총 {total.toLocaleString()}건 · {page}/{pageCount} 페이지
        </p>
      </header>

      <form method="get" className="mb-5 grid gap-2 sm:grid-cols-5">
        <select
          name="loc"
          defaultValue={loc}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content"
        >
          <option value="">전체 맵</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select
          name="who"
          defaultValue={who}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content"
        >
          <option value="">전체 캐릭터</option>
          {actors.map((a) => (
            <option key={`${a.userId}-${a.actorName}`} value={a.userId ?? ""}>
              {a.actorName ?? "(이름 없음)"} ({a._count._all})
            </option>
          ))}
        </select>
        <select
          name="kind"
          defaultValue={kind}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold text-content"
        >
          <option value="">전체 종류</option>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="내용 검색"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-black text-white transition hover:bg-brand-600"
        >
          검색
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="bg-surface-2 text-xs font-black text-muted">
            <tr>
              <th className="px-3 py-2">시각</th>
              <th className="px-3 py-2">캐릭터</th>
              <th className="px-3 py-2">맵</th>
              <th className="px-3 py-2">종류</th>
              <th className="px-3 py-2">내용</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted">
                  조건에 맞는 기록이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-faint">
                  {r.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-bold text-content">
                  {r.actorName ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {r.locationId ? (locName.get(r.locationId) ?? r.locationId) : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs font-bold text-muted">
                  {r.kind}
                </td>
                <td className="px-3 py-2 text-content">{r.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="mt-4 flex items-center justify-between text-sm font-bold">
        {page > 1 ? (
          <Link href={qs({ page: String(page - 1) })} className="text-brand-500 hover:underline">
            ← 이전
          </Link>
        ) : (
          <span />
        )}
        {page < pageCount ? (
          <Link href={qs({ page: String(page + 1) })} className="text-brand-500 hover:underline">
            다음 →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
