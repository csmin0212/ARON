# 아리안로드 온라인 갤러리 (ArianRod Online Gallery)

디시인사이드 스타일의 팬 커뮤니티 갤러리. **Next.js 16 + Prisma + Postgres + Tailwind CSS**로 제작.

## ✨ 주요 기능

- **회원 / 익명 병행** — 로그인하면 내 캐릭터(닉네임·사진)로, 비회원은 익명(`ㅇㅇ`)으로 글·댓글 작성
- **프로필** — 닉네임 + 캐릭터 아바타(프리셋 12종 또는 이미지 URL) 설정
- **게시판 탭** — 공지 / 정보 / 일반 / 질문 (말머리), 공지는 상단 고정
- **댓글 / 대댓글** — 무한 단계 중첩, 작성자 배지, 소프트 삭제
- **추천 / 비추천** — 중복 방지(회원 ID 또는 IP 기준), 토글 가능
- **페이지네이션 · 조회수 · 반응형 UI**

## 🚀 실행 방법

DB는 Postgres를 사용합니다. 로컬 개발도 [Neon](https://neon.tech)(무료 Postgres)에 연결합니다.

```bash
npm install
cp .env.example .env        # DATABASE_URL(Neon), AUTH_SECRET 채우기
npm run db:push             # 스키마를 DB에 생성 (최초 1회)
npm run seed                # 데모 데이터 주입 (선택)
npm run dev                 # http://localhost:3000
```

### 테스트 계정 (시드 데이터)

| 아이디 | 닉네임 | 비밀번호 |
|--------|--------|----------|
| `moonmage` | 달빛마법사 | `test1234` |
| `forestbow` | 숲의궁수 | `test1234` |

> `ironknight` 는 운영(GM) 계정으로 전환되어 비밀번호가 변경되었습니다.

## 🔧 환경 변수 (`.env`)

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"  # Neon Pooled 주소
AUTH_SECRET="<긴 랜덤 문자열>"                                      # 세션 서명 키
```

## ☁️ 배포

**Vercel + Neon(Postgres)** 조합으로 배포합니다. 단계별 안내는 **[DEPLOY.md](DEPLOY.md)** 참고.
요약: Neon에서 DB 생성 → GitHub 푸시 → Vercel Import + 환경변수 2개 등록 → Deploy.
빌드 시 `prisma db push` 가 자동 실행되어 스키마가 맞춰집니다(`vercel.json`).

## 🗂 기술 스택

- **Next.js 16** (App Router, Server Actions)
- **Prisma 6** (ORM) + **Postgres** (개발·운영 공통)
- **Tailwind CSS 4**
- **인증**: bcrypt 해시 + JWT(`jose`) httpOnly 쿠키 세션

## 📁 구조

```
src/
├─ app/
│  ├─ page.tsx              # 갤러리 목록 (탭/페이지네이션)
│  ├─ post/[id]/page.tsx    # 게시글 상세 + 댓글
│  ├─ write/                # 글쓰기
│  ├─ login · register · profile
│  └─ actions/              # 서버 액션 (auth · posts · comments · votes)
├─ components/              # UI 컴포넌트
└─ lib/                     # prisma · auth · 유틸
```
