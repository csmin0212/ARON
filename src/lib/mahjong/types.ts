// 마작 엔진 공용 타입. kind는 0~33 (0-8:만, 9-17:통, 18-26:삭, 27-30:동남서북, 31-33:백발중)

export type Suit = "m" | "p" | "s" | "z";

export interface Tile {
  kind: number;
  aka: boolean;
}

export type MeldType = "chi" | "pon" | "minkan" | "ankan" | "kakan";

export interface Meld {
  type: MeldType;
  kind: number; // 치는 가장 낮은 패, 나머지는 해당 종류
  tiles: Tile[];
  calledFrom?: number; // 어느 좌석에서 불렀는지 (안깡은 없음)
}

export type WaitShape = "ryanmen" | "kanchan" | "penchan" | "shanpon" | "tanki";

export type SetBlockType = "triplet" | "sequence" | "kan";

export interface SetBlock {
  type: SetBlockType;
  kind: number;
  open: boolean;
}

export interface HandDecomposition {
  sets: SetBlock[]; // 4개 (오픈 포함)
  pairKind: number;
}

export const WIND_KINDS = [27, 28, 29, 30] as const;
export type WindKind = (typeof WIND_KINDS)[number];

export interface RuleConfig {
  playerCount: 3 | 4;
  kuitan: boolean; // 오픈 탕야오 허용
  akadora: boolean;
  kiriageMangan: boolean; // 4판30부/3판60부 강제 만관 (기본 off — 작혼 기본값)
}

export const DEFAULT_RULES_4P: RuleConfig = {
  playerCount: 4,
  kuitan: true,
  akadora: true,
  kiriageMangan: false,
};

export const DEFAULT_RULES_3P: RuleConfig = {
  playerCount: 3,
  kuitan: true,
  akadora: true,
  kiriageMangan: false,
};

export interface WinContext {
  winTile: Tile;
  tsumo: boolean;
  seatWind: WindKind;
  roundWind: WindKind;
  riichi: boolean;
  doubleRiichi: boolean;
  ippatsu: boolean;
  haitei: boolean;
  houtei: boolean;
  rinshan: boolean;
  chankan: boolean;
  doraIndicators: number[];
  uraDoraIndicators: number[];
  melds: Meld[];
  concealedTiles: Tile[]; // winTile 포함, 오픈 멜드 제외
  honba: number;
  kyotaku: number;
  rules: RuleConfig;
  kitaCount?: number; // 3인 발북 개수 (도라 취급 아님, 별도 가점 없음 — 판수 집계용 정보만)
  tenhou?: boolean; // 딜러가 배패 그대로 쯔모
  chiihou?: boolean; // 자가 첫 쯔모 (그 사이 콜 없음)
}

export interface YakuResult {
  name: string;
  han: number;
  yakuman: boolean;
  yakumanMultiplier: number; // 1 = 역만, 2 = 더블역만
}

export interface ScoreResult {
  han: number;
  fu: number;
  yaku: YakuResult[];
  doraCount: number;
  uraDoraCount: number;
  akaCount: number;
  basePoints: number;
  limitName: string | null; // 만관/하네만/배만/삼배만/역만
  waitShape: WaitShape;
  decomposition: HandDecomposition;
}

export interface PaymentResult {
  fromDealer: number; // 츠모일 때 친이 내는 금액 (자 시점이 아니면 0)
  fromNonDealer: number; // 츠모일 때 자가 내는 금액 (론이면 0, 딜러 승리 시 전원 동일값)
  ronPayer: number; // 론일 때 방총자가 내는 총액
  total: number;
}
