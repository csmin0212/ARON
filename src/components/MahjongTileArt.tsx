// 마작패 그림 — 이미지 파일 없이 인라인 SVG 로 그린다.
// 외부 에셋(라이선스·로딩·깨짐) 없이 어떤 크기에서도 선명하고, 색으로 수트가 바로 구분된다.
// 좌표계는 100 x 140 (실제 패 비율에 가깝게).

const PIN = "#1d63c4"; // 통(원) — 파랑
const PIN2 = "#c8322b"; // 통 강조 — 빨강
const SOU = "#177a4a"; // 삭(대나무) — 초록
const MAN = "#1f2937"; // 만(숫자) — 먹색
const RED = "#c8322b";
const GREEN = "#177a4a";

const MAN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const HONOR_CHAR = ["", "東", "南", "西", "北", "", "發", "中"]; // 5=백은 빈 테두리로 그린다

// ── 통(筒) — 동그라미 배치 ──
const PIN_LAYOUT: Record<number, [number, number][]> = {
  1: [[50, 70]],
  2: [
    [50, 42],
    [50, 98],
  ],
  3: [
    [26, 36],
    [50, 70],
    [74, 104],
  ],
  4: [
    [32, 44],
    [68, 44],
    [32, 96],
    [68, 96],
  ],
  5: [
    [30, 40],
    [70, 40],
    [50, 70],
    [30, 100],
    [70, 100],
  ],
  6: [
    [32, 34],
    [68, 34],
    [32, 70],
    [68, 70],
    [32, 106],
    [68, 106],
  ],
  7: [
    [28, 30],
    [50, 44],
    [72, 58],
    [32, 88],
    [68, 88],
    [32, 116],
    [68, 116],
  ],
  8: [
    [32, 28],
    [68, 28],
    [32, 58],
    [68, 58],
    [32, 88],
    [68, 88],
    [32, 118],
    [68, 118],
  ],
  9: [
    [26, 32],
    [50, 32],
    [74, 32],
    [26, 70],
    [50, 70],
    [74, 70],
    [26, 108],
    [50, 108],
    [74, 108],
  ],
};

// ── 삭(索) — 대나무 배치. 1삭만 새 그림 ──
const SOU_LAYOUT: Record<number, [number, number][]> = {
  2: [
    [50, 40],
    [50, 100],
  ],
  3: [
    [50, 34],
    [32, 100],
    [68, 100],
  ],
  4: [
    [32, 40],
    [68, 40],
    [32, 100],
    [68, 100],
  ],
  5: [
    [30, 36],
    [70, 36],
    [50, 70],
    [30, 104],
    [70, 104],
  ],
  6: [
    [30, 34],
    [50, 34],
    [70, 34],
    [30, 104],
    [50, 104],
    [70, 104],
  ],
  7: [
    [50, 26],
    [30, 74],
    [50, 74],
    [70, 74],
    [30, 116],
    [50, 116],
    [70, 116],
  ],
  8: [
    [32, 28],
    [68, 28],
    [32, 62],
    [68, 62],
    [32, 96],
    [68, 96],
    [32, 126],
    [68, 126],
  ],
  9: [
    [28, 30],
    [50, 30],
    [72, 30],
    [28, 70],
    [50, 70],
    [72, 70],
    [28, 110],
    [50, 110],
    [72, 110],
  ],
};

function PinDot({ x, y, r, accent }: { x: number; y: number; r: number; accent?: boolean }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={accent ? PIN2 : PIN} />
      <circle cx={x} cy={y} r={r * 0.45} fill="#fff" />
    </>
  );
}

function Bamboo({ x, y, h, color = SOU }: { x: number; y: number; h: number; color?: string }) {
  const w = h * 0.42;
  return (
    <>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} fill={color} />
      <rect x={x - w / 2} y={y - h * 0.08} width={w} height={h * 0.16} fill="#fff" opacity={0.85} />
    </>
  );
}

// compact: 버림패처럼 20px 안팎으로 작게 그릴 때. 만수의 '一萬' 두 글자는 그 크기에선
// 뭉개져서 못 읽으므로 큰 아라비아 숫자 하나로 바꾼다(색으로 수트가 구분되므로 충분).
export function TileArt({ kind, compact }: { kind: number; compact?: boolean }) {
  const n = (kind % 9) + 1;

  if (kind < 9 && compact) {
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <text x="50" y="104" textAnchor="middle" fontSize="104" fontWeight="800" fill={RED}>
          {n}
        </text>
      </svg>
    );
  }

  // 만수 — 한자 숫자 + 萬
  if (kind < 9) {
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <text x="50" y="58" textAnchor="middle" fontSize="54" fontWeight="700" fill={MAN}>
          {MAN_NUM[n]}
        </text>
        <text x="50" y="122" textAnchor="middle" fontSize="50" fontWeight="700" fill={RED}>
          萬
        </text>
      </svg>
    );
  }

  // 통수 — 동그라미
  if (kind < 18) {
    const pts = PIN_LAYOUT[n] ?? [];
    const r = n === 1 ? 32 : n <= 4 ? 20 : n <= 6 ? 17.5 : 15;
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        {pts.map(([x, y], i) => (
          <PinDot key={i} x={x} y={y} r={r} accent={n === 1 || (n === 5 && i === 2)} />
        ))}
      </svg>
    );
  }

  // 삭수 — 대나무 (1삭은 새)
  if (kind < 27) {
    if (n === 1) {
      return (
        <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
          {/* 몸통 */}
          <ellipse cx="50" cy="78" rx="24" ry="30" fill={SOU} />
          {/* 머리 */}
          <circle cx="50" cy="38" r="15" fill={SOU} />
          {/* 부리 */}
          <path d="M50 46 L58 56 L42 56 Z" fill={PIN2} />
          {/* 눈 */}
          <circle cx="45" cy="35" r="3.2" fill="#fff" />
          {/* 꼬리 */}
          <path d="M50 104 L38 130 L50 122 L62 130 Z" fill={PIN2} />
        </svg>
      );
    }
    const pts = SOU_LAYOUT[n] ?? [];
    const h = n <= 4 ? 50 : n <= 6 ? 44 : 34;
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        {pts.map(([x, y], i) => (
          <Bamboo key={i} x={x} y={y} h={h} color={n === 5 && i === 2 ? PIN2 : SOU} />
        ))}
      </svg>
    );
  }

  // 자패 — 백은 빈 테두리, 발은 초록, 중은 빨강, 바람은 먹색
  const hn = kind - 26; // 1東 2南 3西 4北 5白 6發 7中
  if (hn === 5) {
    return (
      <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
        <rect x="20" y="28" width="60" height="84" rx="6" fill="none" stroke={PIN} strokeWidth="7" />
      </svg>
    );
  }
  const color = hn === 6 ? GREEN : hn === 7 ? RED : MAN;
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <text x="50" y="96" textAnchor="middle" fontSize="72" fontWeight="700" fill={color}>
        {HONOR_CHAR[hn]}
      </text>
    </svg>
  );
}
