import { STARWORD_DICTIONARY } from "./starwordDictionary";
import { STARWORD_ANSWERS, STARWORD_EXTRA } from "./starwordWords";

// 추측은 사전 기반 목록까지 열어 떠오르는 단어를 그냥 넣어볼 수 있게 한다.
const GUESSABLE = new Set([...STARWORD_ANSWERS, ...STARWORD_EXTRA, ...STARWORD_DICTIONARY]);

/** 입력 가능한 단어인지 (정답 풀보다 넓다) */
export function isKnownStarword(word: string): boolean {
  return GUESSABLE.has(word.trim());
}
