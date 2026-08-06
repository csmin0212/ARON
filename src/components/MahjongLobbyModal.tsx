"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useState } from "react";
import {
  createMahjongTable,
  deleteMahjongTable,
  joinMahjongTable,
  listMahjongTables,
  type MahjongActionState,
  type MahjongTableSummary,
} from "@/app/actions/mahjong";
import { TIERS_3P, TIERS_4P, type Tier } from "@/lib/mahjong";

const TIER_LABEL: Record<Tier, string> = { low: "저", mid: "중", high: "고" };

function CreateTableForm() {
  const [playerCount, setPlayerCount] = useState<3 | 4>(4);
  const [matchLength, setMatchLength] = useState<"tonpuusen" | "hanchan">("tonpuusen");
  const [kuitan, setKuitan] = useState(true);
  const [timePreset, setTimePreset] = useState<"fast" | "normal" | "slow">("normal");
  const [state, action, pending] = useActionState<MahjongActionState, FormData>(createMahjongTable, {
    ok: true,
    message: "",
  });
  const tiers = playerCount === 3 ? TIERS_3P : TIERS_4P;

  return (
    <form action={action} className="space-y-3 rounded-2xl border border-line bg-canvas p-4">
      <input type="hidden" name="playerCount" value={playerCount} />
      <input type="hidden" name="matchLength" value={matchLength} />
      <input type="hidden" name="kuitan" value={kuitan ? "on" : "off"} />
      <input type="hidden" name="timePreset" value={timePreset} />
      <p className="text-xs font-extrabold text-faint">새 방 만들기</p>

      <div className="flex gap-2">
        {([4, 3] as const).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setPlayerCount(n)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-extrabold transition ${
              playerCount === n
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-line bg-surface text-muted hover:bg-subtle"
            }`}
          >
            {n}인 {n === 3 ? "(사마)" : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(tiers) as Tier[]).map((key) => {
          const tier = tiers[key];
          return (
            <label
              key={key}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-line bg-surface px-2 py-3 text-center transition hover:border-brand-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
            >
              <input type="radio" name="tier" value={key} defaultChecked={key === "low"} className="sr-only" />
              <span className="text-[11px] font-extrabold text-faint">{TIER_LABEL[key]}</span>
              <span className="text-sm font-black text-content">{tier.gold}G</span>
              <span className="text-[10px] text-faint">{tier.startPoints.toLocaleString()}점</span>
            </label>
          );
        })}
      </div>

      <div className="flex gap-2">
        {([
          ["tonpuusen", "동풍전"],
          ["hanchan", "반장전"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMatchLength(key)}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
              matchLength === key
                ? "border-brand-500 bg-brand-50 text-brand-700"
                : "border-line bg-surface text-muted hover:bg-subtle"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setKuitan((v) => !v)}
          className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
            kuitan ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-line bg-surface text-muted hover:bg-subtle"
          }`}
        >
          쿠이탄 {kuitan ? "허용" : "금지"}
        </button>
      </div>

      <div className="space-y-1">
        <p className="px-1 text-[11px] font-bold text-faint">생각 시간 (기본 + 판당 적립)</p>
        <div className="flex gap-2">
          {([
            ["fast", "3초 +10"],
            ["normal", "5초 +20"],
            ["slow", "10초 +30"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTimePreset(key)}
              className={`flex-1 rounded-xl border px-2 py-2 text-xs font-extrabold transition ${
                timePreset === key
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-line bg-surface text-muted hover:bg-subtle"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "만드는 중..." : "방 만들기"}
      </button>
      {!state.ok && state.message && (
        <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600">{state.message}</p>
      )}
    </form>
  );
}

function JoinButton({ tableId }: { tableId: string }) {
  const [state, action, pending] = useActionState<MahjongActionState, FormData>(joinMahjongTable, {
    ok: true,
    message: "",
  });
  return (
    <form action={action}>
      <input type="hidden" name="tableId" value={tableId} />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "참가 중..." : "참가"}
      </button>
      {!state.ok && state.message && <p className="mt-1 text-[11px] font-bold text-rose-600">{state.message}</p>}
    </form>
  );
}

const MATCH_LENGTH_LABEL: Record<string, string> = { tonpuusen: "동풍전", hanchan: "반장전" };

// 내가 만든 방 없애기 — 대기 중인 방만
function DeleteRoomButton({ tableId, onDone }: { tableId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title="이 방 없애기"
      onClick={async () => {
        setBusy(true);
        await deleteMahjongTable(tableId);
        onDone();
      }}
      className="shrink-0 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-extrabold text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-60"
    >
      {busy ? "..." : "삭제"}
    </button>
  );
}

export default function MahjongLobbyModal({ onClose }: { onClose: () => void }) {
  const [tables, setTables] = useState<MahjongTableSummary[] | null>(null);

  const reload = useCallback(() => {
    listMahjongTables().then(setTables);
  }, []);

  useEffect(() => {
    let alive = true;
    listMahjongTables().then((rows) => {
      if (alive) setTables(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-faint">MAHJONG</p>
            <h3 className="mt-1 text-xl font-black text-content">🀄 마작</h3>
          </div>
          <Link href="/mahjong" className="rounded-lg bg-subtle px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-line">
            전적 보기
          </Link>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-faint">방 목록</p>
            {tables === null ? (
              <p className="py-6 text-center text-sm text-faint">불러오는 중…</p>
            ) : tables.length === 0 ? (
              <p className="rounded-2xl bg-canvas px-4 py-6 text-center text-sm text-faint">
                열려 있는 방이 없어요. 새로 만들어보세요.
              </p>
            ) : (
              <ul className="space-y-2">
                {tables.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-canvas px-3.5 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold text-content">
                        {t.hostNickname}님의 방 · {t.playerCount}인 {TIER_LABEL[t.tier as Tier] ?? t.tier} ·{" "}
                        {MATCH_LENGTH_LABEL[t.matchLength]}
                      </span>
                      <span className="text-[11px] text-faint">
                        {t.status === "playing" ? "대국 중" : `${t.filled}/${t.playerCount}명 참가`}
                      </span>
                    </span>
                    {t.status === "playing" ? (
                      <Link
                        href={`/mahjong/${t.id}`}
                        className="shrink-0 rounded-xl bg-subtle px-3 py-2 text-xs font-extrabold text-muted transition hover:bg-line"
                      >
                        관전
                      </Link>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <JoinButton tableId={t.id} />
                        {t.isHost && <DeleteRoomButton tableId={t.id} onDone={reload} />}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <CreateTableForm />

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-subtle px-4 py-2.5 text-sm font-bold text-muted transition hover:bg-line"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
