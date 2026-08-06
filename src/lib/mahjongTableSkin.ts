// 작탁(마작 테이블) 스킨 — 보는 사람마다 다른 개인 설정이라 서버에 저장하지 않는다.
// felt: 판 바닥, rail: 테두리(나무틀), ink: 바닥 위 글자색 계열.

export type TableSkin = {
  key: string;
  name: string;
  desc: string;
  felt: string; // CSS background (그라디언트 가능)
  rail: string; // 테두리 색
  centerBg: string; // 중앙 점수판 배경
  onFelt: string; // 바닥 위 글자색
};

export const TABLE_SKINS: TableSkin[] = [
  {
    key: "classic",
    name: "클래식 그린",
    desc: "작혼 기본에 가장 가까운 초록 융단",
    felt: "linear-gradient(160deg,#1a7a4c 0%,#12603b 60%,#0e4f31 100%)",
    rail: "#6b4423",
    centerBg: "rgba(0,0,0,0.42)",
    onFelt: "#ffffff",
  },
  {
    key: "midnight",
    name: "미드나잇",
    desc: "밤하늘빛 남색. 눈이 편한 어두운 판",
    felt: "linear-gradient(160deg,#243b6b 0%,#1a2b50 60%,#131f3b 100%)",
    rail: "#2f3a52",
    centerBg: "rgba(0,0,0,0.45)",
    onFelt: "#eaf0ff",
  },
  {
    key: "crimson",
    name: "홍옥",
    desc: "붉은 융단. 패의 흰색이 또렷하게 뜬다",
    felt: "linear-gradient(160deg,#8c2230 0%,#6d1a26 60%,#54141d 100%)",
    rail: "#3f2016",
    centerBg: "rgba(0,0,0,0.42)",
    onFelt: "#fff1f1",
  },
  {
    key: "sumi",
    name: "먹빛",
    desc: "무채색 먹색. 패 말고는 아무것도 안 보이게",
    felt: "linear-gradient(160deg,#3a3a3a 0%,#2a2a2a 60%,#1f1f1f 100%)",
    rail: "#4a4a4a",
    centerBg: "rgba(255,255,255,0.10)",
    onFelt: "#f2f2f2",
  },
  {
    key: "sakura",
    name: "벚꽃",
    desc: "연분홍 봄 판. 가볍고 밝은 분위기",
    felt: "linear-gradient(160deg,#c76b8a 0%,#a94f70 60%,#8d3f5c 100%)",
    rail: "#7a4a55",
    centerBg: "rgba(0,0,0,0.38)",
    onFelt: "#fff5f8",
  },
  {
    key: "ocean",
    name: "심해",
    desc: "청록 바다. 초록과 파랑 사이",
    felt: "linear-gradient(160deg,#12736f 0%,#0d5a58 60%,#0a4645 100%)",
    rail: "#2b4f4d",
    centerBg: "rgba(0,0,0,0.42)",
    onFelt: "#eafffc",
  },
  {
    key: "gold",
    name: "황금",
    desc: "금빛 테두리의 고급 작탁",
    felt: "linear-gradient(160deg,#2f6b45 0%,#215033 60%,#193f28 100%)",
    rail: "#b08928",
    centerBg: "rgba(0,0,0,0.45)",
    onFelt: "#fdf6df",
  },
  {
    key: "violet",
    name: "자수정",
    desc: "보랏빛 판. 도라 표시가 잘 보인다",
    felt: "linear-gradient(160deg,#553a86 0%,#412c69 60%,#332253 100%)",
    rail: "#3c3155",
    centerBg: "rgba(0,0,0,0.42)",
    onFelt: "#f3edff",
  },
  {
    key: "coffee",
    name: "다방",
    desc: "낡은 다방 탁자. 나무 위에서 치는 느낌",
    felt: "linear-gradient(160deg,#6d4b30 0%,#563a25 60%,#432d1d 100%)",
    rail: "#33231a",
    centerBg: "rgba(0,0,0,0.40)",
    onFelt: "#fbf0e2",
  },
  {
    key: "moss",
    name: "이끼",
    desc: "차분한 올리브. 오래 봐도 안 피곤한 색",
    felt: "linear-gradient(160deg,#5c6b34 0%,#475328 60%,#37401f 100%)",
    rail: "#4a4423",
    centerBg: "rgba(0,0,0,0.40)",
    onFelt: "#f6f8e8",
  },
];

export const DEFAULT_TABLE_SKIN = TABLE_SKINS[0];

export function tableSkinOf(key: string | null | undefined): TableSkin {
  return TABLE_SKINS.find((s) => s.key === key) ?? DEFAULT_TABLE_SKIN;
}
