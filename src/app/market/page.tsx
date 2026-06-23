import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveListings, getMyListings, getSellableItems } from "@/lib/auctionServer";
import MarketBrowser from "@/components/MarketBrowser";

export const metadata = { title: "경매장 · 아리안로드 온라인 갤러리" };
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [sheet, listings, myListings, sellable] = await Promise.all([
    prisma.characterSheet.findUnique({ where: { userId: user.id }, select: { curGold: true, sheetTab: true } }),
    getActiveListings(),
    getMyListings(user.id),
    getSellableItems(user.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl animate-fadeup py-4">
      <MarketBrowser
        meId={user.id}
        myGold={sheet?.curGold ?? 0}
        linked={!!sheet?.sheetTab}
        listings={listings}
        myListings={myListings}
        sellable={sellable}
      />
    </div>
  );
}
