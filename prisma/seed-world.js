// 데모 월드 맵 시드 — 실행: npm run seed:world
// GM이 시트 "맵" 탭을 만들어 동기화하면 이 데이터는 교체됩니다.
const fs = require("fs");
const path = require("path");
try {
  const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {}

const { PrismaClient } = require("../src/generated/prisma");
const prisma = new PrismaClient();

const LOCATIONS = [
  {
    id: "town",
    image: "https://picsum.photos/seed/aron-town/1200/400",
    name: "시작의 마을",
    emoji: "🏘️",
    desc: "모험가들이 모이는 평화로운 마을이다. 광장 중앙의 분수대 주변으로 상인과 여행자들이 오간다.",
    conns: ["market", "forest"],
    hidden: false,
    isStart: true,
  },
  {
    id: "market",
    image: "https://picsum.photos/seed/aron-market/1200/400",
    name: "시장 거리",
    emoji: "🛒",
    desc: "온갖 물건을 파는 상인들로 북적인다. 어디선가 고소한 빵 냄새가 풍긴다.",
    conns: ["town"],
    hidden: false,
    isStart: false,
  },
  {
    id: "forest",
    image: "https://picsum.photos/seed/aron-forest/1200/400",
    name: "어스름 숲",
    emoji: "🌲",
    desc: "햇빛이 잘 들지 않는 울창한 숲. 나뭇잎 사이로 무언가 움직이는 기척이 느껴진다.",
    conns: ["town", "river", "ruins"],
    hidden: false,
    isStart: false,
  },
  {
    id: "river",
    image: "https://picsum.photos/seed/aron-river/1200/400",
    name: "은빛 강가",
    emoji: "🏞️",
    desc: "낚시하기 좋은 잔잔한 강. 물결이 달빛을 받아 은빛으로 반짝인다.",
    conns: ["forest"],
    hidden: false,
    isStart: false,
  },
  {
    id: "ruins",
    image: "https://picsum.photos/seed/aron-ruins/1200/400",
    name: "무너진 폐허",
    emoji: "🏚️",
    desc: "누구도 모르는 옛 유적. 발견한 자만이 들어올 수 있다.",
    conns: ["forest"],
    hidden: true,
    isStart: false,
  },
];

(async () => {
  await prisma.location.deleteMany();
  await prisma.location.createMany({
    data: LOCATIONS.map((l, i) => ({
      id: l.id,
      name: l.name,
      emoji: l.emoji,
      image: l.image ?? null,
      desc: l.desc,
      connJson: JSON.stringify(l.conns),
      hidden: l.hidden,
      isStart: l.isStart,
      order: i,
    })),
  });
  console.log(`✅ 데모 월드 시드 완료 — 장소 ${LOCATIONS.length}곳 (히든 1곳 포함)`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
