"use client";

import { useActionState, useState } from "react";
import {
  cleanupOldWorldMessages,
  resetWeeklyDungeons,
  restoreAllFatigue,
  syncWorldMap,
  type WorldActionState,
  type WorldCleanupState,
} from "@/app/actions/world";
import { openRift, closeRift, type RiftActionState } from "@/app/actions/rift";
import { sendMail, type MailState } from "@/app/actions/mail";
import { RIFT_TYPES } from "@/lib/rift";

export type AdminRift = { id: string; type: string; originName: string; count: number };
export type AdminPlayer = { userId: string; label: string };

export default function WorldAdmin({
  locations = [],
  openRifts = [],
  players = [],
}: {
  locations?: { id: string; name: string }[];
  openRifts?: AdminRift[];
  players?: AdminPlayer[];
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const [state, formAction, pending] = useActionState<WorldActionState, FormData>(
    syncWorldMap,
    undefined,
  );
  const [cleanupState, cleanupAction, cleanupPending] = useActionState<
    WorldCleanupState,
    FormData
  >(cleanupOldWorldMessages, undefined);
  const [riftOpenState, riftOpenAction, riftOpenPending] = useActionState<RiftActionState, FormData>(
    openRift,
    undefined,
  );
  const [riftCloseState, riftCloseAction, riftClosePending] = useActionState<RiftActionState, FormData>(
    closeRift,
    undefined,
  );
  const [dungeonResetState, dungeonResetAction, dungeonResetPending] = useActionState<
    WorldCleanupState,
    FormData
  >(resetWeeklyDungeons, undefined);
  const [fatigueState, fatigueAction, fatiguePending] = useActionState<WorldCleanupState, FormData>(
    restoreAllFatigue,
    undefined,
  );
  const [mailState, mailAction, mailPending] = useActionState<MailState, FormData>(
    sendMail,
    undefined,
  );

  return (
    <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-brand-700">🛠 GM 도구</p>
          <p className="text-xs text-muted">
            GM 맵 시트(WORLD_SHEET_ID)의 ‘맵’ 탭에서 월드를 불러옵니다.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? "동기화 중…" : "🔄 맵 동기화"}
          </button>
        </form>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-brand-200/70 pt-3">
        <div>
          <p className="text-xs font-bold text-brand-700">채팅 로그 관리</p>
          <p className="text-xs text-muted">
            RP 기록 보존을 위해 최근 90일은 남기고, 오래된 월드 채팅만 정리합니다.
          </p>
        </div>
        <form action={cleanupAction}>
          <button
            type="submit"
            disabled={cleanupPending}
            className="rounded-xl border border-brand-300 bg-surface px-3.5 py-2 text-xs font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 disabled:opacity-60"
          >
            {cleanupPending ? "정리 중..." : "90일 지난 채팅 청소"}
          </button>
        </form>
      </div>
      {/* 균열 관리 */}
      <div className="mt-3 border-t border-brand-200/70 pt-3">
        <p className="text-xs font-bold text-brand-700">⚡ 균열 관리</p>
        <form action={riftOpenAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            name="type"
            className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs font-semibold text-content outline-none"
          >
            {RIFT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            name="originId"
            className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs font-semibold text-content outline-none"
          >
            <option value="">— 열 장소 —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={riftOpenPending}
            className="rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-fuchsia-500 disabled:opacity-60"
          >
            {riftOpenPending ? "여는 중…" : "균열 열기"}
          </button>
        </form>
        {(riftOpenState?.error || riftOpenState?.ok) && (
          <p className={`mt-2 text-xs font-medium ${riftOpenState.error ? "text-rose-600" : "text-emerald-600"}`}>
            {riftOpenState.error ?? `✅ ${riftOpenState.ok}`}
          </p>
        )}
        {openRifts.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {openRifts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                <span className="truncate text-xs font-semibold text-content">
                  {r.type} @ {r.originName} <span className="text-faint">({r.count}/4)</span>
                </span>
                <form action={riftCloseAction}>
                  <input type="hidden" name="riftId" value={r.id} />
                  <button
                    type="submit"
                    disabled={riftClosePending}
                    className="rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                  >
                    닫기
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {riftCloseState?.error && (
          <p className="mt-2 text-xs font-medium text-rose-600">{riftCloseState.error}</p>
        )}
      </div>

      {/* 플레이어 관리 */}
      <div className="mt-3 border-t border-brand-200/70 pt-3">
        <p className="text-xs font-bold text-brand-700">👥 플레이어 관리</p>
        <p className="text-xs text-muted">대상을 고르고 적용하세요. ‘전체’면 모든 플레이어에게 적용됩니다.</p>
        <select
          value={targetUserId}
          onChange={(e) => setTargetUserId(e.target.value)}
          className="mt-2 w-full rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs font-semibold text-content outline-none"
        >
          <option value="">— 전체 플레이어 —</option>
          {players.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={dungeonResetAction}>
            <input type="hidden" name="userId" value={targetUserId} />
            <button
              type="submit"
              disabled={dungeonResetPending}
              className="rounded-xl border border-brand-300 bg-surface px-3.5 py-2 text-xs font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 disabled:opacity-60"
            >
              {dungeonResetPending ? "초기화 중…" : "⚔️ 주간 던전 횟수 초기화"}
            </button>
          </form>
          <form action={fatigueAction}>
            <input type="hidden" name="userId" value={targetUserId} />
            <button
              type="submit"
              disabled={fatiguePending}
              className="rounded-xl border border-brand-300 bg-surface px-3.5 py-2 text-xs font-bold text-brand-700 shadow-sm transition hover:bg-brand-50 disabled:opacity-60"
            >
              {fatiguePending ? "회복 중…" : "⚡ 피로도 회복"}
            </button>
          </form>
        </div>
        {(dungeonResetState?.error || dungeonResetState?.ok) && (
          <p className={`mt-2 text-xs font-medium ${dungeonResetState.error ? "text-rose-600" : "text-emerald-600"}`}>
            {dungeonResetState.error ?? `✅ ${dungeonResetState.ok}`}
          </p>
        )}
        {(fatigueState?.error || fatigueState?.ok) && (
          <p className={`mt-2 text-xs font-medium ${fatigueState.error ? "text-rose-600" : "text-emerald-600"}`}>
            {fatigueState.error ?? `✅ ${fatigueState.ok}`}
          </p>
        )}
      </div>

      {/* 우편 보내기 */}
      <div className="mt-3 border-t border-brand-200/70 pt-3">
        <p className="text-xs font-bold text-brand-700">📬 우편 보내기</p>
        <p className="text-xs text-muted">골드·아이템을 첨부하면 받는 사람이 우편함에서 수령합니다.</p>
        <form action={mailAction} className="mt-2 space-y-2">
          <select
            name="userId"
            defaultValue=""
            className="w-full rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs font-semibold text-content outline-none"
          >
            <option value="">— 전체 플레이어 —</option>
            {players.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            name="subject"
            placeholder="제목"
            required
            className="w-full rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs text-content outline-none"
          />
          <textarea
            name="body"
            placeholder="내용 (선택)"
            rows={2}
            className="w-full rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs text-content outline-none"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              name="gold"
              type="number"
              min={0}
              placeholder="골드"
              className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs text-content outline-none"
            />
            <input
              name="itemName"
              placeholder="아이템(이름/ID)"
              className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs text-content outline-none"
            />
            <input
              name="itemQty"
              type="number"
              min={1}
              placeholder="수량"
              className="rounded-xl border border-brand-200 bg-surface px-3 py-2 text-xs text-content outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={mailPending}
            className="w-full rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
          >
            {mailPending ? "보내는 중…" : "우편 보내기"}
          </button>
        </form>
        {(mailState?.error || mailState?.ok) && (
          <p className={`mt-2 text-xs font-medium ${mailState.error ? "text-rose-600" : "text-emerald-600"}`}>
            {mailState.error ?? `✅ ${mailState.ok}`}
          </p>
        )}
      </div>

      {state?.error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
          ✅ {state.ok}
        </p>
      )}
      {cleanupState?.error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {cleanupState.error}
        </p>
      )}
      {cleanupState?.ok && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
          ✅ {cleanupState.ok}
        </p>
      )}
    </div>
  );
}
