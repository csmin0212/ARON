"use client";

import { useActionState } from "react";
import {
  cleanupOldWorldMessages,
  syncWorldMap,
  type WorldActionState,
  type WorldCleanupState,
} from "@/app/actions/world";

export default function WorldAdmin() {
  const [state, formAction, pending] = useActionState<WorldActionState, FormData>(
    syncWorldMap,
    undefined,
  );
  const [cleanupState, cleanupAction, cleanupPending] = useActionState<
    WorldCleanupState,
    FormData
  >(cleanupOldWorldMessages, undefined);

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
