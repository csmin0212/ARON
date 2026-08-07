"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveGmNpcPersonas, switchGmNpcPersona, type GmNpcState } from "@/app/actions/gmNpc";
import Avatar from "@/components/Avatar";
import { GM_NPC_SLOT_MAX, nextGmNpcSlotKey, type GmNpcPersona } from "@/lib/gmNpc";

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

  // 슬롯 추가·제거는 저장 전까지 화면에서만 일어난다 — 서버로 왕복하면 입력하던 이름이 날아간다.
  const savedKeys = personas.map((persona) => persona.key).join(",");
  const [slots, setSlots] = useState<GmNpcPersona[]>(personas);
  const [syncedKeys, setSyncedKeys] = useState(savedKeys);
  if (syncedKeys !== savedKeys) {
    // 저장이 끝나 서버 목록이 바뀌면 화면 상태를 거기에 맞춘다.
    setSyncedKeys(savedKeys);
    setSlots(personas);
  }

  const dirty = slots.map((slot) => slot.key).join(",") !== savedKeys;
  const canAdd = slots.length < GM_NPC_SLOT_MAX;

  const addSlot = () => {
    const key = nextGmNpcSlotKey(slots);
    if (!key || !canAdd) return;
    setSlots((prev) => [...prev, { key, name: `NPC ${key.slice(3)}`, avatar: null }]);
  };

  const removeSlot = (key: string, name: string) => {
    const warning =
      key === activeKey
        ? `'${name}' 슬롯을 지웁니다. 지금 이 NPC로 표시 중이라 저장하면 본캐로 돌아갑니다. 계속할까요?`
        : `'${name}' 슬롯을 지웁니다. 저장해야 실제로 반영됩니다. 계속할까요?`;
    if (!window.confirm(warning)) return;
    setSlots((prev) => prev.filter((slot) => slot.key !== key));
  };

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
        {/* 서버는 이 목록으로 슬롯을 재구성한다 — 여기 없는 키는 제거된 것으로 본다 */}
        <input type="hidden" name="slotKeys" value={slots.map((slot) => slot.key).join(",")} />
        <div className="grid gap-3">
          {slots.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-center text-xs font-bold text-faint">
              NPC 슬롯이 없습니다. 아래에서 추가해보세요.
            </p>
          )}
          {slots.map((persona) => (
            <div
              key={persona.key}
              className="grid gap-2 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[5rem_1fr_1.5fr_auto]"
            >
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
              <button
                type="button"
                onClick={() => removeSlot(persona.key, persona.name)}
                title={`${persona.key.toUpperCase()} 슬롯 제거`}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-black text-faint transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
              >
                제거
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addSlot}
              disabled={!canAdd}
              className="rounded-xl border border-violet-200 bg-surface px-3 py-2 text-xs font-black text-violet-600 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + 슬롯 추가
            </button>
            <span className="text-[11px] font-bold text-faint">
              {slots.length} / {GM_NPC_SLOT_MAX}칸
              {!canAdd && " · 최대까지 채웠어요"}
            </span>
          </div>

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

        {dirty && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600">
            슬롯 구성이 아직 저장되지 않았어요. 아래 저장 버튼을 눌러야 반영됩니다.
          </p>
        )}

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
