import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARKET_FEE_RATE } from "@/lib/market";
import { lifeSkillItemKind } from "@/lib/lifeSkillData";
import type { SheetInventory } from "@/lib/googleSheets";
import MarketPanel, {
  type MarketItemOption,
  type MarketListingView,
} from "@/components/MarketPanel";

export const metadata = { title: "거래소 · 아리안로드 온라인 갤러리" };

function parseInv(json: string | null): SheetInventory {
  try {
    if (json) return JSON.parse(json) as SheetInventory;
  } catch {
    // fallthrough
  }
  return { gold: null, curWeight: null, maxWeight: null, items: [] };
}

export default async function MarketPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sheet, rows] = await Promise.all([
    prisma.characterSheet.findUnique({
      where: { userId: user.id },
      select: { invJson: true, curGold: true },
    }),
    prisma.marketListing.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const inv = parseInv(sheet?.invJson ?? null);
  // 생활 가방 전용 아이템은 제외하고, 같은 이름은 합산
  const itemMap = new Map<string, number>();
  for (const it of inv.items) {
    if (it.qty <= 0 || lifeSkillItemKind(it.name)) continue;
    itemMap.set(it.name.trim(), (itemMap.get(it.name.trim()) ?? 0) + it.qty);
  }
  const myItems: MarketItemOption[] = [...itemMap.entries()]
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const listings: MarketListingView[] = rows.map((l) => ({
    id: l.id,
    sellerName: l.sellerName,
    itemName: l.itemName,
    itemEffect: l.itemEffect,
    qty: l.qty,
    price: l.price,
    isMine: l.sellerId === user.id,
  }));

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MARKET</p>
        <h1 className="mt-1 text-2xl font-black text-content">🏪 거래소</h1>
        <p className="mt-1 text-sm text-faint">
          물건을 등록해 팔거나, 다른 모험가의 매물을 골드로 구매합니다.
        </p>
      </section>

      <MarketPanel
        myItems={myItems}
        myGold={sheet?.curGold ?? 0}
        listings={listings}
        feePercent={Math.round(MARKET_FEE_RATE * 100)}
      />
    </div>
  );
}
