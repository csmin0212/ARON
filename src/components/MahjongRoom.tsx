"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePolling } from "@/lib/usePolling";
import {
  fillWithAi,
  leaveMahjongTable,
  setReady,
  submitPlayerAction,
  type MahjongPlayAction,
} from "@/app/actions/mahjong";
import type { MahjongHandSummaryView, MahjongPlayerView, MahjongSnapshot } from "@/lib/mahjongSnapshot";
import { isHonor, numOf, suitOf, type ScoreResult, type Tile } from "@/lib/mahjong";

const WIND_LABEL: Record<number, string> = { 27: "동", 28: "남", 29: "서", 30: "북" };
const TIER_LABEL: Record<string, string> = { low: "저가", mid: "중가", high: "고가" };
const HONOR_LABEL = ["", "東", "南", "西", "北", "白", "發", "中"];
const SUIT_TEXT: Record<string, string> = { m: "text-rose-600", p: "text-sky-600", s: "text-emerald-600", z: "text-slate-700" };
const SUIT_MARK: Record<string, string> = { m: "萬", p: "筒", s: "索", z: "" };

function faceLabel(kind: number): string {
  return isHonor(kind) ? HONOR_LABEL[numOf(kind)] : String(numOf(kind));
}

// 내 손패 타일 — 14장이 한 줄에 들어가도록 화면 폭에 맞춰 줄어든다
function TileFace({ tile, onClick, disabled }: { tile: Tile; onClick?: () => void; disabled?: boolean }) {
  const suit = suitOf(tile.kind);
  const interactive = !!onClick;
  return (
    <button
      type="button"
      disabled={!interactive || disabled}
      onClick={onClick}
      style={{ width: "var(--htw)", height: "calc(var(--htw) * 1.5)" }}
      className={`relative flex shrink-0 items-center justify-center rounded-lg border border-line bg-white shadow-sm ${SUIT_TEXT[suit]} ${
        interactive ? "transition hover:-translate-y-1 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0" : ""
      }`}
    >
      <span className="font-black leading-none" style={{ fontSize: "calc(var(--htw) * 0.58)" }}>
        {faceLabel(tile.kind)}
      </span>
      {!isHonor(tile.kind) && (
        <span className="absolute bottom-0.5 text-[8px] font-bold opacity-70">{SUIT_MARK[suit]}</span>
      )}
      {tile.aka && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </button>
  );
}

// 좌석 회전에 맞춰 타일 자체는 돌아가되, 글리프는 역회전시켜 어느 자리 버림패든 똑바로 읽힌다.
// (수비하려면 상대 버림패를 한눈에 읽어야 하므로 가독성을 회전 충실도보다 우선한다)
function SmallTile({
  tile,
  faded,
  highlight,
  spin = 0,
}: {
  tile: Tile;
  faded?: boolean;
  highlight?: boolean;
  spin?: number;
}) {
  const suit = suitOf(tile.kind);
  return (
    <span
      style={{ width: "var(--tw)", height: "var(--th)" }}
      className={`relative flex shrink-0 items-center justify-center rounded-[3px] border bg-white font-black shadow-sm ${SUIT_TEXT[suit]} ${
        highlight ? "border-amber-400 ring-2 ring-amber-300" : "border-black/20"
      } ${faded ? "opacity-60" : ""}`}
    >
      <span
        className="leading-none"
        style={{ transform: `rotate(${-spin}deg)`, fontSize: "calc(var(--tw) * 0.62)" }}
      >
        {faceLabel(tile.kind)}
      </span>
      {tile.aka && <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-rose-500" />}
    </span>
  );
}

// 남의 손패 — 내용은 안 보이고 장수만 뒷면으로 보인다
function TileBack() {
  return (
    <span
      style={{ width: "var(--tw)", height: "var(--th)" }}
      className="shrink-0 rounded-[3px] border border-black/25 bg-gradient-to-b from-amber-700 to-amber-900 shadow-sm"
    />
  );
}

// 버림패 더미(河) — 작탁처럼 6장씩 줄바꿈해서 쌓인다
function Pond({ tiles, highlightLast, spin }: { tiles: Tile[]; highlightLast: boolean; spin: number }) {
  return (
    <div
      className="grid grid-cols-6 content-start gap-[2px] rounded bg-black/15 p-1"
      style={{ minHeight: "calc(var(--th) * 2)", width: "calc(var(--tw) * 6 + 18px)" }}
    >
      {tiles.map((t, i) => (
        <SmallTile key={i} tile={t} spin={spin} highlight={highlightLast && i === tiles.length - 1} />
      ))}
    </div>
  );
}

// 울은 패(퐁·치·깡) — 부른 순서가 아니라 패 순서로 정렬해 보여준다(치가 "2 3 1"로 보이지 않게).
function MeldRow({ melds, spin }: { melds: MahjongPlayerView["melds"]; spin: number }) {
  if (melds.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {melds.map((m, i) => (
        <div key={i} className="flex gap-[2px] rounded bg-black/25 p-[2px]">
          {m.tiles
            .slice()
            .sort((a, b) => a.kind - b.kind)
            .map((t, j) => (
              <SmallTile key={j} tile={t} spin={spin} />
            ))}
        </div>
      ))}
    </div>
  );
}

function NamePlate({
  player,
  nickname,
  isTurn,
  isMe,
}: {
  player: MahjongPlayerView;
  nickname: string;
  isTurn: boolean;
  isMe: boolean;
}) {
  // 좌우 자리에서도 테이블 밖으로 안 나가도록 한 줄·고정폭으로 최대한 작게.
  return (
    <div
      className={`flex w-[4.6rem] items-center gap-1 rounded px-1 py-0.5 text-white ${
        isTurn ? "bg-amber-500 ring-1 ring-amber-200" : "bg-black/50"
      }`}
    >
      <span className="shrink-0 rounded bg-white/25 px-1 text-[9px] font-black leading-tight">
        {WIND_LABEL[player.seatWind]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[9px] font-extrabold">
          {isMe ? "나" : nickname}
          {player.isDealer && <span className="ml-0.5 text-amber-200">庄</span>}
        </span>
        <span className="text-[10px] font-black tabular-nums">{player.points.toLocaleString()}</span>
      </span>
      {player.riichi && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" title="리치" />}
    </div>
  );
}

// 좌석 한 칸 — 항상 "아래쪽에서 중앙을 바라보는" 모양으로 그린 뒤, 바깥에서 통째로 회전시켜
// 오른쪽/맞은편/왼쪽 자리에 놓는다(작혼과 같은 방식). 내 자리는 회전 0도라 늘 정면.
function SeatLayer({
  player,
  nickname,
  isTurn,
  isMe,
  lastDiscardSeat,
  spin,
}: {
  player: MahjongPlayerView;
  nickname: string;
  isTurn: boolean;
  isMe: boolean;
  lastDiscardSeat: number | null;
  spin: number;
}) {
  return (
    <div className="absolute inset-0" style={{ transform: `rotate(${spin}deg)` }}>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center gap-[3px]">
        <Pond tiles={player.discards} highlightLast={lastDiscardSeat === player.seat} spin={spin} />
        <MeldRow melds={player.melds} spin={spin} />
        {!isMe && (
          <>
            {/* 좁은 화면에선 뒷면 13장을 다 그리면 자리가 안 나온다 — 장수만 표시 */}
            <div className="hidden gap-[2px] sm:flex">
              {Array.from({ length: player.handCount }, (_, i) => (
                <TileBack key={i} />
              ))}
            </div>
            <span
              className="rounded bg-black/50 px-1.5 text-[9px] font-black text-white/80 sm:hidden"
              style={{ transform: `rotate(${spin % 180 === 0 ? -spin : 0}deg)` }}
            >
              🀫 {player.handCount}
            </span>
          </>
        )}
        {/* 위·아래 자리만 글자를 되돌린다. 좌·우는 세로로 눕혀야 안쪽 깊이를 덜 먹어
            버림패 더미끼리 부딪히지 않는다(작혼도 옆자리 정보는 눕혀서 표시). */}
        <div style={{ transform: `rotate(${spin % 180 === 0 ? -spin : 0}deg)` }}>
          <NamePlate player={player} nickname={nickname} isTurn={isTurn} isMe={isMe} />
        </div>
      </div>
    </div>
  );
}

function seatOrder(mySeat: number, playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, i) => (mySeat + i) % playerCount);
}

function ScoreDetail({ score, pointsWon }: { score: ScoreResult; pointsWon: number }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2 text-xs">
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-faint">
        {score.yaku.map((y) => (
          <span key={y.name} className="font-bold text-content">
            {y.name}
            {!y.yakuman && <span className="text-faint"> {y.han}판</span>}
          </span>
        ))}
        {score.doraCount > 0 && <span className="font-bold text-content">도라 {score.doraCount}</span>}
        {score.uraDoraCount > 0 && <span className="font-bold text-content">뒷도라 {score.uraDoraCount}</span>}
        {score.akaCount > 0 && <span className="font-bold text-content">적도라 {score.akaCount}</span>}
      </div>
      <p className="mt-1 font-black text-brand-600">
        {score.limitName ? `${score.limitName} ` : `${score.han}판 ${score.fu}부 `}
        <span className="text-content">+{pointsWon.toLocaleString()}점</span>
      </p>
    </div>
  );
}

function HandSummaryOverlay({
  summary,
  seatName,
  onClose,
}: {
  summary: MahjongHandSummaryView;
  seatName: (seat: number) => string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-5 shadow-xl">
        <h3 className="text-lg font-black text-content">{summary.type === "win" ? "🀄 화료!" : "유국"}</h3>
        <div className="mt-3 space-y-2">
          {summary.type === "win" ? (
            summary.winners.map((w) => (
              <div key={w.seat}>
                <p className="text-sm font-extrabold text-content">
                  {seatName(w.seat)}
                  <span className="ml-1 text-[11px] font-bold text-faint">
                    {summary.loserSeat === null ? "쯔모" : `론 (방총 ${seatName(summary.loserSeat)})`}
                  </span>
                </p>
                <ScoreDetail score={w.score} pointsWon={w.pointsWon} />
              </div>
            ))
          ) : (
            <p className="text-sm text-faint">아무도 화료하지 못했어요. 텐파이한 사람이 노텐인 사람에게서 점수를 받습니다.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-700"
        >
          다음 판으로
        </button>
      </div>
    </div>
  );
}

function WaitingRoom({
  snap,
  tableId,
  isHost,
  currentUserId,
  refresh,
}: {
  snap: MahjongSnapshot;
  tableId: string;
  isHost: boolean;
  currentUserId: string;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const mySeat = snap.seats.find((s) => s.userId === currentUserId);
  const amReady = mySeat?.isReady ?? false;

  async function toggleReady() {
    setBusy(true);
    await setReady(tableId, !amReady);
    await refresh();
    setBusy(false);
  }
  async function fillAi() {
    setBusy(true);
    await fillWithAi(tableId);
    await refresh();
    setBusy(false);
  }
  async function leave() {
    setBusy(true);
    await leaveMahjongTable(tableId);
    router.push("/world");
  }

  const slots = Array.from({ length: snap.playerCount }, (_, i) => snap.seats.find((s) => s.seatIndex === i) ?? null);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-8">
      <header className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MAHJONG LOBBY</p>
        <h1 className="mt-1 text-2xl font-black text-content">
          {snap.playerCount}인 마작 · {TIER_LABEL[snap.tier] ?? snap.tier}
        </h1>
        <p className="mt-1 text-sm text-faint">전원 준비를 마치면 자동으로 시작합니다.</p>
      </header>

      <ul className="space-y-2">
        {slots.map((seat, i) => (
          <li
            key={i}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
              seat?.isReady ? "border-emerald-400 bg-emerald-500/5" : "border-line bg-surface"
            }`}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-subtle text-sm font-black text-muted">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-content">{seat ? seat.nickname : "빈 자리"}</span>
              {seat?.isAi && <span className="text-[11px] text-faint">AI</span>}
            </span>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${
                seat?.isReady ? "bg-emerald-500 text-white" : "bg-subtle text-muted"
              }`}
            >
              {seat ? (seat.isReady ? "준비 완료" : "대기 중") : "-"}
            </span>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        {mySeat && (
          <button
            type="button"
            onClick={toggleReady}
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {amReady ? "준비 취소" : "준비 완료"}
          </button>
        )}
        {isHost && slots.some((s) => !s) && (
          <button
            type="button"
            onClick={fillAi}
            disabled={busy}
            className="w-full rounded-xl bg-subtle px-4 py-3 text-sm font-bold text-muted transition hover:bg-line disabled:opacity-60"
          >
            AI로 빈 자리 채우기
          </button>
        )}
        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="w-full rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-extrabold text-rose-600 transition hover:bg-rose-500/15 disabled:opacity-60"
        >
          방 나가기
        </button>
      </div>
    </div>
  );
}

function FinalResultView({ snap }: { snap: MahjongSnapshot }) {
  const results = snap.finalResult ? snap.finalResult.slice().sort((a, b) => a.placement - b.placement) : [];
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-10">
      <header className="rounded-3xl border border-line bg-surface p-5 text-center shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MATCH FINISHED</p>
        <h1 className="mt-1 text-2xl font-black text-content">동풍전 종료</h1>
      </header>
      <ol className="space-y-2">
        {results.map((r) => {
          const seat = snap.seats.find((s) => s.seatIndex === r.seat);
          return (
            <li
              key={r.seat}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500 text-sm font-black text-white">
                {r.placement}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-content">{seat?.nickname ?? "AI"}</span>
                <span className="text-[11px] text-faint">
                  {r.rawPoints.toLocaleString()}점 {r.uma >= 0 ? "+" : ""}
                  {r.uma.toLocaleString()}
                </span>
              </span>
              <span className="shrink-0 text-lg font-black text-brand-600">{r.finalPoints.toLocaleString()}</span>
            </li>
          );
        })}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/mahjong"
          className="rounded-xl bg-subtle px-4 py-3 text-center text-sm font-bold text-muted transition hover:bg-line"
        >
          전적 보기
        </Link>
        <Link
          href="/world"
          className="rounded-xl bg-brand-600 px-4 py-3 text-center text-sm font-extrabold text-white transition hover:bg-brand-700"
        >
          분수광장으로
        </Link>
      </div>
    </div>
  );
}

function LiveTable({
  snap,
  act,
  busy,
  error,
}: {
  snap: MahjongSnapshot;
  act: (action: MahjongPlayAction) => void;
  busy: boolean;
  error: string | null;
}) {
  const [summaryDismissed, setSummaryDismissed] = useState<string | null>(null);
  const hand = snap.hand!;
  const mySeat = snap.mySeatIndex;
  const order = mySeat !== null ? seatOrder(mySeat, snap.playerCount) : Array.from({ length: snap.playerCount }, (_, i) => i);
  const myPlayer = mySeat !== null ? hand.players.find((p) => p.seat === mySeat) : null;
  const isMyTurn = mySeat !== null && hand.turn === mySeat && !hand.pendingCall;

  const summaryKey = snap.lastHandSummary ? JSON.stringify(snap.lastHandSummary) : null;
  const showSummary = summaryKey !== null && summaryKey !== summaryDismissed;

  const pendingForMe =
    hand.pendingCall && mySeat !== null && hand.pendingCall.eligibleSeats.includes(mySeat) && !hand.pendingCall.myResponse;

  const seatAt = (pos: number) => {
    const seatIndex = order[pos];
    if (seatIndex === undefined) return null;
    const p = hand.players.find((pl) => pl.seat === seatIndex);
    if (!p) return null;
    return {
      player: p,
      nickname: snap.seats.find((s) => s.seatIndex === seatIndex)?.nickname ?? "AI",
      isTurn: hand.turn === seatIndex && !hand.pendingCall,
      isMe: seatIndex === mySeat,
    };
  };

  const bottom = seatAt(0);
  const right = seatAt(1);
  const top = seatAt(2);
  const left = snap.playerCount === 4 ? seatAt(3) : null;
  const lastDiscardSeat = hand.lastDiscard?.seat ?? null;

  // 내 자리가 항상 아래(0도). 시계 반대로 돌려 하가/맞은편/상가를 오른쪽/위/왼쪽에 앉힌다.
  const seated = [bottom, right, top, left].map((data, i) => ({ data, spin: -90 * i }));

  return (
    <div className="mx-auto max-w-3xl space-y-3 px-3 py-4">
      {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600">{error}</p>}

      {/* 작탁 — 각 자리가 자기 방향으로 돌아앉고, 버림패 더미도 그 자리 앞에 놓인다 */}
      <div
        className="rounded-3xl border-4 border-[#6b4423] bg-[#146c43] p-2 shadow-xl"
        style={{ ["--tw" as string]: "clamp(12px, 2.9vw, 20px)", ["--th" as string]: "clamp(16px, 4vw, 27px)" }}
      >
        {/* 모바일 전용 정보 바 — 테이블 중앙이 좁아 밖으로 뺀 것 */}
        <div className="mb-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-lg bg-black/35 px-2 py-1 text-white sm:hidden">
          <span className="text-xs font-black">
            {WIND_LABEL[hand.roundWind]}
            {hand.roundNumber}국 <span className="font-bold text-white/70">{hand.honba}본</span>
          </span>
          <span className="text-[10px] text-white/70">
            공탁 {hand.kyotaku} · 남은패 {hand.wallRemaining}
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-white/60">도라</span>
            {hand.doraIndicators.map((k, i) => (
              <SmallTile key={i} tile={{ kind: k, aka: false }} />
            ))}
          </span>
          {mySeat === null && (
            <span className="rounded-full bg-white/20 px-2 text-[9px] font-black">관전 중</span>
          )}
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          {seated.map(({ data, spin }) =>
            data ? (
              <SeatLayer
                key={data.player.seat}
                player={data.player}
                nickname={data.nickname}
                isTurn={data.isTurn}
                isMe={data.isMe}
                lastDiscardSeat={lastDiscardSeat}
                spin={spin}
              />
            ) : null,
          )}

          {/* 중앙 점수판 — 회전하지 않는다 */}
          {/* 좁은 화면에선 좌우 버림패 줄과 자리를 다투므로 테이블 밖(위쪽 바)으로 뺀다 */}
          <div className="absolute left-1/2 top-1/2 hidden w-[8.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl bg-black/45 px-2 py-1.5 text-center text-white sm:flex">
            <p className="text-xs font-black sm:text-sm">
              {WIND_LABEL[hand.roundWind]}
              {hand.roundNumber}국 <span className="font-bold text-white/70">{hand.honba}본</span>
            </p>
            <p className="text-[9px] leading-tight text-white/70">
              공탁 {hand.kyotaku} · 남은패 {hand.wallRemaining}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold text-white/60">도라</span>
              {hand.doraIndicators.map((k, i) => (
                <SmallTile key={i} tile={{ kind: k, aka: false }} />
              ))}
            </div>
            {mySeat === null && (
              <span className="rounded-full bg-white/20 px-2 text-[9px] font-black">관전 중</span>
            )}
          </div>
        </div>
      </div>

      {myPlayer && (
        <div
          className="rounded-2xl border border-line bg-surface p-3"
          style={{ ["--htw" as string]: "clamp(17px, 5vw, 36px)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-extrabold text-content">
              내 손패 {myPlayer.isDealer && <span className="ml-1 text-[10px] font-black text-amber-600">庄</span>}
              {myPlayer.riichi && <span className="ml-1 text-[10px] font-black text-rose-600">리치</span>}
              {isMyTurn ? (
                <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                  내 차례
                </span>
              ) : (
                <span className="ml-2 text-[10px] font-bold text-faint">대기 중</span>
              )}
            </span>
            <span className="text-sm font-black text-content">{myPlayer.points.toLocaleString()}점</span>
          </div>

          <div className="flex flex-wrap justify-center gap-[3px] sm:gap-1.5">
            {(myPlayer.myHand ?? [])
              .map((tile, idx) => ({ tile, idx }))
              .sort((a, b) => a.tile.kind - b.tile.kind)
              .map(({ tile, idx }) => (
                <TileFace
                  key={idx}
                  tile={tile}
                  disabled={busy || !isMyTurn || myPlayer.riichi}
                  onClick={isMyTurn && !myPlayer.riichi ? () => act({ type: "discard", tileIndex: idx }) : undefined}
                />
              ))}
          </div>

          {isMyTurn && hand.legalActions && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hand.legalActions.canTsumo && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "tsumo" })}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
                >
                  쯔모!
                </button>
              )}
              {hand.legalActions.canRiichi && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "riichi" })}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-600 disabled:opacity-60"
                >
                  리치
                </button>
              )}
              {hand.legalActions.ankanKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "ankan", kind })}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  안깡({faceLabel(kind)})
                </button>
              ))}
              {hand.legalActions.canKakan && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "kakan" })}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  카칸
                </button>
              )}
              {hand.legalActions.canKita && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "kita" })}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  발북(北)
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {pendingForMe && hand.pendingCall && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface p-4 shadow-2xl">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <TileFace tile={hand.pendingCall.tile} />
            <div className="flex flex-1 flex-wrap gap-2">
              {hand.pendingCall.myOptions?.ron && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "call", response: "ron" })}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
                >
                  론!
                </button>
              )}
              {hand.pendingCall.myOptions?.kan && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "call", response: "kan" })}
                  className="rounded-xl bg-slate-700 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  깡
                </button>
              )}
              {hand.pendingCall.myOptions?.pon && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "call", response: "pon" })}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-black text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  퐁
                </button>
              )}
              {hand.pendingCall.myOptions?.chi && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ type: "call", response: "chi" })}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-600 disabled:opacity-60"
                >
                  치
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ type: "call", response: "pass" })}
                className="rounded-xl bg-subtle px-4 py-2 text-xs font-bold text-muted transition hover:bg-line disabled:opacity-60"
              >
                패스
              </button>
            </div>
          </div>
        </div>
      )}

      {showSummary && snap.lastHandSummary && (
        <HandSummaryOverlay
          summary={snap.lastHandSummary}
          seatName={(seat) => snap.seats.find((s) => s.seatIndex === seat)?.nickname ?? `${seat + 1}번 자리`}
          onClose={() => setSummaryDismissed(summaryKey)}
        />
      )}
    </div>
  );
}

