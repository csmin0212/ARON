"use client";

import { useActionState } from "react";
import Link from "next/link";
import { register, type FormState } from "@/app/actions/auth";

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(register, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">아이디</label>
        <input name="username" autoComplete="username" className={inputCls} placeholder="영문/숫자 4~20자" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">비밀번호</label>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputCls}
          placeholder="4자 이상"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">닉네임 (캐릭터명)</label>
        <input name="nickname" className={inputCls} placeholder="갤러리에 표시될 이름" />
      </div>

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
        {pending ? "가입 중…" : "회원가입"}
      </button>

      <p className="pt-1 text-center text-sm text-faint">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          로그인
        </Link>
      </p>
    </form>
  );
}
