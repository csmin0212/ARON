import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { collectionItems, isSeaLifeItem, lifeSkillMarketPrice } from "@/lib/lifeSkillData";
import { parseLifeState } from "@/lib/lifeSkillPerks";
import CollectionRankBook, { type CollectionBookEntry } from "@/components/CollectionRankBook";

export const metadata = { title: "도감 · 아리안로드 온라인 갤러리" };

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

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { lifeJson: true },
  });
  const life = parseLifeState(sheet?.lifeJson);
  const items = collectionItems(false);
  const itemNames = items.map(({ item }) => item.name);
  const entries = await prisma.inventoryEntry.findMany({
    where: { userId: user.id, itemId: { in: itemNames } },
    select: { itemId: true, qty: true },
  });
  const inventoryCounts = new Map(entries.map((entry) => [entry.itemId, entry.qty]));
  const discovered = new Set([
    ...entries.map((entry) => entry.itemId),
    ...life.collection.채집,
    ...life.collection.낚시,
  ]);
  const found = items.filter(({ item }) => discovered.has(item.name)).length;
  const pct = items.length > 0 ? Math.round((found / items.length) * 1000) / 10 : 0;
  const bookEntries: CollectionBookEntry[] = items.map(({ kind, item }) => ({
    kind,
    name: item.name,
    rank: item.rank,
    rarity: item.rarity,
    price: lifeSkillMarketPrice(kind, item),
    weight: item.weight,
    text: item.text,
    discovered: discovered.has(item.name),
    count: life.catchCounts[kind][item.name] ?? inventoryCounts.get(item.name) ?? 0,
  }));

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

      <CollectionRankBook entries={bookEntries} />

      <p className="px-1 text-xs text-faint">
        바다 어종 {collectionItems(true).filter(({ item }) => isSeaLifeItem(item)).length}종은
        아직 상위 지역 전용으로 잠겨 있어요.
      </p>
    </div>
  );
}
