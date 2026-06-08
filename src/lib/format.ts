// 날짜 포맷 유틸

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// 목록용: 오늘이면 HH:MM, 아니면 MM.DD
export function formatListDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

// 상세용: YYYY.MM.DD HH:MM
export function formatFullDate(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
