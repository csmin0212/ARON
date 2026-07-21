"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile, type FormState } from "@/app/actions/auth";
import { AVATAR_PRESETS } from "@/lib/avatars";
import { ACCENT_PRESETS, isHexColor } from "@/lib/theme";
import {
  PROFILE_VISIBILITY_KEYS,
  PROFILE_VISIBILITY_LABELS,
  type ProfileVisibility,
} from "@/lib/profile";
import ProfileHero, { type ProfileAchievementBadge } from "@/components/ProfileHero";

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function ProfileForm({
  initialUsername,
  initialNickname,
  initialAvatar,
  initialStatus,
  initialColor,
  initialCover,
  initialVisibility,
  achievementOptions = [],
  initialFeaturedAchievementIds = [],
}: {
  initialUsername: string;
  initialNickname: string;
  initialAvatar: string | null;
  initialStatus?: string | null;
  initialColor?: string | null;
  initialCover?: string | null;
  initialVisibility: ProfileVisibility;
  achievementOptions?: ProfileAchievementBadge[];
  initialFeaturedAchievementIds?: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateProfile,
    undefined,
  );
  const [nickname, setNickname] = useState(initialNickname);
  const [avatar, setAvatar] = useState<string>(initialAvatar ?? "");
  const [statusText, setStatusText] = useState<string>(initialStatus ?? "");
  const [color, setColor] = useState<string>(initialColor ?? "");
  const [cover, setCover] = useState<string>(initialCover ?? "");
  const [visibility, setVisibility] = useState<ProfileVisibility>(initialVisibility);
  const [featuredIds, setFeaturedIds] = useState<string[]>(
    Array.from({ length: 3 }, (_, i) => initialFeaturedAchievementIds[i] ?? ""),
  );
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isUrl = avatar !== "" && !avatar.startsWith("preset:");

  const selectedAchievements = featuredIds
    .map((id) => achievementOptions.find((achievement) => achievement.id === id))
    .filter((achievement): achievement is ProfileAchievementBadge => Boolean(achievement));

  function setFeaturedId(index: number, value: string) {
    setFeaturedIds((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function uploadCover(file: File) {
    setUploading(true);
    setCoverError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) setCoverError(data.error ?? "업로드에 실패했어요.");
      else setCover(data.url);
    } catch {
      setCoverError("업로드에 실패했어요.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-content">미리보기</p>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-bold text-faint">
            공개 화면 기준
          </span>
        </div>
        <ProfileHero
          nickname={nickname || "닉네임"}
          username={initialUsername}
          avatar={avatar || null}
          status={statusText || null}
          color={color}
          cover={cover}
          featuredAchievements={selectedAchievements}
          action={
            <span className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted shadow-sm">
              프로필 편집
            </span>
          }
        />
      </div>

      {/* 닉네임 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">닉네임</label>
        <input
          name="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          className={inputCls}
          placeholder="캐릭터 이름"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">상태 표시</label>
        <input
          name="profileStatus"
          value={statusText}
          onChange={(e) => setStatusText(e.target.value)}
          maxLength={20}
          className={inputCls}
          placeholder="온라인 / 오프라인 / 사냥중"
        />
      </div>

      {/* 캐릭터 사진 - 프리셋 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">캐릭터 사진</label>
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
          <label className="mb-1 block text-xs font-medium text-faint">
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

      {/* 프로필 꾸미기 */}
      <div className="space-y-4 rounded-2xl border border-line bg-subtle p-4">
        <p className="text-sm font-extrabold text-content">🎨 프로필 꾸미기</p>

        {/* 테마 색 */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">테마 색</label>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setColor("")}
              title="기본"
              className={`grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-[11px] font-bold text-faint transition ${
                color === "" ? "ring-2 ring-content ring-offset-2 ring-offset-subtle" : "hover:scale-110"
              }`}
            >
              ✕
            </button>
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setColor(p.color)}
                title={p.label}
                style={{ backgroundColor: p.color }}
                className={`h-7 w-7 rounded-full transition ${
                  color.toLowerCase() === p.color.toLowerCase()
                    ? "ring-2 ring-content ring-offset-2 ring-offset-subtle"
                    : "hover:scale-110"
                }`}
              />
            ))}
            <label className="ml-1 grid h-7 w-7 cursor-pointer place-items-center rounded-full border border-dashed border-line bg-surface text-xs">
              🎨
              <input
                type="color"
                value={isHexColor(color) ? color : "#6b6ff0"}
                onChange={(e) => setColor(e.target.value)}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* 커버 이미지 */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">커버 이미지 (선택)</label>
          <input
            type="url"
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            className={inputCls}
            placeholder="이미지 URL 붙여넣기"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadCover(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:bg-subtle-hover disabled:opacity-50"
            >
              {uploading ? "업로드 중…" : "🖼️ 이미지 업로드"}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() => setCover("")}
                className="rounded-lg px-2 py-2 text-xs font-semibold text-faint transition hover:text-rose-500"
              >
                커버 제거
              </button>
            )}
          </div>
          {coverError && (
            <p className="mt-1 text-xs font-medium text-rose-500">{coverError}</p>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            커버를 비우면 위 테마 색 그라데이션이 배너로 쓰여요. 이미지는 4MB 이하 (PNG·JPG·GIF·WEBP).
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-subtle p-4">
        <p className="text-sm font-extrabold text-content">🏅 대표 업적</p>
        {["대표 업적", "서브 업적 1", "서브 업적 2"].map((label, index) => (
          <div key={label}>
            <label className="mb-1.5 block text-xs font-semibold text-muted">{label}</label>
            <select
              name="featuredAchievementId"
              value={featuredIds[index] ?? ""}
              onChange={(e) => setFeaturedId(index, e.target.value)}
              className={inputCls}
            >
              <option value="">비우기</option>
              {achievementOptions.map((achievement) => (
                <option key={achievement.id} value={achievement.id}>
                  {achievement.badge ? `${achievement.badge} ` : ""}
                  {achievement.rewardTitle ?? achievement.name}
                </option>
              ))}
            </select>
          </div>
        ))}
        {achievementOptions.length === 0 && (
          <p className="rounded-xl bg-surface px-3 py-2 text-xs text-faint">
            아직 장착할 수 있는 달성 업적이 없어요.
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-subtle p-4">
        <p className="text-sm font-extrabold text-content">공개 설정</p>
        <div className="space-y-2">
          {PROFILE_VISIBILITY_KEYS.map((key) => {
            const isPublic = visibility[key];
            return (
              <div
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
              >
                <span className="text-sm font-bold text-content">
                  {PROFILE_VISIBILITY_LABELS[key]}
                </span>
                <div className="grid grid-cols-2 rounded-lg bg-subtle p-1 text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setVisibility((prev) => ({ ...prev, [key]: true }))}
                    className={`rounded-md px-3 py-1.5 transition ${
                      isPublic ? "bg-brand-500 text-white shadow-sm" : "text-muted hover:text-content"
                    }`}
                  >
                    공개
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility((prev) => ({ ...prev, [key]: false }))}
                    className={`rounded-md px-3 py-1.5 transition ${
                      !isPublic ? "bg-content text-surface shadow-sm" : "text-muted hover:text-content"
                    }`}
                  >
                    비공개
                  </button>
                </div>
                <input
                  type="hidden"
                  name={`visibility.${key}`}
                  value={isPublic ? "public" : "private"}
                />
              </div>
            );
          })}
        </div>
      </div>

      <input type="hidden" name="avatar" value={avatar} />
      <input type="hidden" name="profileColor" value={color} />
      <input type="hidden" name="profileCover" value={cover} />

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || uploading}
        className="w-full rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
      >
        {pending ? "저장 중…" : "프로필 저장"}
      </button>
    </form>
  );
}
