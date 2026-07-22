// 카드 스킨별 테마 일러스트(인라인 SVG). 콘텐츠 뒤(-z-10)에 깔리는 장식 레이어.
// 외부 에셋 없이 벡터로 그려 CSP·자체완결성을 지킨다. game-icons 계열 모티프를 참고해 새로 그림.

export type SceneKey =
  | "angler"
  | "botanist"
  | "miner"
  | "chef"
  | "smith"
  | "alchemist"
  | "crest"
  | "legend";

function Layer({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[26px]">
      {children}
    </div>
  );
}

// ── 낚시: 파도 · 물고기 · 낚싯대 · 물방울 ──
function Angler() {
  return (
    <Layer>
      {/* 낚싯대 + 낚싯줄 + 미끼 */}
      <svg className="absolute right-3 top-2 h-28 w-28 opacity-70" viewBox="0 0 120 120" fill="none">
        <path d="M18 96 L96 20" stroke="#0e5a86" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M96 20 q7 3 8 10" stroke="#0e5a86" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <circle cx="30" cy="84" r="5.5" fill="none" stroke="#0e5a86" strokeWidth="2.5" />
        <path d="M104 30 L100 62" stroke="#38bdf8" strokeWidth="1.5" />
        <path d="M100 62 q-5 6 2 9 q7 -3 2 -9" fill="#0284c7" />
      </svg>
      {/* 물고기들 */}
      <svg className="absolute left-[16%] top-[38%] h-6 w-10 opacity-40" viewBox="0 0 40 20" fill="#0369a1">
        <path d="M4 10 C10 3 26 3 34 10 C26 17 10 17 4 10 Z" />
        <path d="M4 10 L-2 5 L-2 15 Z" />
        <circle cx="28" cy="9" r="1.6" fill="#e0f2fe" />
      </svg>
      <svg className="absolute right-[30%] top-[30%] h-4 w-7 opacity-30" viewBox="0 0 40 20" fill="#0c4a6e">
        <path d="M4 10 C10 3 26 3 34 10 C26 17 10 17 4 10 Z" />
        <path d="M4 10 L-2 5 L-2 15 Z" />
      </svg>
      {/* 물방울 */}
      <div className="absolute left-[10%] top-[26%] h-2 w-2 rounded-full bg-white/50" />
      <div className="absolute left-[13%] top-[20%] h-1.5 w-1.5 rounded-full bg-white/40" />
      <div className="absolute right-[42%] top-[22%] h-1.5 w-1.5 rounded-full bg-white/40" />
      {/* 불가사리(레퍼런스 느낌) */}
      <div className="absolute bottom-3 left-4 text-lg opacity-40">⭐</div>
      {/* 바닥 파도 2겹 */}
      <svg className="absolute inset-x-0 bottom-0 h-16 w-full" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d="M0 26 Q50 6 100 26 T200 26 T300 26 T400 26 V60 H0 Z" fill="#7dd3fc" opacity="0.45" />
        <path d="M0 38 Q50 18 100 38 T200 38 T300 38 T400 38 V60 H0 Z" fill="#38bdf8" opacity="0.5" />
      </svg>
    </Layer>
  );
}