export default function MahjongRoom({
  tableId,
  currentUserId,
  isHost,
  initialSnapshot,
}: {
  tableId: string;
  currentUserId: string;
  isHost: boolean;
  initialSnapshot: MahjongSnapshot;
}) {
  const [snap, setSnap] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotKeyRef = useRef(JSON.stringify(initialSnapshot));

  const waitingOnOthers =
    snap.status === "playing" && snap.hand !== null && snap.hand.turn !== snap.mySeatIndex;

  usePolling(
    async () => {
      try {
        const res = await fetch(`/api/mahjong/${tableId}`, { cache: "no-store" });
        if (!res.ok) return false;
        const next = (await res.json()) as MahjongSnapshot;
        const key = JSON.stringify(next);
        if (key === snapshotKeyRef.current) return false;
        snapshotKeyRef.current = key;
        setSnap(next);
        return true;
      } catch {
        return false;
      }
    },
    // AI 가 한 수씩 두는 걸 놓치지 않게, 남의 차례(=AI 진행 중)일 때는 짧게 확인한다.
    // 내 차례로 넘어오면 더 볼 게 없으므로 느슨하게 — 불필요한 DB 조회를 줄인다.
    snap.status !== "playing"
      ? { minMs: 3_000, maxMs: 15_000, idleMs: 60_000 }
      : snap.hand?.pendingCall || waitingOnOthers
        ? { minMs: 900, maxMs: 2_500, idleMs: 60_000 }
        : { minMs: 3_000, maxMs: 10_000, idleMs: 60_000 },
  );

  async function refresh() {
    const refreshed = await fetch(`/api/mahjong/${tableId}`, { cache: "no-store" });
    if (refreshed.ok) {
      const next = (await refreshed.json()) as MahjongSnapshot;
      snapshotKeyRef.current = JSON.stringify(next);
      setSnap(next);
    }
  }

  async function act(action: MahjongPlayAction) {
    setBusy(true);
    setError(null);
    try {
      const res = await submitPlayerAction(tableId, action);
      if (!res.ok) setError(res.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (snap.status === "waiting") {
    return (
      <WaitingRoom snap={snap} tableId={tableId} isHost={isHost} currentUserId={currentUserId} refresh={refresh} />
    );
  }

  if (snap.status === "finished") {
    return <FinalResultView snap={snap} />;
  }

  if (!snap.hand) {
    return <div className="p-8 text-center text-sm text-faint">불러오는 중…</div>;
  }

  return <LiveTable snap={snap} act={act} busy={busy} error={error} />;
}
