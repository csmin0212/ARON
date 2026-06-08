import { headers } from "next/headers";

// 요청 헤더에서 클라이언트 IP 추출
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") ?? "127.0.0.1";
}

// IPv6/로컬 주소를 안정적인 의사 IPv4 로 변환
function toPseudoIpv4(raw: string): string {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const a = (hash & 0xff) || 1;
  const b = (hash >> 8) & 0xff;
  const c = (hash >> 16) & 0xff;
  const d = (hash >> 24) & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

// DC 스타일 마스킹: 첫 옥텟만 노출, 둘째 옥텟은 ♡, 나머지 노출 → "121.♡.4.12"
export function maskIp(ip: string): string {
  let v4 = ip;
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) {
    v4 = toPseudoIpv4(ip);
  }
  const [a, , c, d] = v4.split(".");
  return `${a}.♡.${c}.${d}`;
}

export async function getMaskedIp(): Promise<string> {
  return maskIp(await getClientIp());
}

export const DEFAULT_ANON_NICK = "ㅇㅇ";
