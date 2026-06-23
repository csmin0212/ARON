"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { checkAndGrant } from "@/lib/achievements";
import { isAuctionSource } from "@/lib/auction";
import {
  buyListingCore,
  cancelListingCore,
  createListingCore,
  type AuctionResult,
} from "@/lib/auctionServer";

export type AuctionState = AuctionResult | undefined;

function toInt(value: FormDataEntryValue | null, fallback = 0): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function refreshMarket(): void {
  revalidatePath("/market");
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}

export async function listOnAuction(_prev: AuctionState, formData: FormData): Promise<AuctionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const sourceRaw = String(formData.get("source") ?? "basic");
  const source = isAuctionSource(sourceRaw) ? sourceRaw : "basic";
  const name = String(formData.get("itemName") ?? "").trim();
  const qty = Math.max(1, Math.min(999, toInt(formData.get("qty"), 1)));
  const unitPrice = Math.max(0, Math.min(9_999_999, toInt(formData.get("unitPrice"), 0)));

  const result = await createListingCore(user.id, { source, name, qty, unitPrice });
  if (result.ok) {
    void checkAndGrant(user.id);
    refreshMarket();
  }
  return result;
}

export async function buyAuctionListing(_prev: AuctionState, formData: FormData): Promise<AuctionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const listingId = String(formData.get("listingId") ?? "").trim();
  const qty = Math.max(1, Math.min(999, toInt(formData.get("qty"), 1)));

  const result = await buyListingCore(user.id, { listingId, qty });
  if (result.ok) {
    void checkAndGrant(user.id);
    refreshMarket();
  }
  return result;
}

export async function cancelAuctionListing(_prev: AuctionState, formData: FormData): Promise<AuctionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const listingId = String(formData.get("listingId") ?? "").trim();
  const result = await cancelListingCore(user.id, listingId);
  if (result.ok) refreshMarket();
  return result;
}
