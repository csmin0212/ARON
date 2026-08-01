"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isGmUsername } from "@/lib/gm";
import { clearServerLogs } from "@/lib/serverLog";

export async function clearServerLogAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isGmUsername(user.username)) notFound();
  await clearServerLogs();
  revalidatePath("/admin/logs");
}
