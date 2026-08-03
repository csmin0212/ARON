"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { enqueueSheetGoldSync } from "@/lib/sheetGoldSync";
import { postSystem } from "@/lib/play";
import {
  isStarwordCleared,
  isValidStarwordShape,
  judgeStarword,
  starwordDayKey,
  starwordOfDay,
  STARWORD_CLEAR_REWARD,
  STARWORD_ENTRY_FEE,
  STARWORD_MAX_TRIES,
  STARWORD_RANK_REWARDS,
  type StarwordVerdict,
} from "@/lib/starword";
import { isKnownStarword } from "@/lib/starwordGuesses";

export type StarwordRow = { word: string; verdicts: StarwordVerdict[] };

export type StarwordState = {
  error?: string;
  day: string;
  started: boolean;
  rows: StarwordRow[];
  triesLeft: number;
  cleared: boolean;
  failed: boolean;
  /** 끝난 판에서만 정답을 돌려준다 — 진행 중에 노출하면 게임이 성립하지 않는다 */
  answer?: string;
  elapsedMs?: number | null;
  startedAtMs?: number;
};

export type StarwordRankRow = {
  nickname: string;
  username: string;
  elapsedMs: number;
  tries: number;
};

function parseGuesses(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string") : [];
  } catch {
    return [];
  }
}

function toRows(guesses: string[], answer: string): StarwordRow[] {
  return guesses.map((word) => ({ word, verdicts: judgeStarword(word, answer) }));
}

function emptyState(day: string): StarwordState {
  return {
    day,
    started: false,
    rows: [],
    triesLeft: STARWORD_MAX_TRIES,
    cleared: false,
    failed: false,
  };
}

function stateOf(run: {
  day: string;
  answer: string;
  guessJson: string;
  clearedAt: Date | null;
  failed: boolean;
  elapsedMs: number | null;
  startedAt: Date;
}): StarwordState {
  const guesses = parseGuesses(run.guessJson);
  const cleared = !!run.clearedAt;
  const over = cleared || run.failed;
  return {
    day: run.day,
    started: true,
    rows: toRows(guesses, run.answer),
    triesLeft: Math.max(0, STARWORD_MAX_TRIES - guesses.length),
    cleared,
    failed: run.failed,
    answer: over ? run.answer : undefined,
    elapsedMs: run.elapsedMs,
    startedAtMs: run.startedAt.getTime(),
  };
}

/** 현재 상태 조회 — 시작 전이면 started:false */
export async function getStarwordState(): Promise<StarwordState> {
  const day = starwordDayKey();
  const user = await getCurrentUser();
  if (!user) return emptyState(day);
  const run = await prisma.starwordRun.findUnique({ where: { userId_day: { userId: user.id, day } } });
  return run ? stateOf(run) : emptyState(day);
}

/** 입장 — 50G 차감하고 판을 연다. 하루 한 번만. */
export async function startStarword(): Promise<StarwordState> {
  const day = starwordDayKey();
  const user = await getCurrentUser();
  if (!user) return { ...emptyState(day), error: "로그인이 필요합니다." };

  const existing = await prisma.starwordRun.findUnique({
    where: { userId_day: { userId: user.id, day } },
  });
  if (existing) return stateOf(existing);

  const sheet = await prisma.characterSheet.findUnique({
    where: { userId: user.id },
    select: { curGold: true, locationId: true },
  });
  if (!sheet) return { ...emptyState(day), error: "캐릭터 시트 연동이 필요합니다." };
  const gold = sheet.curGold ?? 0;
  if (gold < STARWORD_ENTRY_FEE) {
    return {
      ...emptyState(day),
      error: `입장료가 부족합니다. (${gold.toLocaleString()}G/${STARWORD_ENTRY_FEE}G)`,
    };
  }

  const nextGold = gold - STARWORD_ENTRY_FEE;
  // 유니크 제약이 재도전을 막는다 — 동시 클릭으로 두 판이 열리는 것도 여기서 걸린다.
  let run;
  try {
    run = await prisma.starwordRun.create({
      data: { userId: user.id, day, answer: starwordOfDay(day) },
    });
  } catch {
    const again = await prisma.starwordRun.findUnique({
      where: { userId_day: { userId: user.id, day } },
    });
    return again ? stateOf(again) : { ...emptyState(day), error: "이미 오늘 판을 시작했어요." };
  }

  await prisma.characterSheet.update({
    where: { userId: user.id },
    data: { curGold: nextGold, gold: `${nextGold}G` },
  });
  void enqueueSheetGoldSync(user.id);
  revalidatePath("/world");
  return stateOf(run);
}

