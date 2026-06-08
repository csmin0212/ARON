// 갤러리 탭(말머리) 정의

export type CategoryKey = "NOTICE" | "INFO" | "GENERAL" | "QUESTION";

export interface Category {
  key: CategoryKey;
  label: string; // 말머리 표기
  tab: string; // 탭 이름
  color: string; // 말머리 배지 색 (tailwind 클래스)
  emoji: string;
}

export const CATEGORIES: Category[] = [
  { key: "NOTICE", label: "공지", tab: "공지", color: "bg-rose-100 text-rose-600", emoji: "📌" },
  { key: "INFO", label: "정보", tab: "정보", color: "bg-sky-100 text-sky-600", emoji: "📘" },
  { key: "GENERAL", label: "일반", tab: "일반", color: "bg-slate-100 text-slate-500", emoji: "💬" },
  { key: "QUESTION", label: "질문", tab: "질문", color: "bg-amber-100 text-amber-600", emoji: "❓" },
];

export const CATEGORY_MAP: Record<CategoryKey, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c]),
) as Record<CategoryKey, Category>;

export function getCategory(key: string): Category {
  return CATEGORY_MAP[key as CategoryKey] ?? CATEGORY_MAP.GENERAL;
}

export function isValidCategory(key: string): key is CategoryKey {
  return key in CATEGORY_MAP;
}

// 개념글(추천글) 기준 추천 수. 이 수 이상이면 개념글 탭에 노출.
export const BEST_THRESHOLD = 2;
