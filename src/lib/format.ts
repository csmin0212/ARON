// 날짜 포맷 유틸

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

const APP_TIME_ZONE = "Asia/Seoul";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function appTimeParts(date: Date | string): DateParts {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// 목록용: 오늘이면 HH:MM, 아니면 MM.DD
export function formatListDate(date: Date | string): string {
  const d = appTimeParts(date);
  const now = appTimeParts(new Date());
  const sameDay =
    d.year === now.year &&
    d.month === now.month &&
    d.day === now.day;
  if (sameDay) return `${pad(d.hour)}:${pad(d.minute)}`;
  return `${pad(d.month)}.${pad(d.day)}`;
}

// 상세용: YYYY.MM.DD HH:MM
export function formatFullDate(date: Date | string): string {
  const d = appTimeParts(date);
  return `${d.year}.${pad(d.month)}.${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}`;
}

export function formatTime(date: Date | string): string {
  const d = appTimeParts(date);
  return `${pad(d.hour)}:${pad(d.minute)}`;
}