/** 추측 한 번 */
export async function guessStarword(raw: string): Promise<StarwordState> {
  const day = starwordDayKey();
  const user = await getCurrentUser();
  if (!user) return { ...emptyState(day), error: "로그인이 필요합니다." };

  const run = await prisma.starwordRun.findUnique({
    where: { userId_day: { userId: user.id, day } },
  });
  if (!run) return { ...emptyState(day), error: "먼저 입장해주세요." };
  if (run.clearedAt || run.failed) return stateOf(run);

  const word = raw.trim();
  if (!isValidStarwordShape(word)) {
    return { ...stateOf(run), error: "두 글자 한글 단어를 입력해주세요." };
  }
  if (!isKnownStarword(word)) {
    return { ...stateOf(run), error: "목록에 없는 단어예요." };
  }

  const guesses = parseGuesses(run.guessJson);
  if (guesses.includes(word)) return { ...stateOf(run), error: "이미 시도한 단어예요." };
  guesses.push(word);

  const cleared = isStarwordCleared(judgeStarword(word, run.answer));
  const failed = !cleared && guesses.length >= STARWORD_MAX_TRIES;
  const now = new Date();
  const elapsedMs = cleared ? now.getTime() - run.startedAt.getTime() : null;

  const updated = await prisma.starwordRun.update({
    where: { id: run.id },
    data: {
      guessJson: JSON.stringify(guesses),
      ...(cleared ? { clearedAt: now, elapsedMs } : {}),
      ...(failed ? { failed: true } : {}),
    },
  });

  if (cleared) {
    // 성공 보상은 즉시. 순위 보상은 그날이 끝나야 정해지므로 다음 날 정산한다.
    const sheet = await prisma.characterSheet.findUnique({
      where: { userId: user.id },
      select: { curGold: true, locationId: true },
    });
    const nextGold = (sheet?.curGold ?? 0) + STARWORD_CLEAR_REWARD;
    await prisma.characterSheet.update({
      where: { userId: user.id },
      data: { curGold: nextGold, gold: `${nextGold}G` },
    });
    void enqueueSheetGoldSync(user.id);
    if (sheet?.locationId) {
      await postSystem(
        sheet.locationId,
        `✨ ${user.nickname}님이 오늘의 쌍별을 ${guesses.length}번 만에 맞혔다!`,
        { userId: user.id, actorName: user.nickname, kind: "시스템" },
      );
    }
  }

  revalidatePath("/world");
  return stateOf(updated);
}

/** 리더보드 — 빠른 순. day 를 안 주면 오늘. */
export async function getStarwordRanking(day?: string): Promise<StarwordRankRow[]> {
  const target = day ?? starwordDayKey();
  const rows = await prisma.starwordRun.findMany({
    where: { day: target, clearedAt: { not: null }, elapsedMs: { not: null } },
    orderBy: [{ elapsedMs: "asc" }, { clearedAt: "asc" }],
    take: 10,
    select: {
      elapsedMs: true,
      guessJson: true,
      user: { select: { nickname: true, username: true } },
    },
  });
  return rows.map((r) => ({
    nickname: r.user.nickname,
    username: r.user.username,
    elapsedMs: r.elapsedMs ?? 0,
    tries: parseGuesses(r.guessJson).length,
  }));
}

/** 지난 날짜의 순위 보상을 우편으로 정산. 게임 화면을 열 때 지연 실행된다(크론 없음). */
export async function settleStarwordRanks(): Promise<void> {
  const today = starwordDayKey();
  const pending = await prisma.starwordRun.findMany({
    where: { settled: false, day: { lt: today }, clearedAt: { not: null } },
    select: { day: true },
    distinct: ["day"],
    take: 5,
  });

  for (const { day } of pending) {
    const ranked = await prisma.starwordRun.findMany({
      where: { day, clearedAt: { not: null }, elapsedMs: { not: null } },
      orderBy: [{ elapsedMs: "asc" }, { clearedAt: "asc" }],
      select: { id: true, userId: true },
    });
    const [y, m, d] = day.split("-");
    for (const [index, run] of ranked.entries()) {
      const reward = STARWORD_RANK_REWARDS[index];
      if (reward) {
        await prisma.mail.create({
          data: {
            recipientId: run.userId,
            senderName: "쌍별",
            subject: `${Number(y)}년 ${Number(m)}월 ${Number(d)}일 ${index + 1}등 보상입니다.`,
            body: `쌍별 ${index + 1}등 보상 ${reward}G를 보냅니다.`,
            gold: reward,
          },
        });
      }
    }
    // 순위권 밖도 settled 로 닫아 매번 다시 훑지 않게 한다.
    await prisma.starwordRun.updateMany({ where: { day }, data: { settled: true } });
  }
}
