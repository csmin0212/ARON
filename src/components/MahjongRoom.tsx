"use client";

import { createContext, useContext, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
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
import type {
  MahjongHandSummaryView,
  MahjongHandView,
  MahjongPlayerView,
  MahjongSnapshot,
} from "@/lib/mahjongSnapshot";
import { isHonor, numOf, suitOf, type ScoreResult, type Tile } from "@/lib/mahjong";

const WIND_LABEL: Record<number, string> = { 27: "동", 28: "남", 29: "서", 30: "북" };
const TIER_LABEL: Record<string, string> = { low: "저가", mid: "중가", high: "고가" };
const SUIT_TEXT: Record<string, string> = { m: "text-rose-600", p: "text-sky-600", s: "text-emerald-600", z: "text-slate-700" };

// 표기법 — 개인 설정(보는 사람마다 다름). 한자는 작혼과 같은 표기, 한글은 읽기 쉬운 표기.
type Notation = "hanja" | "hangul";
const NOTATION_KEY = "mahjong.notation";
const HONOR_HANJA = ["", "東", "南", "西", "北", "白", "發", "中"];
const HONOR_HANGUL = ["", "동", "남", "서", "북", "백", "발", "중"];
const SUIT_MARK_HANJA: Record<string, string> = { m: "萬", p: "筒", s: "索", z: "" };
const SUIT_MARK_HANGUL: Record<string, string> = { m: "만", p: "통", s: "삭", z: "" };

const NotationContext = createContext<Notation>("hanja");
const useNotation = () => useContext(NotationContext);

// localStorage 를 외부 스토어로 구독한다 — 이펙트에서 setState 하지 않아 하이드레이션도 안전하다
let notationCache: Notation | null = null;
const notationListeners = new Set<() => void>();
function readNotation(): Notation {
  if (notationCache === null) {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(NOTATION_KEY) : null;
    notationCache = saved === "hangul" ? "hangul" : "hanja";
  }
  return notationCache;
}
function writeNotation(next: Notation) {
  notationCache = next;
  if (typeof window !== "undefined") window.localStorage.setItem(NOTATION_KEY, next);
  notationListeners.forEach((l) => l());
}
function subscribeNotation(cb: () => void) {
  notationListeners.add(cb);
  return () => {
    notationListeners.delete(cb);
  };
}

function faceLabelIn(kind: number, notation: Notation): string {
  if (!isHonor(kind)) return String(numOf(kind));
  return (notation === "hangul" ? HONOR_HANGUL : HONOR_HANJA)[numOf(kind)];
}
function suitMarkIn(suit: string, notation: Notation): string {
  return (notation === "hangul" ? SUIT_MARK_HANGUL : SUIT_MARK_HANJA)[suit] ?? "";
}

// 내 손패 타일 — 14장이 한 줄에 들어가도록 화면 폭에 맞춰 줄어든다
function TileFace({
  tile,
  onClick,
  disabled,
  dimmed,
  highlight,
  onHoverKind,
}: {
  tile: Tile;
  onClick?: () => void;
  disabled?: boolean;
  dimmed?: boolean;
  highlight?: boolean;
  onHoverKind?: (kind: number | null) => void;
}) {
  const suit = suitOf(tile.kind);
  const notation = useNotation();
  // 네이티브 disabled 를 쓰면 크롬이 마우스 이벤트를 죽여서 hover 로 버림패를 못 훑는다.
  // 수비를 위해 남의 차례에도 훑어봐야 하므로 aria-disabled 로만 막는다.
  const clickable = !!onClick && !disabled;
  return (
    <button
      type="button"
      aria-disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      onMouseEnter={() => onHoverKind?.(tile.kind)}
      onMouseLeave={() => onHoverKind?.(null)}
      onFocus={() => onHoverKind?.(tile.kind)}
      onBlur={() => onHoverKind?.(null)}
      style={{ width: "var(--htw)", height: "calc(var(--htw) * 1.5)" }}
      className={`relative flex shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm ${SUIT_TEXT[suit]} ${
        highlight ? "border-rose-500 ring-2 ring-rose-300" : "border-line"
      } ${dimmed ? "opacity-35" : ""} ${
        clickable ? "transition hover:-translate-y-1 hover:shadow-md" : "cursor-default"
      } ${disabled && !dimmed ? "opacity-60" : ""}`}
    >
      <span className="font-black leading-none" style={{ fontSize: "calc(var(--htw) * 0.58)" }}>
        {faceLabelIn(tile.kind, notation)}
      </span>
      {!isHonor(tile.kind) && (
        <span className="absolute bottom-0.5 text-[8px] font-bold opacity-70">{suitMarkIn(suit, notation)}</span>
      )}
      {tile.aka && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
    </button>
  );
}

// 초 단위 시계 — Date.now() 를 렌더 중에 부르면 서버/클라 값이 달라 하이드레이션이 깨진다.
// 외부 스토어로 구독해 서버 렌더에서는 0(=표시 안 함)을 주고, 마운트 후에만 시간을 그린다.
let tickNow = 0;
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
function subscribeTick(cb: () => void) {
  tickListeners.add(cb);
  if (tickTimer === null) {
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((l) => l());
    }, 250);
  }
  return () => {
    tickListeners.delete(cb);
    if (tickListeners.size === 0 && tickTimer !== null) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}
function getTick() {
  if (tickNow === 0) tickNow = Date.now();
  return tickNow;
}
const getServerTick = () => 0;

// 남은 시간 — 기본시간이 끝나면 적립시간을 까먹기 시작한다(작혼과 동일)
function TurnClock({
  hand,
  mySeat,
  isMyTurn,
}: {
  hand: MahjongHandView;
  mySeat: number | null;
  isMyTurn: boolean;
}) {
  const now = useSyncExternalStore(subscribeTick, getTick, getServerTick);
  if (now === 0 || hand.turnDeadline === null || mySeat === null) return null;
  const left = Math.max(0, hand.turnDeadline - now);
  const bank = hand.timeBankMs[hand.turn] ?? 0;
  const inBase = left > bank;
  const shown = Math.ceil((inBase ? left - bank : left) / 1000);
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums ${
        isMyTurn ? (inBase ? "bg-brand-50 text-brand-700" : "bg-rose-500 text-white") : "bg-subtle text-muted"
      }`}
      title={inBase ? "기본시간" : "적립시간 소모 중"}
    >
      {shown}s{!inBase && " ⏳"}
    </span>
  );
}

// 좌석 회전에 맞춰 타일 자체는 돌아가되, 글리프는 역회전시켜 어느 자리 버림패든 똑바로 읽힌다.
// (수비하려면 상대 버림패를 한눈에 읽어야 하므로 가독성을 회전 충실도보다 우선한다)
function SmallTile({
  tile,
  faded,
  highlight,
  marked,
  spin = 0,
}: {
  tile: Tile;
  faded?: boolean;
  highlight?: boolean;
  marked?: boolean; // 손패에 마우스를 올린 패와 같은 종류 — 버림패 어디에 있는지 회색으로 표시
  spin?: number;
}) {
  const suit = suitOf(tile.kind);
  const notation = useNotation();
  return (
    <span
      style={{ width: "var(--tw)", height: "var(--th)" }}
      className={`relative flex shrink-0 items-center justify-center rounded-[3px] border font-black shadow-sm ${SUIT_TEXT[suit]} ${
        marked ? "bg-slate-400 ring-2 ring-slate-500" : "bg-white"
      } ${highlight ? "border-amber-400 ring-2 ring-amber-300" : "border-black/20"} ${faded ? "opacity-60" : ""}`}
    >
      <span
        className="leading-none"
        style={{ transform: `rotate(${-spin}deg)`, fontSize: "calc(var(--tw) * 0.62)" }}
      >
        {faceLabelIn(tile.kind, notation)}
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
function Pond({
  tiles,
  highlightLast,
  spin,
  markKind,
}: {
  tiles: Tile[];
  highlightLast: boolean;
  spin: number;
  markKind: number | null;
}) {
  return (
    <div
      className="grid grid-cols-6 content-start gap-[2px] rounded bg-black/15 p-1"
      style={{ minHeight: "calc(var(--th) * 2)", width: "calc(var(--tw) * 6 + 18px)" }}
    >
      {tiles.map((t, i) => (
        <SmallTile
          key={i}
          tile={t}
          spin={spin}
          highlight={highlightLast && i === tiles.length - 1}
          marked={markKind !== null && t.kind === markKind}
        />
      ))}
    </div>
  );
}

// 울은 패(퐁·치·깡) — 마작 표준대로 "가져온 패"를 눕혀서 표시하고, 그 위치로 누구에게서
// 받았는지 나타낸다: 왼쪽=상가(내 앞사람), 가운데=대면, 오른쪽=하가(내 뒷사람).
function MeldRow({
  melds,
  spin,
  ownerSeat,
  playerCount,
  markKind,
}: {
  melds: MahjongPlayerView["melds"];
  spin: number;
  ownerSeat: number;
  playerCount: number;
  markKind: number | null;
}) {
  if (melds.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {melds.map((m, i) => {
        const rest = m.tiles.slice();
        let called: Tile | null = null;
        if (m.calledFrom != null && m.type !== "ankan") called = rest.pop() ?? null;
        rest.sort((a, b) => a.kind - b.kind);

        // 부른 사람 기준 상대 위치 → 눕힌 패를 왼쪽/가운데/오른쪽 어디에 끼울지
        const rel = m.calledFrom != null ? (m.calledFrom - ownerSeat + playerCount) % playerCount : -1;
        const insertAt = rel === playerCount - 1 ? 0 : rel === 1 ? rest.length : Math.min(1, rest.length);
        const parts: ReactNode[] = rest.map((t, j) => (
          <SmallTile key={`r${j}`} tile={t} spin={spin} marked={markKind !== null && t.kind === markKind} />
        ));
        if (called) {
          parts.splice(
            insertAt,
            0,
            <span
              key="called"
              className="inline-flex"
              style={{ transform: "rotate(90deg)", width: "var(--th)", height: "var(--tw)" }}
              title={`${WIND_LABEL[0] ?? ""}가져온 패`}
            >
              <SmallTile tile={called} spin={spin + 90} marked={markKind !== null && called.kind === markKind} />
            </span>,
          );
        }
        return (
          <div key={i} className="flex items-center gap-[2px] rounded bg-black/25 p-[2px]">
            {parts}
          </div>
        );
      })}
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
  playerCount,
  markKind,
}: {
  player: MahjongPlayerView;
  nickname: string;
  isTurn: boolean;
  isMe: boolean;
  lastDiscardSeat: number | null;
  spin: number;
  playerCount: number;
  markKind: number | null;
}) {
  return (
    <div className="absolute inset-0" style={{ transform: `rotate(${spin}deg)` }}>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center gap-[3px]">
        <Pond
          tiles={player.discards}
          highlightLast={lastDiscardSeat === player.seat}
          spin={spin}
          markKind={markKind}
        />
        <MeldRow
          melds={player.melds}
          spin={spin}
          ownerSeat={player.seat}
          playerCount={playerCount}
          markKind={markKind}
        />
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

const CALL_LABEL: Record<string, string> = { pon: "퐁", chi: "치", minkan: "깡" };

function seatLabel(snap: MahjongSnapshot, seat: number): string {
  if (seat === snap.mySeatIndex) return "나";
  return snap.seats.find((s) => s.seatIndex === seat)?.nickname ?? `${seat + 1}번 자리`;
}

// 회전과 무관한 자리(배너·결과창)에서 쓰는 타일 — 작탁 CSS 변수 밖에서도 크기가 잡히게
function SmallTileStatic({ tile }: { tile: Tile }) {
  return (
    <span style={{ ["--tw" as string]: "18px", ["--th" as string]: "24px" }} className="inline-flex">
      <SmallTile tile={tile} />
    </span>
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
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-5 shadow-xl">
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

        {/* 누가 누구에게 얼마를 줬는지 — 좌석별 증감 */}
        <div className="mt-4 space-y-1">
          <p className="text-xs font-extrabold text-faint">점수 이동</p>
          {summary.deltas.map((d, seat) => (
            <div key={seat} className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-content">{seatName(seat)}</span>
              <span
                className={`shrink-0 text-sm font-black tabular-nums ${
                  d > 0 ? "text-emerald-600" : d < 0 ? "text-rose-600" : "text-faint"
                }`}
              >
                {d > 0 ? "+" : ""}
                {d.toLocaleString()}
              </span>
              <span className="w-16 shrink-0 text-right text-xs font-bold tabular-nums text-muted">
                {summary.pointsAfter[seat].toLocaleString()}
              </span>
            </div>
          ))}
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
  onToggleNotation,
}: {
  snap: MahjongSnapshot;
  act: (action: MahjongPlayAction) => void;
  busy: boolean;
  error: string | null;
  onToggleNotation: () => void;
}) {
  const [summaryDismissed, setSummaryDismissed] = useState<string | null>(null);
  const [riichiArming, setRiichiArming] = useState(false);
  const [showWaits, setShowWaits] = useState(false);
  const [hoverKind, setHoverKind] = useState<number | null>(null);
  const notation = useNotation();
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

      {/* 방금 누가 누구에게서 울었는지 — 한 박자 쉬는 동안 여기에 뜬다 */}
      {hand.lastCall && (
        <p className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-black text-brand-700">
          {seatLabel(snap, hand.lastCall.seat)}
          <span className="rounded bg-brand-600 px-2 py-0.5 text-white">{CALL_LABEL[hand.lastCall.type]}</span>
          <SmallTileStatic tile={hand.lastCall.tile} />
          <span className="font-bold text-brand-600">← {seatLabel(snap, hand.lastCall.fromSeat)}</span>
        </p>
      )}

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
                playerCount={snap.playerCount}
                markKind={hoverKind}
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-sm font-extrabold text-content">
              내 손패 {myPlayer.isDealer && <span className="text-[10px] font-black text-amber-600">庄</span>}
              {myPlayer.riichi && <span className="text-[10px] font-black text-rose-600">리치</span>}
              {hand.tenpai?.furiten && (
                <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-black text-white">후리텐</span>
              )}
              {isMyTurn ? (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">내 차례</span>
              ) : (
                <span className="text-[10px] font-bold text-faint">대기 중</span>
              )}
              {hand.tenpai && (
                <button
                  type="button"
                  onClick={() => setShowWaits((v) => !v)}
                  className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[11px] font-black text-white transition hover:bg-brand-700"
                  title="대기패 보기"
                >
                  !
                </button>
              )}
            </span>
            <span className="flex items-center gap-2">
              <TurnClock hand={hand} mySeat={mySeat} isMyTurn={isMyTurn} />
              <button
                type="button"
                onClick={onToggleNotation}
                className="rounded-lg bg-subtle px-2 py-1 text-[11px] font-bold text-muted transition hover:bg-line"
                title="패 표기법 바꾸기 (한자 ↔ 한글)"
              >
                표기 {notation === "hanja" ? "漢" : "한"}
              </button>
              <span className="text-sm font-black text-content">{myPlayer.points.toLocaleString()}점</span>
            </span>
          </div>

          {showWaits && hand.tenpai && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl bg-canvas px-3 py-2">
              <span className="text-[11px] font-extrabold text-faint">대기</span>
              {hand.tenpai.waits.map((w) => (
                <span key={w.kind} className="flex items-center gap-0.5">
                  <SmallTile tile={{ kind: w.kind, aka: false }} />
                  <span className="text-[10px] font-bold text-muted">{w.remaining}</span>
                </span>
              ))}
              {hand.tenpai.furiten && (
                <span className="text-[10px] font-black text-rose-600">후리텐 — 론 불가(쯔모만)</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-[3px] sm:gap-1.5">
            {(myPlayer.myHand ?? [])
              .map((tile, idx) => ({ tile, idx }))
              .sort((a, b) => a.tile.kind - b.tile.kind)
              .map(({ tile, idx }) => {
                const riichiPick = riichiArming && (hand.legalActions?.riichiTiles ?? []).includes(idx);
                const selectable = isMyTurn && !busy && (riichiArming ? riichiPick : true);
                return (
                  <TileFace
                    key={idx}
                    tile={tile}
                    dimmed={riichiArming && !riichiPick}
                    highlight={riichiPick}
                    onHoverKind={setHoverKind}
                    disabled={!selectable}
                    onClick={
                      selectable
                        ? () => {
                            if (riichiArming) {
                              setRiichiArming(false);
                              act({ type: "riichi", tileIndex: idx });
                            } else {
                              act({ type: "discard", tileIndex: idx });
                            }
                          }
                        : undefined
                    }
                  />
                );
              })}
          </div>

          {riichiArming && (
            <p className="mt-2 text-center text-[11px] font-bold text-rose-600">
              리치하며 버릴 패를 고르세요 (테두리 표시된 패만 가능) ·{" "}
              <button type="button" onClick={() => setRiichiArming(false)} className="underline">
                취소
              </button>
            </p>
          )}

          {isMyTurn && hand.legalActions && !riichiArming && (
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
                  onClick={() => setRiichiArming(true)}
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
                  안깡({faceLabelIn(kind, notation)})
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
  const notation = useSyncExternalStore(subscribeNotation, readNotation, () => "hanja" as Notation);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshotKeyRef = useRef(JSON.stringify(initialSnapshot));

  // 표기법은 이 브라우저에만 저장되는 개인 설정
  function toggleNotation() {
    writeNotation(notation === "hanja" ? "hangul" : "hanja");
  }

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

  const body =
    snap.status === "waiting" ? (
      <WaitingRoom snap={snap} tableId={tableId} isHost={isHost} currentUserId={currentUserId} refresh={refresh} />
    ) : snap.status === "finished" ? (
      <FinalResultView snap={snap} />
    ) : !snap.hand ? (
      <div className="p-8 text-center text-sm text-faint">불러오는 중…</div>
    ) : (
      <LiveTable snap={snap} act={act} busy={busy} error={error} onToggleNotation={toggleNotation} />
    );

  return <NotationContext.Provider value={notation}>{body}</NotationContext.Provider>;
}
