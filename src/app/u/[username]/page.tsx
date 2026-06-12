import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { formatFullDate } from "@/lib/format";
import type { StatEntry } from "@/lib/charsheet";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import Avatar from "@/components/Avatar";
import CharacterSheetCard from "@/components/CharacterSheetCard";
import CharacterTabs from "@/components/CharacterTabs";
import DiceRoller from "@/components/DiceRoller";
import LifeSkillPanel from "@/components/LifeSkillPanel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const user = await prisma.user.findUnique({
    where: { username: decodeURIComponent(username) },
    select: { nickname: true },
  });
  return { title: user ? `${user.nickname} · 캐릭터` : "캐릭터" };
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const uname = decodeURIComponent(username);

  const profile = await prisma.user.findUnique({
    where: { username: uname },
    include: { sheet: true },
  });
  if (!profile) notFound();

  const me = await getCurrentUser();
  const isOwn = me?.id === profile.id;

  const [rolls, invEntries] = await Promise.all([
    prisma.roll.findMany({
      where: { userId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.inventoryEntry.findMany({
      where: { userId: profile.id, qty: { gt: 0 } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const itemMap = new Map(
    (
      await prisma.item.findMany({
        where: { id: { in: invEntries.map((e) => e.itemId) } },
        select: { id: true, name: true, category: true },
      })
    ).map((it) => [it.id, it]),
  );

  let stats: StatEntry[] = [];
  if (profile.sheet?.statsJson) {
    try {
      stats = JSON.parse(profile.sheet.statsJson) as StatEntry[];
    } catch {
      stats = [];
    }
  }

  const life = parseLifeState(profile.sheet?.lifeJson);
  const pendingCount = isOwn ? life.pending.length : 0;

  // ── 탭 내용 ──
  const sheetTab = (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-extrabold text-content">캐릭터 시트</h2>
      {profile.sheet ? (
        <CharacterSheetCard sheet={{ ...profile.sheet, charName: profile.nickname }} />
      ) : (
        <p className="py-6 text-center text-sm text-faint">
          아직 캐릭터 시트를 연동하지 않았어요.
          {isOwn && (
            <>
              {" "}
              <Link href="/profile" className="font-semibold text-brand-600 hover:underline">
                지금 연동하기
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );

  const combatTab = (
    <>
      {isOwn && stats.length > 0 && (
        <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-extrabold text-content">🎲 능력치 판정</h2>
          <p className="mb-4 text-sm text-faint">능력치를 눌러 2D6 + 수정치를 굴려요.</p>
          <DiceRoller stats={stats} />
        </div>
      )}

      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-extrabold text-content">최근 굴림 기록</h2>
        {rolls.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">아직 굴린 기록이 없어요.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rolls.map((r) => {
              let dice: number[] = [];
              try {
                dice = JSON.parse(r.dice) as number[];
              } catch {
                dice = [];
              }
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-content">{r.label}</span>
                    <span className="ml-2 text-xs text-faint">
                      🎲 {dice.join("+")}
                      {r.modifier !== 0 && (r.modifier > 0 ? `+${r.modifier}` : r.modifier)} ={" "}
                      <b className="text-content">{r.total}</b>
                      {r.dc != null && ` / DC ${r.dc}`}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.success === true && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600">
                        성공
                      </span>
                    )}
                    {r.success === false && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-500">
                        실패
                      </span>
                    )}
                    <span className="text-[11px] text-faint2">{formatFullDate(r.createdAt)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  const lifeTab = (
    <>
      <LifeSkillPanel life={life} isOwn={isOwn} />

      {/* 가방 */}
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <h2 className="mb-3 flex items-center justify-between text-lg font-extrabold text-content">
          <span>🎒 가방</span>
          <span className="text-sm font-bold text-emerald-500">
            {(profile.sheet?.curGold ?? 0).toLocaleString()}G
          </span>
        </h2>
        {invEntries.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">가방이 비어 있어요.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {invEntries.map((e) => {
              const it = itemMap.get(e.itemId);
              return (
                <li
                  key={e.id}
                  className="rounded-lg bg-subtle px-2.5 py-1 text-xs font-semibold text-content"
                  title={it?.category ?? undefined}
                >
                  {it?.name ?? e.itemId} <span className="text-faint">x{e.qty}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <Avatar name={profile.nickname} avatar={profile.avatar} size={64} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-content">{profile.nickname}</h1>
          <p className="text-sm text-faint">@{profile.username}</p>
        </div>
        {isOwn && (
          <Link
            href="/profile"
            className="ml-auto rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:bg-subtle"
          >
            프로필 편집
          </Link>
        )}
      </div>

      <CharacterTabs
        tabs={[
          { key: "sheet", label: "📜 캐릭터 시트", content: sheetTab },
          { key: "combat", label: "⚔️ 전투 데이터", content: combatTab },
          { key: "life", label: "🌿 생활 데이터", content: lifeTab },
        ]}
        badges={{ life: pendingCount }}
      />
    </div>
  );
}
