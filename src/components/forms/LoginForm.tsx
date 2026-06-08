"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type FormState } from "@/app/actions/auth";

const inputCls =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(login, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">아이디</label>
        <input name="username" autoComplete="username" className={inputCls} placeholder="아이디" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-slate-500">비밀번호</label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputCls}
          placeholder="비밀번호"
        />
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
        {pending ? "로그인 중…" : "로그인"}
      </button>

      <p className="pt-1 text-center text-sm text-slate-400">
        아직 회원이 아니신가요?{" "}
        <Link href="/register" className="font-semibold text-brand-600 hover:underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
