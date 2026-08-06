// 마작패 그림 — 이미지 파일 없이 인라인 SVG 로 그린다.
// 실물/작혼 패를 참고한 디테일:
//  · 우상단에 작은 빨간 인덱스 숫자 — 작아져도 이것만 보고 읽을 수 있다
//  · 통수는 단색 점이 아니라 겹동그라미(고리), 먹색 바탕에 일부 빨강
//  · 삭수는 마디가 있는 대나무, 초록 바탕에 일부 빨강
//  · 자패는 큰 글자 하나 (백은 빈 테두리)
// 좌표계는 100 x 140 (실제 패 비율).

const INK = "#23201c"; // 먹빛 검정
const RED = "#b3272d";
const GREEN = "#1d6b3f";

const MAN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR_CHAR = ["", "東", "南", "西", "北", "", "發", "中"]; // 5=백은 빈 테두리

// ── 통(筒) 배치 ──
const PIN_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 72]],
  2: [
    [50, 44],
    [50, 100],
  ],
  3: [
    [27, 38],
    [50, 72],
    [73, 106],
  ],
  4: [
    [33, 47],
    [67, 47],
    [33, 97],
    [67, 97],
  ],
  5: [
    [31, 43],
    [69, 43],
    [50, 72],
    [31, 101],
    [69, 101],
  ],
  6: [
    [33, 38],
    [67, 38],
    [33, 72],
    [67, 72],
    [33, 106],
    [67, 106],
  ],
  7: [
    [30, 32],
    [50, 45],
    [70, 58],
    [33, 90],
    [67, 90],
    [33, 118],
    [67, 118],
  ],
  8: [
    [33, 32],
    [67, 32],
    [33, 60],
    [67, 60],
    [33, 88],
    [67, 88],
    [33, 116],
    [67, 116],
  ],
  9: [
    [27, 36],
    [50, 36],
    [73, 36],
    [27, 72],
    [50, 72],
    [73, 72],
    [27, 108],
    [50, 108],
    [73, 108],
  ],
};

// 실물 패에서 빨간 고리인 자리(0-based)
const PIN_RED: Record<number, number[]> = {
  1: [0],
  3: [1],
  5: [2],
  7: [3, 4, 5, 6],
  9: [3, 4, 5],
};

// ── 삭(索) 배치 ──
const SOU_LAYOUT: Record<number, [number, number][]> = {
  2: [
    [50, 42],
    [50, 100],
  ],
  3: [
    [50, 36],
    [33, 102],
    [67, 102],
  ],
  4: [
    [33, 42],
    [67, 42],
    [33, 100],
    [67, 100],
  ],
  5: [
    [31, 38],
    [69, 38],
    [50, 71],
    [31, 104],
    [69, 104],
  ],
  6: [
    [30, 40],
    [50, 40],
    [70, 40],
    [30, 102],
    [50, 102],
    [70, 102],
  ],
  7: [
    [50, 28],
    [30, 78],
    [50, 78],
    [70, 78],
    [30, 118],
    [50, 118],
    [70, 118],
  ],
  8: [
    [34, 32],
    [66, 32],
    [34, 66],
    [66, 66],
    [34, 100],
    [66, 100],
    [34, 128],
    [66, 128],
  ],
  9: [
    [28, 34],
    [50, 34],
    [72, 34],
    [28, 72],
    [50, 72],
    [72, 72],
    [28, 110],
    [50, 110],
    [72, 110],
  ],
};

// 고리가 서로 겹치지 않게 개수별로 반지름을 따로 잡는다(간격을 재서 맞춘 값)
const PIN_R: Record<number, number> = { 1: 30, 2: 22, 3: 18, 4: 16, 5: 16, 6: 15.5, 7: 13, 8: 12.5, 9: 10.5 };

const SOU_RED: Record<number, number[]> = {
  5: [2],
  7: [0],
  9: [3, 4, 5],
};

// 겹동그라미 — 실물 통수는 단색 점이 아니라 고리 안에 무늬가 있다
function PinRing({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke={color} strokeWidth={r * 0.3} />
      <circle cx={x} cy={y} r={r * 0.52} fill="none" stroke={color} strokeWidth={r * 0.22} />
      <circle cx={x} cy={y} r={r * 0.16} fill={color} />
    </g>
  );
}

