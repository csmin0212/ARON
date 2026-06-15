import type { CSSProperties, ReactNode } from "react";
import Avatar from "./Avatar";
import { isHexColor } from "@/lib/theme";

// 프로필 장식 헤더 — 커버(이미지 또는 색 그라데이션) + 아바타 + 정체성.
// profileColor 는 배너 안쪽 --accent 를 덮어써 그라데이션·배지가 그 색을 따른다.
export default function ProfileHero({
  nickname,
  username,
  avatar,
  level,
  rank,
  tags = [],
  color,
  cover,
  action,
  footer,
}: {
  nickname: string;
  username: string;
  avatar: string | null;
  level?: number | null;
  rank?: string | null;
  tags?: string[];
  color?: string | null;
  cover?: string | null;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const accentStyle = isHexColor(color ?? undefined)
    ? ({ "--accent": color } as CSSProperties)
    : undefined;
  const coverStyle: CSSProperties | undefined = cover
    ? { backgroundImage: `url("${cover}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  return (
    <div
      className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm"
      style={accentStyle}
    >
      <div
        className="h-28 bg-gradient-to-r from-brand-400 via-brand-500 to-brand-700"
        style={coverStyle}
      />
      <div className="px-6 pb-5">
        <div className="-mt-12 flex items-end justify-between gap-3">
          <span className="inline-flex rounded-full ring-4 ring-surface">
            <Avatar name={nickname} avatar={avatar} size={88} />
          </span>
          <div className="mb-1.5 flex items-center gap-2">
            {rank && (
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-xl font-black text-white shadow-sm"
                title={`모험가 랭크 ${rank}`}
              >
                {rank}
              </span>
            )}
            {action}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold text-content">{nickname}</h1>
          {level != null && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-600">
              Lv.{level}
            </span>
          )}
        </div>
        <p className="text-sm text-faint">@{username}</p>

        {tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span
                key={i}
                className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {footer && <div className="mt-4">{footer}</div>}
      </div>
    </div>
  );
}
