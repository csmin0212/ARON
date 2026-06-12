import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectionItems, isSeaLifeItem, type LifeSkillKind } from "@/lib/lifeSkillData";

export const metadata = { title: "도감 · 아리안로드 온라인 갤러리" };

const KIND_LABEL: Record<LifeSkillKind, { title: string; emoji: string }> = {
  채집: { title: "채집 도감", emoji: "🌿" },
  낚시: { title: "낚시 도감", emoji: "🎣" },
};

export default async function CollectionPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <div className="rounded-3xl border border-line bg-surface p-8 shadow-sm">
          <div className="mb-3 text-5xl">📖</div>
          <h1 className="text-xl font-extrabold text-content">도감을 보려면 로그인이 필요해요</h1>
          <Link href="/login" className="mt-4 inline-block font-bold text-brand-600 hover:underline">
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  const items = collectionItems(false);
  const itemNames = items.map(({ item }) => item.name);
  const entries = await prisma.inventoryEntry.findMany({
    where: { userId: user.id, itemId: { in: itemNames } },
    select: { itemId: true },
  });
  const discovered = new Set(entries.map((entry) => entry.itemId));
  const found = items.filter(({ item }) => discovered.has(item.name)).length;
  const pct = items.length > 0 ? Math.round((found / items.length) * 1000) / 10 : 0;

  const byKind: Record<LifeSkillKind, typeof items> = {
    채집: items.filter((entry) => entry.kind === "채집"),
    낚시: items.filter((entry) => entry.kind === "낚시"),
  };

  return (
    <div className="animate-fadeup space-y-5 py-1">
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-faint">Collection</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-content">생활 도감</h1>
            <p className="mt-1 text-sm text-muted">
              현재 층에서 발견 가능한 채집물과 민물 어종 기준입니다.
            </p>
          </div>
          <div className="rounded-2xl bg-brand-50 px-4 py-2 text-right">
            <p className="text-xs font-bold text-brand-600">총 진행률</p>
            <p className="text-xl font-black text-brand-700">
              {pct}% <span className="text-sm font-bold text-brand-500">({found}/{items.length})</span>
            </p>
          </div>
        </div>
      </div>

      {(["채집", "낚시"] as LifeSkillKind[]).map((kind) => {
        const group = byKind[kind];
        const groupFound = group.filter(({ item }) => discovered.has(item.name)).length;
        const meta = KIND_LABEL[kind];
        return (
          <section key={kind} className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-content">
                {meta.emoji} {meta.title}
              </h2>
              <span className="rounded-full bg-subtle px-3 py-1 text-xs font-extrabold text-muted">
                {groupFound}/{group.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.map(({ item }) => {
                const open = discovered.has(item.name);
                return (
                  <div
                    key={`${kind}-${item.name}`}
                    className={`rounded-2xl border px-4 py-3 ${
                      open
                        ? "border-line bg-subtle/55"
                        : "border-dashed border-line bg-subtle/25 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-content">
                          {open ? item.name : "???"}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-faint">
                          {item.rarity} · {open ? `판매가 ${item.price}G` : "미발견"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                        R{item.rank}
                      </span>
                    </div>
                    {open && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                        {item.text}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="px-1 text-xs text-faint">
        바다 어종 {collectionItems(true).filter(({ item }) => isSeaLifeItem(item)).length}종은
        아직 상위 지역 전용으로 잠겨 있어요.
      </p>
    </div>
  );
}
