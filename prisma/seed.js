// 데모 시드 데이터 — 실행: npm run seed
// .env 의 DATABASE_URL 을 읽어 해당 DB(Neon/Postgres)에 주입
const fs = require("fs");
const path = require("path");
try {
  const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
} catch {
  /* .env 없으면 시스템 환경변수 사용 */
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL 이 설정되지 않았습니다 (.env 확인)");
  process.exit(1);
}

const { PrismaClient } = require("../src/generated/prisma");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const day = (s) => new Date(s);

async function main() {
  // 기존 데이터 정리 (반복 실행 가능하도록)
  await prisma.vote.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  const pw = await bcrypt.hash("test1234", 10);
  const knight = await prisma.user.create({
    data: { username: "ironknight", passwordHash: pw, nickname: "강철의기사", avatar: "preset:knight" },
  });
  const mage = await prisma.user.create({
    data: { username: "moonmage", passwordHash: pw, nickname: "달빛마법사", avatar: "preset:mage" },
  });
  const archer = await prisma.user.create({
    data: { username: "forestbow", passwordHash: pw, nickname: "숲의궁수", avatar: "preset:archer" },
  });

  // 공지
  await prisma.post.create({
    data: {
      category: "NOTICE",
      title: "아리안로드 온라인 갤러리 이용 안내 (필독)",
      content:
        "안녕하세요, 아리안로드 온라인 갤러리에 오신 것을 환영합니다!\n\n" +
        "▶ 말머리(공지/정보/일반/질문)를 상황에 맞게 선택해주세요.\n" +
        "▶ 로그인하면 내 캐릭터(닉네임/사진)로 글을 남길 수 있어요.\n" +
        "▶ 비회원도 익명(ㅇㅇ)으로 자유롭게 글/댓글 작성이 가능합니다.\n" +
        "▶ 서로 존중하는 즐거운 갤러리가 되도록 협조 부탁드립니다.\n\n" +
        "즐거운 모험 되세요! ⚔️",
      authorId: knight.id,
      createdAt: day("2025-05-01T09:00:00"),
    },
  });

  // 튜토리얼 정보 모음 (예시 재현)
  const tuto = await prisma.post.create({
    data: {
      category: "INFO",
      title: "📘 튜토리얼(0층) 정보 모음",
      content:
        "0층은 본격적인 던전에 들어가기 전의 공간이자, 유저들이 기본 조작과 UI, 전투 시스템에 익숙해지기 위해 만들어진 장소이다.\n\n다들 꿀팁 공유 ㄱㄱ",
      anonNick: "ㅇㅇ",
      anonIp: "121.♡.99.10",
      createdAt: day("2025-05-22T12:40:00"),
    },
  });

  // 댓글 헬퍼
  const anon = (ip, content, createdAt, extra = {}) => ({
    postId: tuto.id,
    content,
    anonNick: extra.authorPost ? "ㅇㅇ" : "ㅇㅇ",
    anonIp: ip,
    isAuthorPost: !!extra.authorPost,
    isDeleted: !!extra.deleted,
    createdAt: day(createdAt),
  });

  // 루트1
  const r1 = await prisma.comment.create({
    data: anon(
      "121.♡.4.12",
      "초반 파밍 지역에서 다이스 높게 나오면 '강철 파편' 3개까지 취득 가능함. 1층 대장장이한테 가져가면 초반 무기 업그레이드 가능하니 가능한 많이 챙겨두는거 추천.",
      "2025-05-22T13:12:00",
    ),
  });
  await prisma.comment.create({
    data: {
      ...anon(
        "110.♡.76.55",
        "써봤는데 레벨 3 무기까지만 강화 가능함. 무기 레벨 당 1개씩 소모되는 것 같음. 3레벨 무기 하나 올렸더니 3개 다 내놓으라더라.",
        "2025-05-22T13:23:00",
      ),
      parentId: r1.id,
    },
  });
  await prisma.comment.create({
    data: {
      ...anon(
        "58.♡.122.7",
        "대장장이 NPC인척 하는 플레이어라는 설이 있던데 ㅋㅋㅋ 컨셉에 잡아먹힌 드워프라 전혀 모르겠음",
        "2025-05-22T14:25:00",
      ),
      parentId: r1.id,
    },
  });

  // 루트2 (3단 중첩)
  const r2 = await prisma.comment.create({
    data: anon(
      "59.♡.87.30",
      "샛길 위쪽으로 가면 겁나 큰 독수리 있던데, 너무 쌔서 도망쳐 나옴;; 튜토리얼에 깨라고 있는 적 맞음?",
      "2025-05-22T13:33:00",
    ),
  });
  const r2c = await prisma.comment.create({
    data: {
      ...anon(
        "110.♡.76.55",
        "붙으면 낙하 공격하는데 그게 겁나아픔, 거리 조절 해주면 생각보다 잡을만한듯?",
        "2025-05-22T14:25:00",
      ),
      parentId: r2.id,
    },
  });
  await prisma.comment.create({
    data: {
      ...anon(
        "59.♡.87.30",
        "아니 독수리 개잘피하고 개잘맞춤;; 결국 네발로 뒤도 안보고 도망침.. 진입장벽 지리네",
        "2025-05-22T15:30:00",
      ),
      parentId: r2c.id,
    },
  });

  // 루트3
  await prisma.comment.create({
    data: anon(
      "223.♡.6.77",
      "맵 끝에 비밀길 있더라, 안에 골동품 같은거 하나 있던데 생각보다 비싸게 팔림 ㅇㅇ",
      "2025-05-22T16:16:00",
    ),
  });

  // 루트4 (삭제된 댓글 + 삭제된 대댓글)
  const r4 = await prisma.comment.create({
    data: anon("175.♡.8.45", "(삭제된 댓글입니다)", "2025-05-22T17:00:00", { deleted: true }),
  });
  await prisma.comment.create({
    data: {
      ...anon("110.♡.76.55", "(삭제된 댓글입니다)", "2025-05-22T17:01:00", { deleted: true }),
      parentId: r4.id,
    },
  });

  // 루트5 (작성자)
  await prisma.comment.create({
    data: anon("121.♡.99.10", "ㅇ? 댓글 삭제되서 못봄. 댓삭튀 에반데;;", "2025-05-22T18:18:00", {
      authorPost: true,
    }),
  });

  // 루트6
  const r6 = await prisma.comment.create({
    data: anon("142.♡.11.20", "튜토리얼 원래 멀티임? 아 진짜 개빡치네;;", "2025-05-25T12:10:00"),
  });
  await prisma.comment.create({
    data: {
      ...anon("121.♡.99.10", "? 그럴리가. 튜토리얼 맵은 원래 솔로플 전용임.", "2025-05-25T14:05:00", {
        authorPost: true,
      }),
      parentId: r6.id,
    },
  });
  await prisma.comment.create({
    data: {
      ...anon(
        "142.♡.11.20",
        "네 명이서 튜토리얼 들어와져서 뭐지 했는데. 미친놈이 배신하고 보상 4인분 독식했음;;; 진짜 개화난다 게임사는 공지 안하고 뭐함??",
        "2025-05-25T14:10:00",
      ),
      parentId: r6.id,
    },
  });
  await prisma.comment.create({
    data: {
      ...anon("110.♡.76.55", "관련 정보 공유 요청합니다. 사례하겠습니다.", "2025-05-25T14:33:00"),
      parentId: r6.id,
    },
  });

  // 추가 게시글들 (목록 채우기)
  const fillers = [
    { c: "GENERAL", t: "1층 보스 패턴 외우니까 할만하네 ㅋㅋ", a: archer, d: "2025-06-07T15:36:00" },
    { c: "QUESTION", t: "직업 뭐가 제일 무난함? 입문자임", a: null, ip: "175.♡.116.4", d: "2025-06-07T15:36:00" },
    { c: "GENERAL", t: "오늘 업데이트 패치노트 떴다", a: mage, d: "2025-06-07T15:35:00" },
    { c: "INFO", t: "2층 함정 위치 정리해봤음 (스압)", a: knight, d: "2025-06-07T15:35:00" },
    { c: "QUESTION", t: "강철 파편 어디서 더 캠? 1층 다 털었는데", a: null, ip: "219.♡.249.7", d: "2025-06-07T15:35:00" },
    { c: "GENERAL", t: "길드원 구함 초보 환영", a: archer, d: "2025-06-06T21:10:00" },
    { c: "GENERAL", t: "독수리 드디어 잡았다 ㅠㅠ 눈물난다", a: null, ip: "59.♡.87.30", d: "2025-06-06T19:02:00" },
    { c: "INFO", t: "초반 골드 빨리 모으는 루트 정리", a: mage, d: "2025-06-06T11:24:00" },
    { c: "QUESTION", t: "닉네임 변경 어디서 함?", a: null, ip: "118.♡.235.1", d: "2025-06-05T18:40:00" },
    { c: "GENERAL", t: "이 게임 그래픽 진짜 이쁘다", a: knight, d: "2025-06-05T09:15:00" },
  ];

  for (const f of fillers) {
    await prisma.post.create({
      data: {
        category: f.c,
        title: f.t,
        content: f.t + "\n\n(데모용 게시글입니다)",
        authorId: f.a ? f.a.id : null,
        anonNick: f.a ? null : "ㅇㅇ",
        anonIp: f.a ? null : f.ip,
        createdAt: day(f.d),
        views: Math.floor(Math.random() * 300) + 10,
      },
    });
  }

  // 추천 몇 개
  const allPosts = await prisma.post.findMany({ select: { id: true } });
  for (const p of allPosts) {
    const n = Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      await prisma.vote.create({
        data: { postId: p.id, voterKey: `ip:seed-${p.id}-${i}`, value: 1 },
      });
    }
  }
  // 튜토리얼 글에 조회수/추천 부스트
  await prisma.post.update({ where: { id: tuto.id }, data: { views: 4821 } });

  console.log("✅ 시드 완료: 회원 3명 / 게시글 12개 / 댓글 다수");
  console.log("   테스트 계정: ironknight / moonmage / forestbow  (비밀번호: test1234)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
