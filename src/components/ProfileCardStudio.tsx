"use client";

import { useActionState, useState } from "react";
import { updateProfileCardStyle, type FormState } from "@/app/actions/auth";
import ProfileCard, { type ProfileCardData } from "@/components/ProfileCard";
import {
  CARD_STYLES,
  normalizeCardStyle,
  type ProfileCardStyle,
} from "@/lib/profileCard";
import { isHexColor } from "@/lib/theme";

export default function ProfileCardStudio({
  data,
  initialStyle,
  hasSheet,
}: {
  data: ProfileCardData;
  initialStyle: string;
  hasSheet: boolean;
}) {
  const [style, setStyle] = useState<ProfileCardStyle>(normalizeCardStyle(initialStyle));
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfileCardStyle,
    undefined,
  );
  const accent = isHexColor(data.accent ?? undefined) ? (data.accent as string) : "#6b6ff0";
  const dirty = style !== normalizeCardStyle(initialStyle);

  return (
    <div className="space-y-5">
      {/* 라이브 미리보기 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-extrabold text-content">미리보기</p>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-bold text-faint">
            공개 화면 기준
          </span>
        </div>
        <ProfileCard data={data} style={style} />
        {!hasSheet && (
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            캐릭터 시트를 연동하면 등급·능력치·소지금이 카드에 함께 표시돼요.
          </p>
        )}
      </div>

      {/* 스킨 선택 */}
      <div>
        <p className="mb-2 text-sm font-extrabold text-content">카드 디자인</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CARD_STYLES.map((meta) => {
            const selected = style === meta.key;
            return (
              <button
                key={meta.key}
                type="button"
                onClick={() => setStyle(meta.key)}
                className={`group overflow-hidden rounded-2xl border p-1 text-left transition ${
                  selected
                    ? "border-brand-400 ring-2 ring-brand-300"
                    : "border-line hover:border-brand-300"
                }`}
              >
                <div
                  className="relative flex h-16 items-end rounded-xl p-2"
                  style={
                    {
                      background: meta.swatch,
                      ["--c" as string]: accent,
                    } as React.CSSProperties
                  }
                >
                  <span
                    className="rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] font-black backdrop-blur-sm"
                    style={{ color: meta.swatchInk }}
                  >
                    {meta.label}
                  </span>
                  {selected && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-[11px] font-black text-brand-600 shadow">
                      ✓
                    </span>
                  )}
                </div>
                <p className="mt-1.5 px-1 pb-0.5 text-[11px] font-semibold text-faint">
                  {meta.tagline}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 저장 */}
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="cardStyle" value={style} />
        {state?.error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? "저장 중…" : dirty ? "이 디자인으로 저장" : "저장됨 · 다시 저장"}
        </button>
      </form>
    </div>
  );
}