// ── 채집: 언덕 · 잎 · 새싹 · 포자 ──
function Botanist() {
  return (
    <Layer>
      {/* 잎사귀 */}
      <svg className="absolute right-4 top-3 h-16 w-16 opacity-50" viewBox="0 0 60 60" fill="none">
        <path d="M52 8 C22 10 12 30 10 52 C34 50 52 34 52 8 Z" fill="#22c55e" opacity="0.85" />
        <path d="M46 16 C30 22 20 34 14 48" stroke="#15803d" strokeWidth="2" fill="none" />
      </svg>
      <svg className="absolute left-[20%] top-[26%] h-9 w-9 opacity-40" viewBox="0 0 60 60" fill="none">
        <path d="M8 52 C10 22 30 12 52 10 C50 40 34 50 8 52 Z" fill="#4ade80" />
      </svg>
      {/* 새싹 */}
      <svg className="absolute right-[34%] top-[34%] h-7 w-7 opacity-45" viewBox="0 0 40 40" fill="none">
        <path d="M20 38 V18" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20 22 C10 20 6 12 8 6 C16 6 22 12 20 22 Z" fill="#4ade80" />
        <path d="M20 26 C30 24 34 16 32 10 C24 10 18 16 20 26 Z" fill="#22c55e" />
      </svg>
      {/* 포자 */}
      <div className="absolute left-[14%] top-[20%] h-1.5 w-1.5 rounded-full bg-lime-300/60" />
      <div className="absolute right-[24%] top-[16%] h-1 w-1 rounded-full bg-lime-300/50" />
      {/* 바닥 언덕 */}
      <svg className="absolute inset-x-0 bottom-0 h-14 w-full" viewBox="0 0 400 50" preserveAspectRatio="none">
        <path d="M0 30 Q80 12 160 26 T320 24 T400 28 V50 H0 Z" fill="#86efac" opacity="0.5" />
        <path d="M0 40 Q100 26 200 38 T400 36 V50 H0 Z" fill="#4ade80" opacity="0.5" />
      </svg>
    </Layer>
  );
}

// ── 채광: 광맥 · 보석 · 곡괭이 ──
function Gem({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 2 L20 9 L12 22 L4 9 Z" fill={c} />
      <path d="M4 9 H20 M12 2 L12 22 M8 9 L12 22 L16 9" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  );
}

function Miner() {
  return (
    <Layer>
      {/* 곡괭이 */}
      <svg className="absolute right-[17%] top-[8%] h-20 w-24 opacity-75" viewBox="0 0 96 80" fill="none">
        <path d="M8 26 Q48 2 88 26" stroke="#cbd5e1" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M8 26 Q48 2 88 26" stroke="#f1f5f9" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.7" />
        <rect x="44" y="20" width="7" height="52" rx="3.5" fill="#8a5a2e" />
        <rect x="45.5" y="20" width="2" height="52" rx="1" fill="#c08a4a" opacity="0.6" />
      </svg>
      {/* 보석 */}
      <div className="absolute right-[41%] top-[28%] h-8 w-8 opacity-80">
        <Gem c="#f59e0b" />
      </div>
      <div className="absolute left-[22%] top-[34%] h-5 w-5 opacity-55">
        <Gem c="#fbbf24" />
      </div>
      <div className="absolute right-[47%] top-[20%] text-xs text-amber-300/60">✦</div>
      {/* 바닥 광맥(들쭉날쭉 바위) */}
      <svg className="absolute inset-x-0 bottom-0 h-12 w-full" viewBox="0 0 400 40" preserveAspectRatio="none">
        <path d="M0 40 L0 24 L40 30 L80 16 L130 28 L180 14 L240 26 L300 16 L360 28 L400 20 L400 40 Z" fill="#f59e0b" opacity="0.2" />
        <path d="M0 40 L0 32 L50 34 L100 26 L160 34 L220 24 L290 34 L360 28 L400 34 L400 40 Z" fill="#0f1218" opacity="0.5" />
      </svg>
    </Layer>
  );
}

