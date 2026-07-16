// 본편 개시 전 월드 잠금 — 기본은 "GM만 입장 가능".
// 개시할 때 Vercel 환경변수 WORLD_OPEN=1 을 설정하면 모두에게 열립니다.
// (환경변수를 안 만지고 싶으면 이 파일에서 직접 true/false 로 바꿔도 됨)
export const WORLD_GM_ONLY = process.env.WORLD_OPEN !== "1";
