"use client";

import { useActionState, useTransition } from "react";
import { syncSheet, unlinkSheet, type SheetState } from "@/app/actions/charsheet";

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function SheetLinkForm({
  initialTab,
  syncedAt,
  masterUrl,
}: {
  initialTab?: string | null;
  syncedAt?: string | null;
  masterUrl: string;
}) {
  const [state, formAction, pending] = useActionState<SheetState, FormData>(syncSheet, undefined);
  const [unlinking, startUnlink] = useTransition();
  const linked = !!initialTab;

  return (
    <div className="space-y-3">
      <form action={formAction} className="space-y-2">
        <label className="block text-sm font-semibold text-content">캐릭터 탭 이름</label>
        <input
          name="sheetTab"
          defaultValue={initialTab ?? ""}
          placeholder="예: 실로"
          maxLength={40}
          className={inputCls}
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
          >
            {pending ? "불러오는 중…" : linked ? "🔄 다시 불러오기" : "📥 캐릭터 불러오기"}
          </button>
          {linked && (
            <button
              type="button"
              disabled={unlinking}
              onClick={() => {
                if (confirm("캐릭터 시트 연동을 해제할까요?")) startUnlink(() => void unlinkSheet());
              }}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-faint transition hover:text-rose-500 disabled:opacity-50"
            >
              연동 해제
            </button>
          )}
        </div>
      </form>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-600">
          ✅ 캐릭터 정보를 불러왔어요!
        </p>
      )}
      {linked && syncedAt && !state?.error && (
        <p className="text-xs text-faint">마지막 동기화: {syncedAt}</p>
      )}

      <p className="text-xs leading-relaxed text-faint">
        💡 마스터 시트{" "}
        <a
          href={masterUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand-600 hover:underline"
        >
          하단 탭 이름
        </a>
        을 그대로 입력하세요. 시트는 “링크가 있는 모든 사용자 보기 가능”으로 공유돼 있어야 해요.
      </p>
    </div>
  );
}
