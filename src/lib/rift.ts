// 균열 공용 설정. 내부맵 장소 id = 균열 종류 이름 (GM 맵 시트에 같은 id의 히든 장소를 만들어 둔다).
export const RIFT_TYPES = ["별의 바다", "망자의 정원", "핏빛 성채"] as const;
export type RiftType = (typeof RIFT_TYPES)[number];

export const RIFT_CAPACITY = 4;

export const RIFT_EMOJI: Record<string, string> = {
  "별의 바다": "🌌",
  "망자의 정원": "🥀",
  "핏빛 성채": "🩸",
};

export function isRiftType(v: string): v is RiftType {
  return (RIFT_TYPES as readonly string[]).includes(v);
}

// 내부맵 장소 id (현재는 종류 이름 그대로 사용)
export function riftInteriorId(type: RiftType): string {
  return type;
}
