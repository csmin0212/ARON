// 쌍별 — 두 글자 한국어 단어 맞히기. 하루 한 판, 전원 같은 정답, 기회 7번.
//
// 판정은 자모 단위로 한다. 겹받침(ㄳ)·모음 합자(ㅘ)는 구성 자모를 각각 가진 것으로 보고,
// 쌍자음(ㄲ)과 ㅐ/ㅔ/ㅒ/ㅖ는 별개 자모로 센다.

export const STARWORD_MAX_TRIES = 7;
export const STARWORD_ENTRY_FEE = 50;
export const STARWORD_CLEAR_REWARD = 100;
/** 리더보드 1·2·3등 추가 보상 — 다음 날 정산해 우편으로 보낸다. */
export const STARWORD_RANK_REWARDS = [100, 50, 30];

// ── 판정 ──
export type StarwordVerdict = "별" | "항성" | "행성" | "혜성" | "위성" | "공허";

export const STARWORD_ICON: Record<StarwordVerdict, string> = {
  별: "⭐",
  항성: "🌟",
  행성: "🪐",
  혜성: "☄️",
  위성: "🌑",
  공허: "🕳️",
};

export const STARWORD_LEGEND: { verdict: StarwordVerdict; text: string }[] = [
  { verdict: "별", text: "글자가 정확히 일치" },
  { verdict: "항성", text: "첫 자음이 같고, 나머지도 하나 이상 일치" },
  { verdict: "행성", text: "자모가 둘 이상 일치하지만 첫 자음은 다름" },
  { verdict: "혜성", text: "자모가 하나만 일치" },
  { verdict: "위성", text: "이 자리엔 없고 반대쪽 글자에 있음" },
  { verdict: "공허", text: "어디에도 없음" },
];

// ── 한글 분해 ──
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");
const JONG = "_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split("");

// 겹받침·합자 → 구성 자모. 표에 없으면 그 자체가 단일 자모다.
const COMPOSITE: Record<string, string[]> = {
  ㄳ: ["ㄱ", "ㅅ"],
  ㄵ: ["ㄴ", "ㅈ"],
  ㄶ: ["ㄴ", "ㅎ"],
  ㄺ: ["ㄹ", "ㄱ"],
  ㄻ: ["ㄹ", "ㅁ"],
  ㄼ: ["ㄹ", "ㅂ"],
  ㄽ: ["ㄹ", "ㅅ"],
  ㄾ: ["ㄹ", "ㅌ"],
  ㄿ: ["ㄹ", "ㅍ"],
  ㅀ: ["ㄹ", "ㅎ"],
  ㅄ: ["ㅂ", "ㅅ"],
  ㅘ: ["ㅗ", "ㅏ"],
  ㅙ: ["ㅗ", "ㅐ"],
  ㅚ: ["ㅗ", "ㅣ"],
  ㅝ: ["ㅜ", "ㅓ"],
  ㅞ: ["ㅜ", "ㅔ"],
  ㅟ: ["ㅜ", "ㅣ"],
  ㅢ: ["ㅡ", "ㅣ"],
};

const expand = (jamo: string): string[] => COMPOSITE[jamo] ?? [jamo];

export type SyllableParts = {
  /** 첫 자음 (초성) */
  cho: string;
  /** 초·중·종성을 구성 자모로 모두 펼친 목록 */
  jamo: string[];
};