// ── 요리: 냄비 · 김 · 조리도구 ──
function Chef() {
  return (
    <Layer>
      <svg className="absolute right-[18%] top-[7%] h-24 w-24 opacity-75" viewBox="0 0 88 84" fill="none">
        {/* 김 */}
        <g stroke="#c2410c" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" fill="none">
          <path d="M32 20 C26 14 36 12 32 6" />
          <path d="M46 20 C40 14 50 12 46 6" />
        </g>
        {/* 수저 */}
        <g fill="#b07a4a">
          <rect x="60" y="30" width="4" height="34" rx="2" transform="rotate(24 62 47)" />
          <ellipse cx="72" cy="30" rx="5.5" ry="8" transform="rotate(24 72 30)" />
        </g>
        {/* 냄비 */}
        <path d="M16 38 H58 L54 64 C53 68 49 70 45 70 H29 C25 70 21 68 20 64 Z" fill="#c2410c" />
        <rect x="11" y="32" width="52" height="7" rx="3.5" fill="#9a3412" />
        <ellipse cx="37" cy="28" rx="11" ry="4" fill="#9a3412" />
        <circle cx="37" cy="23" r="2.5" fill="#7c2d12" />
        <path d="M11 36 q-7 1 -6 8" stroke="#9a3412" strokeWidth="3.5" fill="none" />
        <path d="M63 36 q7 1 6 8" stroke="#9a3412" strokeWidth="3.5" fill="none" />
      </svg>
      {/* 바닥 따뜻한 글로우 */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(0deg, rgba(251,146,60,0.28), transparent)" }} />
    </Layer>
  );
}

// ── 제작: 모루 · 망치 · 불꽃 ──
function Smith() {
  return (
    <Layer>
      <svg className="absolute right-[15%] top-[6%] h-24 w-28 opacity-80" viewBox="0 0 112 96" fill="none">
        {/* 모루 */}
        <g fill="#b8c2d0">
          <path d="M24 44 H86 V54 H24 Z" />
          <path d="M24 44 V54 L8 49 Z" />
          <rect x="46" y="53" width="18" height="15" />
          <rect x="32" y="67" width="46" height="10" rx="2" />
        </g>
        <path d="M24 45 H86" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
        {/* 망치 */}
        <g transform="rotate(-30 64 30)">
          <rect x="44" y="18" width="30" height="12" rx="2.5" fill="#7c8598" />
          <rect x="56" y="9" width="9" height="11" rx="2" fill="#98a3b5" />
          <rect x="59" y="28" width="6" height="44" rx="3" fill="#8a5a2e" />
        </g>
      </svg>
      {/* 불티 */}
      <div className="absolute right-[38%] top-[26%] h-2 w-2 rounded-full bg-orange-400/70" />
      <div className="absolute right-[31%] top-[18%] h-1.5 w-1.5 rounded-full bg-amber-300/70" />
      <div className="absolute right-[43%] top-[34%] h-1 w-1 rounded-full bg-orange-300/60" />
      {/* 바닥 잉걸불 글로우 */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(0deg, rgba(249,115,22,0.3), transparent)" }} />
    </Layer>
  );
}

// ── 연금술: 플라스크 · 기포 · 별 ──
function Alchemist() {
  return (
    <Layer>
      {/* 플라스크 */}
      <svg className="absolute right-[20%] top-[14%] h-20 w-16 opacity-65" viewBox="0 0 64 80" fill="none">
        <path d="M26 10 H38 V34 L52 64 C55 71 50 76 43 76 H21 C14 76 9 71 12 64 L26 34 Z" fill="rgba(94,234,212,0.28)" stroke="#5eead4" strokeWidth="2" />
        <path d="M18 52 H46 L52 64 C55 71 50 76 43 76 H21 C14 76 9 71 12 64 Z" fill="rgba(168,85,247,0.4)" />
        <rect x="24" y="6" width="16" height="5" rx="2.5" fill="#c084fc" />
        <circle cx="28" cy="60" r="2.5" fill="#e9d5ff" opacity="0.8" />
        <circle cx="38" cy="66" r="2" fill="#e9d5ff" opacity="0.7" />
      </svg>
      {/* 상승 기포 */}
      <div className="absolute right-[16%] top-[10%] h-2 w-2 rounded-full bg-teal-200/70" />
      <div className="absolute right-[22%] top-[4%] h-1.5 w-1.5 rounded-full bg-fuchsia-200/60" />
      {/* 별/반짝임 */}
      <div className="absolute left-[18%] top-[26%] text-fuchsia-200/70">✦</div>
      <div className="absolute left-[26%] top-[38%] text-teal-200/60 text-xs">✦</div>
      <div className="absolute right-[38%] top-[34%] text-violet-200/50 text-[10px]">✦</div>
      {/* 바닥 신비 글로우 */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(0deg, rgba(168,85,247,0.24), transparent)" }} />
    </Layer>
  );
}

// ── 훈장(동/은/금): 월계관 · 리본 · 광채 ──
function Crest({ tone }: { tone: string }) {
  return (
    <Layer>
      {/* 등급 배지 뒤 광채 */}
      <div
        className="absolute right-[-3px] top-[-4px] h-28 w-28 rounded-full opacity-40 blur-xl"
        style={{ background: `radial-gradient(circle, ${tone}, transparent 70%)` }}
      />
      {/* 월계관 */}
      <svg className="absolute right-1 top-1 h-24 w-24 opacity-40" viewBox="0 0 100 100" fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round">
        <path d="M50 88 C28 84 16 66 16 44 C16 30 22 18 30 12" />
        <path d="M50 88 C72 84 84 66 84 44 C84 30 78 18 70 12" />
        {[24, 36, 48, 60].map((y, i) => (
          <g key={i}>
            <path d={`M${18 + i * 2} ${y} q-9 -5 -13 -13`} />
            <path d={`M${82 - i * 2} ${y} q9 -5 13 -13`} />
          </g>
        ))}
      </svg>
      {/* 리본 */}
      <svg className="absolute bottom-2 left-4 h-12 w-12 opacity-35" viewBox="0 0 48 48" fill={tone}>
        <path d="M14 4 L24 22 L34 4 L30 4 L24 14 L18 4 Z" />
        <path d="M24 18 L12 44 L20 40 L24 46 L28 40 L36 44 Z" opacity="0.8" />
      </svg>
    </Layer>
  );
}

// ── 전설의 모험가(S): 왕관 · 날개 · 화염 · 광선 (붉은색) ──
function Legend() {
  return (
    <Layer>
      {/* 등급 배지 뒤 광선 */}
      <div
        className="absolute right-[3%] top-[1%] h-32 w-32 rounded-full opacity-45 blur-xl"
        style={{ background: "radial-gradient(circle, rgba(244,63,94,0.6), transparent 70%)" }}
      />
      {/* 날개 + 왕관 크레스트 */}
      <svg className="absolute right-1 top-1 h-24 w-32 opacity-55" viewBox="0 0 128 96" fill="none">
        {/* 날개 */}
        <g fill="#fca5a5" opacity="0.7">
          <path d="M64 40 C46 30 28 30 12 40 C30 40 40 46 50 56 C40 52 30 52 22 56 C36 58 46 62 56 70 Z" />
          <path d="M64 40 C82 30 100 30 116 40 C98 40 88 46 78 56 C88 52 98 52 106 56 C92 58 82 62 72 70 Z" />
        </g>
        {/* 왕관 */}
        <path d="M50 34 L54 18 L62 28 L64 12 L66 28 L74 18 L78 34 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.5" />
        <circle cx="64" cy="12" r="2.5" fill="#fecaca" />
      </svg>
      {/* 화염 */}
      <svg className="absolute left-[16%] top-[30%] h-12 w-8 opacity-45" viewBox="0 0 40 60" fill="none">
        <path d="M20 58 C6 50 8 34 18 24 C16 34 24 34 24 26 C34 34 36 48 24 56 C28 50 24 44 20 44 C18 48 22 52 20 58 Z" fill="#f43f5e" />
        <path d="M20 56 C12 50 14 40 20 34 C20 42 26 42 24 36 C30 42 30 50 20 56 Z" fill="#fbbf24" opacity="0.85" />
      </svg>
      {/* 반짝임 */}
      <div className="absolute left-[24%] top-[22%] text-rose-200/70">✦</div>
      <div className="absolute right-[42%] top-[40%] text-amber-200/60 text-xs">✦</div>
      {/* 바닥 붉은 광채 */}
      <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(0deg, rgba(244,63,94,0.24), transparent)" }} />
    </Layer>
  );
}

export default function CardScene({ scene, tone }: { scene?: SceneKey | null; tone?: string }) {
  switch (scene) {
    case "angler":
      return <Angler />;
    case "botanist":
      return <Botanist />;
    case "miner":
      return <Miner />;
    case "chef":
      return <Chef />;
    case "smith":
      return <Smith />;
    case "alchemist":
      return <Alchemist />;
    case "crest":
      return <Crest tone={tone ?? "#e2a86e"} />;
    case "legend":
      return <Legend />;
    default:
      return null;
  }
}
