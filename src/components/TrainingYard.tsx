"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trainOnce, pickTrainingStat } from "@/app/actions/training";

export type TrainingStat = { key: string; label: string; value: number | null };
export type TrainingView = {
  count: number;
  pendingPicks: number;
  currentMilestone: number | null; // 지금 고를 선택이 몇 회째 마일스톤인지(100~900)
  stats: TrainingStat[];
};

const TRAIN_AP = 5;

export default function TrainingYard({
  training,
  ap,
  onClose,
}: {
  training: TrainingView;
  ap: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // 밀린 선택이 있으면(새로 열렸든, 예전에 안 골랐든) 능력치 선택 창을 띄운다.
  const picking = training.pendingPicks > 0;
  const milestone = training.currentMilestone;

  async function train() {
    if (busy || picking) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    const r = await trainOnce();
    if ("error" in r) {
      setError(r.error);
      setBusy(false);
      return;
    }
    if (r.skillPoints > 0) {
      setFlash(`🎉 단련 ${r.spMilestone}회 달성! 스킬 포인트 +${r.skillPoints} (시트 AF61에 반영)`);
    } else if (r.spWriteFailed) {
      setError("스킬 포인트를 시트에 기록하지 못했어요. 잠시 후 다시 단련하면 재시도돼요.");
    } else if (!r.statMilestone) {
      setFlash("묵묵히 몸을 단련했다…");
    }
    // pendingPicks·AP 갱신 위해 서버 데이터 새로고침 (선택 창은 새 props 로 자동 표시)
    router.refresh();
    setBusy(false);
  }

  async function pick(key: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    const r = await pickTrainingStat(key);
    if ("error" in r) {
      setError(r.error);
      setBusy(false);
      return;
    }
    setFlash(`💪 ${r.label} +1! 능력치가 성장했다. (프로필에서 시트 동기화 시 반영)`);
    router.refresh();
    setBusy(false);
  }

  const notLinked = training.stats.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="길드 뒷마당"
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line bg-gradient-to-r from-amber-50 to-orange-50 px-5 pt-4 pb-4">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-500">
            Guild Backyard
          </p>
          <h3 className="mt-1 text-2xl font-extrabold text-content">🏋️ 길드 뒷마당</h3>
          <p className="mt-1 text-[12px] font-semibold text-amber-700">
            묵묵히 몸을 단련하는 곳. 꾸준함은 언젠가 결실이 된다.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {picking ? (
            <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-center text-[11px] font-black uppercase tracking-widest text-amber-500">
                Training Milestone
              </p>
              <h4 className="mt-1 text-center text-xl font-extrabold text-content">
                {milestone ? `단련 ${milestone.toLocaleString()}회!` : "단련의 결실!"}
              </h4>
              <p className="mt-1 text-center text-[13px] font-semibold text-amber-700">
                성장시킬 능력치를 하나 선택하세요.
              </p>
              {training.pendingPicks > 1 && (
                <p className="mt-1 text-center text-[11px] font-bold text-amber-500">
                  선택 대기 {training.pendingPicks}회 남음
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {training.stats.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => pick(s.key)}
                    disabled={busy}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-surface px-3 py-2.5 text-left transition hover:border-amber-400 hover:bg-amber-100 disabled:opacity-50"
                  >
                    <span className="text-sm font-extrabold text-content">{s.label}</span>
                    {s.value != null && (
                      <span className="text-sm font-black text-amber-600">{s.value}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-faint">
                선택한 능력치의 기본치가 시트에서 +1 됩니다.
              </p>
            </section>
          ) : (
            <>
              <section className="rounded-2xl border border-line bg-subtle p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-muted">현재 피로도</span>
                  <span className="text-lg font-black text-content">
                    ⚡ {ap.toLocaleString()}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={train}
                  disabled={busy || notLinked || ap < TRAIN_AP}
                  className="mt-3 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3.5 text-base font-extrabold text-white shadow-sm transition hover:from-amber-600 hover:to-orange-600 disabled:opacity-50"
                >
                  {busy ? "단련 중…" : `🏋️ 단련하기 (피로도 ${TRAIN_AP})`}
                </button>
                {ap < TRAIN_AP && !notLinked && (
                  <p className="mt-2 text-center text-[11px] font-semibold text-rose-500">
                    피로도가 부족해요. 6분마다 1씩 회복돼요.
                  </p>
                )}
                {notLinked && (
                  <p className="mt-2 text-center text-[11px] font-semibold text-rose-500">
                    프로필에서 캐릭터 시트를 먼저 동기화해주세요.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-muted">현재 단련 횟수</span>
                  <span className="text-lg font-black text-content">
                    {training.count.toLocaleString()}회
                  </span>
                </div>
              </section>
            </>
          )}

          {flash && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[12px] font-bold text-emerald-600">
              {flash}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-[12px] font-bold text-rose-600">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-subtle px-4 py-2.5 text-sm font-bold text-muted transition hover:bg-subtle-hover"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
