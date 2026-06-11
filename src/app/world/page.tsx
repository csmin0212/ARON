import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { AP_MAX, RESET_HOUR_KST, effectiveAp } from "@/lib/world";
import { enterWorld, moveTo } from "@/app/actions/world";
import Avatar from "@/components/Avatar";
import WorldAdmin from "@/components/WorldAdmin";

export const metadata = { title: "월드 · 아리안로드 온라인 갤러리" };

function ApBar({ ap }: { ap: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="text-lg">⚡</span>
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-bold text-content">행동치</span>
          <span className="font-semibold text-muted">
            {ap} / {AP_MAX}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-subtle-hover">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all"
            style={{ width: `${(ap / AP_MAX) * 100}%` }}
          />
        </div>
      </div>
      <span className="text-[11px] text-faint">매일 오전 {RESET_HOUR_KST}시 회복</span>
    </div>
  );
}

export default async function WorldPage() {
  const user = await getCurrentUser();
  const isGm = isGmUsername(user?.username);

  // 비로그인
  if (!user) {
    return (
      <Gate emoji="🗺️" title="월드에 입장하려면 로그인이 필요해요">
        <Link href="/login" className="font-bold text-brand-600 hover:underline">
          로그인하러 가기 →
        </Link>
      </Gate>
    );
  }

  const sheet = await prisma.characterSheet.findUnique({ where: { userId: user.id } });

  // 시트 미연동
  if (!sheet) {
    return (
      <Gate emoji="📜" title="캐릭터 시트를 먼저 연동해주세요">
        <p className="mb-3 text-sm text-faint">월드는 캐릭터의 능력치로 플레이해요.</p>
        <Link href="/profile" className="font-bold text-brand-600 hover:underline">
          프로필에서 연동하기 →
        </Link>
      </Gate>
    );
  }

  const locationCount = await prisma.location.count();

  // 맵 미구축
  if (locationCount === 0) {
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <Gate emoji="🚧" title="월드 준비 중이에요">
          <p className="text-sm text-faint">GM이 맵을 만들고 있어요. 조금만 기다려주세요!</p>
        </Gate>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  const ap = effectiveAp(sheet.ap, sheet.apResetAt);
  const here = sheet.locationId
    ? await prisma.location.findUnique({ where: { id: sheet.locationId } })
    : null;

  // 미입장 (또는 맵 교체로 위치가 사라짐)
  if (!here) {
    const start = await prisma.location.findFirst({ where: { isStart: true } });
    return (
      <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-6">
        <div className="rounded-3xl border border-line bg-surface p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">{start?.emoji ?? "🗺️"}</div>
          <h1 className="text-xl font-extrabold text-content">모험을 시작해볼까요?</h1>
          <p className="mt-2 text-sm text-faint">
            {start ? `시작 지점: ${start.name}` : "시작 지점이 설정되지 않았어요."}
          </p>
          {start && (
            <form action={enterWorld} className="mt-5">
              <button
                type="submit"
                className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
              >
                ⚔️ 월드 입장
              </button>
            </form>
          )}
        </div>
        {isGm && <WorldAdmin />}
      </div>
    );
  }

  // 연결된 장소 (히든은 발견한 곳만)
  let connIds: string[] = [];
  try {
    connIds = here.connJson ? (JSON.parse(here.connJson) as string[]) : [];
  } catch {
    connIds = [];
  }
  let discovered: string[] = [];
  try {
    discovered = sheet.discoveredJson ? (JSON.parse(sheet.discoveredJson) as string[]) : [];
  } catch {
    discovered = [];
  }
  const destinations = (
    await prisma.location.findMany({ where: { id: { in: connIds } }, orderBy: { order: "asc" } })
  ).filter((d) => !d.hidden || discovered.includes(d.id));

  // 같은 장소의 다른 모험가들 (최근 활동순)
  const others = await prisma.characterSheet.findMany({
    where: { locationId: here.id, userId: { not: user.id } },
    include: { user: { select: { username: true, nickname: true, avatar: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  const canMove = ap > 0;

  return (
    <div className="mx-auto max-w-xl animate-fadeup space-y-4 py-2">
      <ApBar ap={ap} />

      {/* 현재 장소 */}
      <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-7 text-white">
          <p className="text-xs font-semibold text-white/70">현재 위치</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold">
            <span>{here.emoji ?? "📍"}</span> {here.name}
          </h1>
        </div>
        {here.desc && (
          <p className="whitespace-pre-wrap px-6 py-5 text-[15px] leading-relaxed text-content">
            {here.desc}
          </p>
        )}
      </div>

      {/* 이동 */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-content">
          🧭 이동 <span className="ml-1 text-xs font-normal text-faint">(행동치 1 소모)</span>
        </h2>
        {destinations.length === 0 ? (
          <p className="py-3 text-center text-sm text-faint">여기서 이동할 수 있는 곳이 없어요.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {destinations.map((d) => (
              <form key={d.id} action={moveTo}>
                <input type="hidden" name="target" value={d.id} />
                <button
                  type="submit"
                  disabled={!canMove}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="text-2xl">{d.emoji ?? "📍"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-content">{d.name}</span>
                    {d.hidden && (
                      <span className="text-[11px] font-semibold text-violet-500">✨ 발견한 장소</span>
                    )}
                  </span>
                  <span className="ml-auto text-faint2">→</span>
                </button>
              </form>
            ))}
          </div>
        )}
        {!canMove && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-600">
            ⚡ 행동치가 다 떨어졌어요. 매일 오전 {RESET_HOUR_KST}시에 회복돼요.
          </p>
        )}
      </div>

      {/* 이곳의 모험가들 */}
      <div className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-content">
          👥 이곳의 모험가 <span className="text-brand-500">{others.length + 1}</span>
        </h2>
        <ul className="space-y-2">
          <li className="flex items-center gap-2.5 rounded-xl bg-brand-50/60 px-3 py-2">
            <Avatar name={user.nickname} avatar={user.avatar} size={28} />
            <span className="text-sm font-bold text-content">{user.nickname}</span>
            <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
              나
            </span>
          </li>
          {others.map((o) => (
            <li key={o.userId} className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition hover:bg-subtle">
              <Avatar name={o.user.nickname} avatar={o.user.avatar} size={28} />
              <Link
                href={`/u/${encodeURIComponent(o.user.username)}`}
                className="text-sm font-bold text-content transition hover:text-brand-600 hover:underline"
              >
                {o.user.nickname}
              </Link>
              {o.sheetTab && <span className="text-xs text-faint">({o.sheetTab})</span>}
            </li>
          ))}
        </ul>
        {others.length === 0 && (
          <p className="mt-1 px-3 text-xs text-faint">지금은 혼자예요. 다른 모험가를 기다려보세요!</p>
        )}
      </div>

      {isGm && <WorldAdmin />}
    </div>
  );
}

function Gate({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-xl animate-fadeup py-6">
      <div className="rounded-3xl border border-line bg-surface p-10 text-center shadow-sm">
        <div className="mb-3 text-5xl">{emoji}</div>
        <h1 className="mb-2 text-xl font-extrabold text-content">{title}</h1>
        {children}
      </div>
    </div>
  );
}
