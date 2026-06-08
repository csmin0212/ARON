"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getClientIp } from "@/lib/anon";

export type VoteResult = { up: number; down: number; my: number };

async function getVoterKey(): Promise<string> {
  const user = await getCurrentUser();
  if (user) return `u:${user.id}`;
  return `ip:${await getClientIp()}`;
}

async function tally(postId: number, my: number): Promise<VoteResult> {
  const [up, down] = await Promise.all([
    prisma.vote.count({ where: { postId, value: 1 } }),
    prisma.vote.count({ where: { postId, value: -1 } }),
  ]);
  return { up, down, my };
}

// value: 1(추천) | -1(비추천). 같은 값 다시 누르면 취소(토글).
export async function votePost(postId: number, value: 1 | -1): Promise<VoteResult> {
  const voterKey = await getVoterKey();
  const user = await getCurrentUser();

  const existing = await prisma.vote.findUnique({
    where: { postId_voterKey: { postId, voterKey } },
  });

  let my: number = value;
  if (!existing) {
    await prisma.vote.create({
      data: { postId, voterKey, value, userId: user?.id ?? null },
    });
  } else if (existing.value === value) {
    await prisma.vote.delete({ where: { id: existing.id } });
    my = 0;
  } else {
    await prisma.vote.update({ where: { id: existing.id }, data: { value } });
  }

  revalidatePath(`/post/${postId}`);
  return tally(postId, my);
}