// 마디가 있는 대나무
function Bamboo({ x, y, h, color }: { x: number; y: number; h: number; color: string }) {
  const w = h * 0.4;
  const half = h / 2;
  return (
    <g>
      <rect x={x - w / 2} y={y - half} width={w} height={h} rx={w * 0.32} fill={color} />
      <rect x={x - w / 2} y={y - h * 0.2} width={w} height={h * 0.09} fill="#fff" opacity={0.9} />
      <rect x={x - w / 2} y={y + h * 0.11} width={w} height={h * 0.09} fill="#fff" opacity={0.9} />
      <rect x={x - w * 0.62} y={y - half} width={w * 1.24} height={h * 0.13} rx={w * 0.2} fill={color} />
      <rect x={x - w * 0.62} y={y + half - h * 0.13} width={w * 1.24} height={h * 0.13} rx={w * 0.2} fill={color} />
    </g>
  );
}

// 우상단 인덱스 — 작혼처럼 작은 빨간 글자
function CornerIndex({ label }: { label: string }) {
  return (
    <text x="90" y="28" textAnchor="end" fontSize="28" fontWeight="800" fill={RED}>
      {label}
    </text>
  );
}

export function TileArt({ kind, compact }: { kind: number; compact?: boolean }) {
  const n = (kind % 9) + 1;

  // 아주 작게 그릴 때(버림패 20px 안팎)는 무늬가 뭉개진다 — 큰 글자 하나로.
  if (compact && kind < 27) {
    const color = kind < 9 ? RED : kind < 18 ? INK : GREEN;
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <text x="50" y="104" textAnchor="middle" fontSize="104" fontWeight="800" fill={color}>
          {n}
        </text>
      </svg>
    );
  }

  // 만수 — 한자 숫자 + 萬
  if (kind < 9) {
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <CornerIndex label={String(n)} />
        <text x="50" y="76" textAnchor="middle" fontSize="52" fontWeight="700" fill={INK}>
          {MAN_NUM[n]}
        </text>
        <text x="50" y="130" textAnchor="middle" fontSize="46" fontWeight="700" fill={RED}>
          萬
        </text>
      </svg>
    );
  }

  // 통수 — 겹동그라미
  if (kind < 18) {
    const pts = PIN_LAYOUT[n] ?? [];
    const reds = PIN_RED[n] ?? [];
    const r = PIN_R[n] ?? 14;
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <CornerIndex label={String(n)} />
        {pts.map(([x, y], i) => (
          <PinRing key={i} x={x} y={y} r={r} color={reds.includes(i) ? RED : INK} />
        ))}
      </svg>
    );
  }

  // 삭수 — 마디 있는 대나무 (1삭은 새)
  if (kind < 27) {
    if (n === 1) {
      return (
        <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
          <CornerIndex label="1" />
          <ellipse cx="50" cy="82" rx="22" ry="29" fill={GREEN} />
          <path d="M40 70 Q26 86 38 102 Q46 88 44 72 Z" fill="#fff" opacity={0.5} />
          <circle cx="50" cy="44" r="14" fill={GREEN} />
          <path d="M50 52 L59 63 L41 63 Z" fill={RED} />
          <circle cx="45" cy="41" r="3.2" fill="#fff" />
          <path d="M50 108 L37 135 L50 126 L63 135 Z" fill={RED} />
        </svg>
      );
    }
    const pts = SOU_LAYOUT[n] ?? [];
    const reds = SOU_RED[n] ?? [];
    const h = n <= 4 ? 48 : n <= 6 ? 42 : 32;
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <CornerIndex label={String(n)} />
        {pts.map(([x, y], i) => (
          <Bamboo key={i} x={x} y={y} h={h} color={reds.includes(i) ? RED : GREEN} />
        ))}
      </svg>
    );
  }

  // 자패 — 백은 빈 테두리, 발 초록, 중 빨강, 바람은 먹색
  const hn = kind - 26; // 1東 2南 3西 4北 5白 6發 7中
  if (hn === 5) {
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <rect x="21" y="26" width="58" height="88" rx="7" fill="none" stroke="#2f6fb5" strokeWidth="7" />
      </svg>
    );
  }
  const color = hn === 6 ? GREEN : hn === 7 ? RED : INK;
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <text x="50" y="98" textAnchor="middle" fontSize="74" fontWeight="700" fill={color}>
        {HONOR_CHAR[hn]}
      </text>
    </svg>
  );
}
