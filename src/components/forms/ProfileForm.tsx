"use client";

import { useActionState, useState } from "react";
import { updateProfile, type FormState } from "@/app/actions/auth";
import { AVATAR_PRESETS } from "@/lib/avatars";
import Avatar from "@/components/Avatar";

const inputCls =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function ProfileForm({
  initialNickname,
  initialAvatar,
}: {
  initialNickname: string;
  initialAvatar: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfile,
    undefined,
  );
  const [nickname, setNickname] = useState(initialNickname);
  const [avatar, setAvatar] = useState<string>(initialAvatar ?? "");
  const isUrl = avatar !== "" && !avatar.startsWith("preset:");

  return (
    <form action={formAction} className="space-y-6">
      {/* 미리보기 */}
      <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4">
        <Avatar name={nickname || "?"} avatar={avatar || null} size={64} />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-slate-800">{nickname || "닉네임"}</p>
          <p className="text-xs text-slate-400">이렇게 표시됩니다</p>
        </div>
      </div>

      {/* 닉네임 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-600">닉네임</label>
        <input
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className={inputCls}
          placeholder="캐릭터 이름"
        />
      </div>

      {/* 캐릭터 사진 - 프리셋 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-600">캐릭터 사진</label>
        <div className="grid grid-cols-6 gap-2">
          {AVATAR_PRESETS.map((p) => {
            const key = `preset:${p.key}`;
            const selected = avatar === key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setAvatar(key)}
                className={`grid aspect-square place-items-center rounded-xl bg-gradient-to-br ${p.bg} text-xl transition ${
                  selected
                    ? "scale-105 ring-2 ring-brand-500 ring-offset-2"
                    : "opacity-85 hover:opacity-100"
                }`}
              >
                {p.emoji}
              </button>
            );
          })}
        </div>

        {/* 또는 이미지 URL */}
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-400">
            또는 이미지 URL 직접 입력
          </label>
          <input
            type="url"
            value={isUrl ? avatar : ""}
            onChange={(e) => setAvatar(e.target.value)}
            className={inputCls}
            placeholder="https://example.com/avatar.png"
          />
        </div>
      </div>

      <input type="hidden" name="avatar" value={avatar} />

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
        {pending ? "저장 중…" : "프로필 저장"}
      </button>
    </form>
  );
}