export function isHangulSyllable(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

export function splitSyllable(ch: string): SyllableParts | null {
  if (!isHangulSyllable(ch)) return null;
  const index = (ch.codePointAt(0) as number) - HANGUL_BASE;
  const cho = CHO[Math.floor(index / 588)];
  const jung = JUNG[Math.floor((index % 588) / 28)];
  const jong = JONG[index % 28];
  const jamo = [cho, ...expand(jung)];
  if (jong !== "_") jamo.push(...expand(jong));
  return { cho, jamo };
}

/** 두 글자 한글인지 (입력 검증용) */
export function isValidStarwordShape(word: string): boolean {
  const w = word.trim();
  return w.length === 2 && [...w].every(isHangulSyllable);
}

// 한 글자 판정 — 우선순위가 높은 것부터 검사한다.
function judgeSyllable(guess: string, answerHere: string, answerOther: string): StarwordVerdict {
  if (guess === answerHere) return "별";

  const g = splitSyllable(guess);
  const here = splitSyllable(answerHere);
  const other = splitSyllable(answerOther);
  if (!g || !here || !other) return "공허";

  // 같은 자모가 여러 번 나올 수 있으므로 다중집합으로 센다 (ㅗ+ㅗ 는 두 번 필요).
  const countMatches = (target: SyllableParts): number => {
    const pool = [...target.jamo];
    let hit = 0;
    for (const j of g.jamo) {
      const at = pool.indexOf(j);
      if (at >= 0) {
        pool.splice(at, 1);
        hit++;
      }
    }
    return hit;
  };

  const hitsHere = countMatches(here);
  // 둘 이상 맞았을 때만 초성 일치 여부로 항성/행성이 갈린다.
  // 하나만 맞은 건 그게 초성이든 아니든 혜성 — 원작의 가지(🍆)와 같은 자리.
  if (hitsHere >= 2) return g.cho === here.cho ? "항성" : "행성";
  if (hitsHere === 1) return "혜성";
  return countMatches(other) > 0 ? "위성" : "공허";
}

/** 추측 한 줄의 판정 (글자별). 반드시 두 글자여야 한다. */
export function judgeStarword(guess: string, answer: string): StarwordVerdict[] {
  const g = [...guess.trim()];
  const a = [...answer.trim()];
  return [judgeSyllable(g[0], a[0], a[1]), judgeSyllable(g[1], a[1], a[0])];
}

export function isStarwordCleared(verdicts: StarwordVerdict[]): boolean {
  return verdicts.length === 2 && verdicts.every((v) => v === "별");
}

// ── 그날의 정답 ──
// 날짜 문자열을 시드로 뽑으므로 전원 같은 답이 나오고, 자정이 지나면 저절로 바뀐다.
// (별도 스케줄러가 필요 없다)
export function starwordDayKey(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function starwordOfDay(day: string = starwordDayKey()): string {
  return STARWORD_WORDS[hashString(`쌍별:${day}`) % STARWORD_WORDS.length];
}

/** 소요 시간 표기 — 리더보드용 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

// ── 정답 후보 ──
// 두 글자 일반명사 위주. 너무 어려운 말은 빼고, 하루 한 판이라 반복 등장해도 부담이 적다.
export const STARWORD_WORDS: string[] = [
  "가방", "가족", "가지", "간장", "감자", "강물", "강산", "거리", "거울", "건물",
  "겨울", "결과", "경기", "경치", "계단", "계란", "계절", "고개", "고기", "고민",
  "고장", "고추", "고향", "곡식", "골목", "공간", "공기", "공부", "공원", "공장",
  "과일", "과자", "관심", "교실", "교육", "구름", "구멍", "국수", "국물", "군인",
  "궁전", "귀신", "규칙", "그늘", "그림", "극장", "근처", "글씨", "금방", "기계",
  "기름", "기분", "기사", "기술", "기억", "기온", "기자", "기차", "기초", "길이",
  "김치", "까치", "꼬리", "꽃잎", "나라", "나무", "나비", "나이", "낙엽", "날개",
  "날씨", "남매", "남산", "낮잠", "냄새", "냉면", "너희", "노래", "노력", "노을",
  "녹색", "농사", "농촌", "누나", "눈물", "눈빛", "느낌", "능력", "다리", "다방",
  "단어", "단추", "달빛", "담배", "답장", "대답", "대문", "대신", "대장", "대회",
  "덕분", "도구", "도로", "도시", "도장", "독서", "돌담", "동네", "동물", "동생",
  "동전", "돼지", "된장", "두부", "뒷산", "등불", "딸기", "땅콩", "마늘", "마당",
  "마루", "마을", "마음", "만두", "만족", "말씀", "맞춤", "매력", "매일", "머리",
  "먼지", "메모", "면적", "명단", "명절", "모기", "모래", "모습", "모양", "목표",
  "목숨", "목적", "몸살", "무늬", "무대", "무릎", "문제", "문화", "물감", "물결",
  "물질", "미래", "미소", "미술", "민족", "바늘", "바다", "바닥", "바람", "바위",
  "박수", "반달", "반지", "발견", "발달", "발음", "밤낮", "밥상", "방법", "방송",
  "방향", "배경", "배추", "백성", "버릇", "버섯", "번개", "번호", "벌레", "법칙",
  "베개", "벼락", "변화", "별빛", "병원", "보리", "보석", "복도", "복권", "본능",
  "봄비", "부분", "부엌", "부자", "부탁", "북극", "분수", "분류", "불꽃", "불빛",
  "비극", "비누", "비밀", "비용", "빗물", "빨래", "사건", "사과", "사람", "사랑",
  "사슴", "사실", "사자", "사진", "사탕", "산길", "산소", "삼촌", "상상", "상자",
  "상처", "새벽", "생각", "생선", "생활", "서랍", "서울", "석유", "선물", "선생",
  "설날", "설탕", "성격", "성공", "세계", "세상", "소금", "소망", "소리", "소설",
  "소식", "손님", "손톱", "수술", "수건", "수박", "수업", "수염", "수준", "수첩",
  "숙제", "순간", "술집", "숫자", "스승", "습관", "승리", "시간", "시골", "시계",
  "시내", "시대", "시장", "시절", "시험", "식구", "식물", "식사", "신문", "신발",
  "신비", "실수", "실패", "심장", "쌀밥", "아기", "아들", "아래", "아빠", "아침",
  "안개", "안경", "안내", "안심", "약국", "약속", "양말", "양복", "어깨", "어른",
  "어제", "언니", "언덕", "얼굴", "얼음", "엄마", "여름", "여자", "여행", "역사",
  "연구", "연기", "연필", "열매", "열쇠", "영어", "영원", "영화", "예술", "오늘",
  "오리", "오빠", "오후", "온실", "온도", "외모", "옷장", "완성", "왕자", "외국",
  "요리", "요일", "용기", "우물", "우산", "우유", "우주", "운동", "운명", "울음",
  "웃음", "원인", "월급", "위로", "위치", "유리", "유행", "은행", "음식", "음악",
  "의미", "의사", "의자", "이마", "이불", "이슬", "이유", "이웃", "인간", "인기",
  "인사", "인생", "인형", "일기", "일생", "임금", "입술", "잎새", "자갈", "자세",
  "자랑", "자리", "자연", "자유", "작가", "작품", "잔디", "장갑", "장난", "장미",
  "재료", "재주", "저녁", "적성", "전기", "전등", "전쟁", "전화", "절반", "젊음",
  "점심", "접시", "정성", "정답", "정도", "정문", "정신", "정원", "제목", "조각",
  "조개", "조건", "조상", "종류", "종이", "주말", "주장", "주변", "주소", "주인",
  "죽음", "준비", "줄기", "중간", "중심", "쥐약", "지갑", "지구", "지도", "지붕",
  "지식", "지역", "지혜", "직업", "진실", "질문", "짐승", "집안", "짜증", "차이",
  "찻잔", "창문", "채소", "책상", "책임", "천국", "천장", "철학", "청년", "청소",
  "초록", "촛불", "총알", "추억", "축구", "출발", "춤판", "충고", "취미", "층계",
  "치마", "친구", "칠판", "침대", "칭찬", "카드", "칼날", "코스", "쾌감", "쿠키",
  "크기", "타령", "탁자", "태도", "태양", "택시", "터널", "토끼", "통증", "통일",
  "퇴근", "투수", "특별", "파도", "파리", "판단", "팔찌", "편지", "평생", "포도",
  "표정", "풍경", "피부", "필요", "하늘", "하루", "학교", "학생", "한글", "한숨",
  "항상", "항구", "해결", "해변", "행동", "행복", "향기", "허리", "현실", "형제",
  "호흡", "호수", "혼자", "화면", "화살", "환경", "회사", "회의", "휴가", "흔적",
  "흙길", "희망", "힘줄",
];
