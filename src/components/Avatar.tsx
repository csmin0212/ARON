import { getPreset, isImageUrl } from "@/lib/avatars";

// 일관된 색을 위해 이름 → 색 인덱스 해시
const FALLBACK_BG = [
  "from-rose-400 to-pink-500",
  "from-sky-400 to-blue-500",
  "from-emerald-400 to-green-500",
  "from-amber-400 to-orange-500",
  "from-violet-400 to-purple-500",
  "from-teal-400 to-cyan-500",
];

function hashIndex(str: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % mod;
}

export default function Avatar({
  name,
  avatar,
  size = 32,
  anonymous = false,
}: {
  name: string;
  avatar?: string | null;
  size?: number;
  anonymous?: boolean;
}) {
  const dim = { width: size, height: size };
  const fontSize = Math.round(size * 0.5);

  const preset = getPreset(avatar);
  if (preset) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${preset.bg} shadow-sm ring-1 ring-black/5`}
        style={{ ...dim, fontSize }}
        aria-hidden
      >
        {preset.emoji}
      </span>
    );
  }

  if (isImageUrl(avatar)) {
    // 외부 임의 URL 이므로 next/image 대신 일반 img (도메인 화이트리스트 불필요)
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar as string}
        alt={name}
        className="inline-block shrink-0 rounded-full object-cover shadow-sm ring-1 ring-black/5"
        style={dim}
      />
    );
  }

  if (anonymous) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-400 ring-1 ring-black/5"
        style={{ ...dim, fontSize }}
        aria-hidden
      >
        🙂
      </span>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const bg = FALLBACK_BG[hashIndex(name, FALLBACK_BG.length)];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${bg} font-bold text-white shadow-sm ring-1 ring-black/5`}
      style={{ ...dim, fontSize: Math.round(size * 0.42) }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
