export type Aracon = {
  id: number;
  token: string;
  label: string;
  src: string;
};

const LABELS = [
  "안녕",
  "좋아",
  "부끄",
  "화이팅",
  "헉",
  "흑흑",
  "삐짐",
  "흥",
  "졸려",
  "냠냠",
  "사랑해",
  "고마워",
  "앗",
  "가보자고",
  "엉엉",
  "잘자",
  "안녕",
  "좋아",
  "고마워",
  "미안해",
  "축하해",
  "힘내",
  "졸려",
  "냠냠",
  "행복해",
  "심쿵",
  "헉",
  "흥",
  "엉엉",
  "멍",
  "오케이",
  "굿밤",
];

export const ARACONS: Aracon[] = LABELS.map((label, index) => {
  const id = index + 1;
  return {
    id,
    token: `:아라콘${id}:`,
    label,
    src: `/aracon/aracon${String(id).padStart(2, "0")}.png`,
  };
});

const ARACON_BY_TOKEN = new Map(ARACONS.map((item) => [item.token, item]));
const ARACON_TOKEN_RE = /:아라콘(?:[1-9]|[12]\d|3[0-2]):/g;

export function splitAraconText(text: string): Array<string | Aracon> {
  const out: Array<string | Aracon> = [];
  let lastIndex = 0;
  for (const match of text.matchAll(ARACON_TOKEN_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    const item = ARACON_BY_TOKEN.get(token);
    if (!item) continue;
    if (index > lastIndex) out.push(text.slice(lastIndex, index));
    out.push(item);
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out.length > 0 ? out : [text];
}

export function araconHtml(text: string, escapeHtml: (value: string) => string): string {
  return splitAraconText(text)
    .map((part) =>
      typeof part === "string"
        ? escapeHtml(part)
        : `<img class="aracon" src="${escapeHtml(part.src)}" alt="${escapeHtml(part.label)}" />`,
    )
    .join("");
}
