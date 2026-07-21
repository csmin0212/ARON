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
import { CARD_STYLES, ownsSkin } from "@/lib/profileCard";
import { purchaseCardSkin } from "@/app/actions/cardSkin";
import {
  MAX_WIDGETS,
  WIDGET_LIST,
  WIDGET_META,
  resolveWidgets,
  type ProfileValues,
  type WidgetKey,
} from "@/lib/profileWidgets";
import type { ProfileIdentity } from "@/lib/profileValues";
import ProfileHero, { type ProfileAchievementBadge } from "@/components/ProfileHero";
import ProfileCard from "@/components/ProfileCard";
import ProfileContent, { HERO_CONTENT_STYLE } from "@/components/ProfileContent";

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export interface ProfileBaseIdentity {
  level: number | null;
  rank: string | null;
  rankPct: number;
  charClass: string | null;
  race: string | null;
  attribute: string | null;
}

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
  initialMain,
  initialCardStyle,
  initialWidgets,
  initialOwnedSkins,
  initialGold,
  baseIdentity,
  values,
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
  initialMain: "hero" | "card";
  initialCardStyle: string;
  initialWidgets: WidgetKey[];
  initialOwnedSkins: string[];
  initialGold: number;
  baseIdentity: ProfileBaseIdentity;
  values: ProfileValues;
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
  const [main, setMain] = useState<"hero" | "card">(initialMain);
  const [cardStyle, setCardStyle] = useState<string>(initialCardStyle);
  const [previewStyle, setPreviewStyle] = useState<string>(initialCardStyle);
  const [widgets, setWidgets] = useState<WidgetKey[]>(initialWidgets);
  const [owned, setOwned] = useState<string[]>(initialOwnedSkins);
  const [gold, setGold] = useState<number>(initialGold);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isUrl = avatar !== "" && !avatar.startsWith("preset:");

  const selectedAchievements = featuredIds
    .map((id) => achievementOptions.find((achievement) => achievement.id === id))
    .filter((achievement): achievement is ProfileAchievementBadge => Boolean(achievement));
  const featured0 = selectedAchievements[0];

  const swatchAccent = isHexColor(color) ? color : "#6b6ff0";

  function setFeaturedId(index: number, value: string) {
    setFeaturedIds((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function buySkin(key: string) {
    setBuying(key);
    setBuyMsg(null);
    const res = await purchaseCardSkin(key);
    setBuying(null);
    if (res && "ok" in res && res.ok) {
      setOwned(res.owned);
      setGold(res.gold);
      setCardStyle(res.skin);
      setPreviewStyle(res.skin);
    } else if (res && "error" in res) {
      setBuyMsg(res.error);
    }
  }

  function toggleWidget(key: WidgetKey) {
    setWidgets((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : prev.length >= MAX_WIDGETS
          ? prev
          : [...prev, key],
    );
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

  // ── 미리보기 ──
  const tags = [
    baseIdentity.charClass,
    baseIdentity.race,
    baseIdentity.attribute && `속성 ${baseIdentity.attribute}`,
  ].filter(Boolean) as string[];

  const identity: ProfileIdentity = {
    nickname: nickname || "닉네임",
    username: initialUsername,
    avatar: avatar || null,
    status: statusText || null,
    accent: isHexColor(color) ? color : null,
    level: baseIdentity.level,
    rank: baseIdentity.rank,
    rankPct: baseIdentity.rankPct,
    charClass: baseIdentity.charClass,
    race: baseIdentity.race,
    attribute: baseIdentity.attribute,
    title: featured0 ? featured0.rewardTitle ?? featured0.name : null,
    badge: featured0?.badge ?? null,
  };
  const resolved = resolveWidgets(widgets, values);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold text-content">미리보기</p>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-[11px] font-bold text-faint">
            공개 화면 기준
          </span>
        </div>
        {main === "card" ? (
          <ProfileCard identity={identity} widgets={resolved} style={previewStyle} />
        ) : (
          <ProfileHero
            nickname={identity.nickname}
            username={identity.username}
            avatar={identity.avatar}
            status={identity.status}
            level={identity.level}
            rank={identity.rank}
            tags={tags}
            color={color}
            cover={cover}
            featuredAchievements={selectedAchievements}
            footer={
              resolved.length > 0 ? (
                <ProfileContent widgets={resolved} style={HERO_CONTENT_STYLE} />
              ) : undefined
            }
          />
        )}
      </div>

      {/* 프로필 형태 */}
      <div className="space-y-4 rounded-2xl border border-line bg-subtle p-4">
        <p className="text-sm font-extrabold text-content">🖼️ 프로필 형태</p>
        <p className="-mt-2 text-[11px] leading-relaxed text-faint">
          공개 프로필 상단에 무엇을 보여줄지 골라요. 하나만 보여야 깔끔해요.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: "hero", label: "메인 프로필", desc: "배너 · 아바타" },
              { key: "card", label: "프로필 카드", desc: "게임형 명함" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setMain(opt.key)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                main === opt.key
                  ? "border-brand-400 bg-brand-50/70 ring-2 ring-brand-200"
                  : "border-line bg-surface hover:border-brand-300"
              }`}
            >
              <p className="text-sm font-extrabold text-content">{opt.label}</p>
              <p className="text-[11px] font-medium text-faint">{opt.desc}</p>
            </button>
          ))}
        </div>

        {main === "card" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted">카드 디자인</label>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-faint">
                🪙 {gold.toLocaleString()}G
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {CARD_STYLES.map((meta) => {
                const isOwned = ownsSkin(meta.key, owned);
                const selected = cardStyle === meta.key;
                const previewing = previewStyle === meta.key;
                const swatchStyle = {
                  background: meta.swatch,
                  ["--c" as string]: swatchAccent,
                } as React.CSSProperties;

                if (isOwned) {
                  return (
                    <button
                      key={meta.key}
                      type="button"
                      onClick={() => {
                        setCardStyle(meta.key);
                        setPreviewStyle(meta.key);
                      }}
                      className={`overflow-hidden rounded-xl border p-1 text-left transition ${
                        previewing ? "border-brand-400 ring-2 ring-brand-300" : "border-line hover:border-brand-300"
                      }`}
                    >
                      <div className="relative flex h-14 items-end rounded-lg p-1.5" style={swatchStyle}>
                        <span
                          className="rounded bg-black/15 px-1 py-0.5 text-[10px] font-black backdrop-blur-sm"
                          style={{ color: meta.swatchInk }}
                        >
                          {meta.label}
                        </span>
                        {selected && (
                          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-white/90 text-[10px] font-black text-brand-600">
                            ✓
                          </span>
                        )}
                        {previewing && !selected && (
                          <span className="absolute right-1 top-1 rounded bg-white/90 px-1 py-0.5 text-[9px] font-black text-brand-600">
                            미리보기
                          </span>
                        )}
                        {meta.acquire === "reward" && (
                          <span className="absolute left-1 top-1 rounded bg-black/30 px-1 py-0.5 text-[8px] font-black text-amber-200">
                            CBT
                          </span>
                        )}
                      </div>
                    </button>
                  );
                }

                return (
                  <div
                    key={meta.key}
                    className={`overflow-hidden rounded-xl border p-1 transition ${
                      previewing ? "border-brand-400 ring-2 ring-brand-300" : "border-line hover:border-brand-300"
                    }`}
                  >
                    <div className="relative flex h-14 items-end rounded-lg p-1.5" style={swatchStyle}>
                      <button
                        type="button"
                        onClick={() => setPreviewStyle(meta.key)}
                        className="absolute inset-0 rounded-lg"
                        aria-label={`${meta.label} 카드 미리보기`}
                      />
                      <div className="pointer-events-none absolute inset-0 rounded-lg bg-black/45" />
                      <span className="pointer-events-none relative rounded bg-black/25 px-1 py-0.5 text-[10px] font-black text-white/90">
                        {meta.label}
                      </span>
                      {previewing && (
                        <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-white/90 px-1 py-0.5 text-[9px] font-black text-brand-600">
                          미리보기
                        </span>
                      )}
                      {meta.acquire === "reward" ? (
                        <span className="pointer-events-none absolute inset-x-0 top-1.5 mx-auto w-fit rounded-full bg-black/45 px-2 py-0.5 text-[9px] font-black text-amber-200">
                          🔒 CBT 보상
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={buying === meta.key}
                          onClick={() => void buySkin(meta.key)}
                          className="absolute inset-x-1 top-1 z-10 rounded-md bg-white/90 py-1 text-[10px] font-black text-brand-600 shadow transition hover:bg-white disabled:opacity-60"
                        >
                          {buying === meta.key ? "구매 중…" : `${meta.price.toLocaleString()}G 구매`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {buyMsg && <p className="text-[11px] font-medium text-rose-500">{buyMsg}</p>}
            <p className="text-[11px] leading-relaxed text-faint">
              카드를 누르면 바로 미리보기돼요. 기본은 무료 · CBT는 보상 전용 · 나머지는 8,000G에 구매해요.
            </p>
          </div>
        )}
      </div>

      {/* 내용물 (위젯) */}
      <div className="space-y-3 rounded-2xl border border-line bg-subtle p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-content">🧩 내용물</p>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-faint">
            {widgets.length} / {MAX_WIDGETS}
          </span>
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-faint">
          추가한 순서대로 표시돼요. 최대 {MAX_WIDGETS}개 (능력치·도감은 넓게 차지해요).
        </p>

        {widgets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {widgets.map((k, i) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleWidget(k)}
                className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-brand-600"
                title="빼기"
              >
                <span className="opacity-60">{i + 1}</span>
                <span>
                  {WIDGET_META[k].emoji} {WIDGET_META[k].label}
                </span>
                <span className="ml-0.5 opacity-80">✕</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {WIDGET_LIST.filter((w) => !widgets.includes(w.key)).map((w) => {
            const locked = w.needsSheet && !values.hasSheet;
            const full = widgets.length >= MAX_WIDGETS;
            const disabled = locked || full;
            return (
              <button
                key={w.key}
                type="button"
                disabled={disabled}
                onClick={() => toggleWidget(w.key)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-muted transition hover:border-brand-300 hover:text-content disabled:cursor-not-allowed disabled:opacity-40"
                title={locked ? "시트 연동 필요" : full ? "최대치 도달" : "추가"}
              >
                <span className="opacity-60">＋</span>
                {w.emoji} {w.label}
              </button>
            );
          })}
        </div>

        {!values.hasSheet && (
          <p className="rounded-xl bg-surface px-3 py-2 text-[11px] text-faint">
            시트를 연동하면 레벨·소지금·능력치·도감 완성률도 넣을 수 있어요.
          </p>
        )}
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

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">
            커버 이미지 (선택 · 메인 프로필 배너)
          </label>
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
          {coverError && <p className="mt-1 text-xs font-medium text-rose-500">{coverError}</p>}
          <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
            커버를 비우면 테마 색 그라데이션이 배너로 쓰여요. 이미지는 4MB 이하 (PNG·JPG·GIF·WEBP).
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
      <input type="hidden" name="profileMain" value={main} />
      <input type="hidden" name="profileCardStyle" value={cardStyle} />
      {widgets.map((k) => (
        <input key={k} type="hidden" name="widget" value={k} />
      ))}

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
