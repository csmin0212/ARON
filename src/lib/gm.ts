// GM(운영자) 권한 — 환경변수 GM_USERNAMES 에 쉼표로 아이디 나열
// 예: GM_USERNAMES="adminaccount,subadmin"

export function isGmUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  const list = (process.env.GM_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(username);
}
