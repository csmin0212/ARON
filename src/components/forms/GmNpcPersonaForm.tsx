"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveGmNpcPersonas, switchGmNpcPersona, type GmNpcState } from "@/app/actions/gmNpc";
import Avatar from "@/components/Avatar";
import type { GmNpcPersona } from "@/lib/gmNpc";

export default function GmNpcPersonaForm({
  ownName,
  ownAvatar,
  personas,
  activeKey,
}: {
  ownName: string;
  ownAvatar: string | null;
  personas: GmNpcPersona[];
  activeKey: string | null;
}) {
  const [state, action, pending] = useActionState<GmNpcState, FormData>(saveGmNpcPersonas, undefined);
  const active = personas.find((persona) => persona.key === activeKey) ?? null;

  return (
    <section className="rounded-3xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-400">
            GM NPC MODE
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-content">NPC 페르소나</h2>
          <p className="mt-1 text-sm text-muted">
            현재 표시: <b className="text-violet-600">{active?.name ?? ownName}</b>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/write"
            className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-black text-white transition hover:bg-violet-600"
          >
            글쓰기
          </Link>
          <Link
            href="/world"
            className="rounded-xl border border-violet-200 bg-surface px-3 py-2 text-xs font-black text-violet-600 transition hover:bg-violet-50"
          >
            월드로
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <form action={switchGmNpcPersona}>
          <input type="hidden" name="key" value="self" />
          <button
            type="submit"
            className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${
              activeKey == null
                ? "border-violet-300 bg-surface text-violet-700 shadow-sm"
                : "border-line bg-surface/70 text-muted hover:bg-surface"
            }`}
          >
            <Avatar name={ownName} avatar={ownAvatar} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold">본캐</span>
              <span className="block truncate text-[11px] font-bold">{ownName}</span>
            </span>
          </button>
        </form>
        {personas.map((persona) => (
          <form key={persona.key} action={switchGmNpcPersona}>
            <input type="hidden" name="key" value={persona.key} />
            <button
              type="submit"
              className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left transition ${
                activeKey === persona.key
                  ? "border-violet-300 bg-surface text-violet-700 shadow-sm"
                  : "border-line bg-surface/70 text-muted hover:bg-surface"
              }`}
            >
              <Avatar name={persona.name} avatar={persona.avatar} size={28} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{persona.name}</span>
                <span className="block truncate text-[11px] font-bold">{persona.key.toUpperCase()}</span>
              </span>
            </button>
          </form>
        ))}
      </div>

      <form action={action} className="mt-4 space-y-3">
        <div className="grid gap-3">
          {personas.map((persona) => (
            <div key={persona.key} className="grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[5rem_1fr_1.5fr]">
              <label className="flex items-center gap-2 text-xs font-black text-muted">
                <input
                  type="radio"
                  name="activeNpcPersonaKey"
                  value={persona.key}
                  defaultChecked={activeKey === persona.key}
                  className="accent-violet-500"
                />
                {persona.key.toUpperCase()}
              </label>
              <input
                name={`${persona.key}Name`}
                defaultValue={persona.name}
                maxLength={20}
                className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm font-bold text-content outline-none focus:border-violet-300"
                placeholder="NPC 이름"
              />
              <input
                name={`${persona.key}Avatar`}
                defaultValue={persona.avatar ?? ""}
                className="rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-content outline-none focus:border-violet-300"
                placeholder="preset:knight 또는 이미지 URL"
              />
            </div>
          ))}
          <label className="inline-flex w-fit items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs font-black text-muted">
            <input
              type="radio"
              name="activeNpcPersonaKey"
              value="self"
              defaultChecked={activeKey == null}
              className="accent-violet-500"
            />
            저장 후 본캐로 표시
          </label>
        </div>

        {state?.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-500">{state.error}</p>
        )}
        {state?.ok && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-600">{state.ok}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-violet-600 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "NPC 슬롯 저장"}
        </button>
      </form>
    </section>
  );
}
