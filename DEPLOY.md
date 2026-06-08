# 🚀 배포 가이드 (Vercel + Neon Postgres)

이 프로젝트는 **Vercel**(호스팅) + **Neon**(무료 Postgres DB) 조합으로 배포합니다.
둘 다 무료 티어로 시작할 수 있고, GitHub에 푸시하면 Vercel이 자동으로 다시 배포합니다.

> 전체 과정 약 10분. 신용카드 필요 없음.

---

## 1단계 · Neon 에서 DB 만들기

1. https://neon.tech 접속 → GitHub 계정으로 로그인
2. **Create project** → 프로젝트 이름(예: `aron`), 리전은 가까운 곳(예: Singapore / Tokyo) 선택
3. 생성되면 **Connection string** 화면이 나옵니다. **`Pooled connection`** 토글을 켜고 문자열을 복사
   ```
   postgresql://...@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
   👉 반드시 `-pooler` 가 들어간 **Pooled** 주소를 쓰세요 (서버리스에서 커넥션 폭주 방지).

---

## 2단계 · 로컬에서 DB 초기화 (한 번만)

복사한 주소를 `arianrod-gallery/.env` 의 `DATABASE_URL` 에 붙여넣고:

```bash
cd arianrod-gallery
npm run db:push     # 스키마를 Neon DB에 생성
npm run seed        # (선택) 데모 데이터 주입
npm run dev         # 로컬에서도 이제 Neon에 연결됨
```

`npm run dev` 로 사이트가 잘 뜨면 DB 연결 성공입니다.

---

## 3단계 · GitHub 에 코드 올리기

```bash
git add -A
git commit -m "Postgres 배포 설정"
git push -u origin main
```

(이미 원격 `origin` 이 `https://github.com/csmin0212/ARON.git` 로 연결돼 있습니다.)

---

## 4단계 · Vercel 에서 배포

1. https://vercel.com 접속 → GitHub 로 로그인
2. **Add New… → Project** → `csmin0212/ARON` 저장소 **Import**
3. **Environment Variables** 에 아래 2개 추가:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | 1단계의 Neon Pooled 주소 |
   | `AUTH_SECRET` | `.env` 에 있는 긴 랜덤 문자열 (또는 새로 생성) |

4. **Deploy** 클릭

빌드 시 `prisma generate && prisma db push && next build` 가 자동 실행되어
Neon DB에 스키마가 맞춰지고 사이트가 올라갑니다. (`vercel.json` 에 설정됨)

> 새 `AUTH_SECRET` 생성:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
> ```

---

## 이후 운영

- **코드 수정 → git push** 하면 Vercel이 자동 재배포합니다.
- **DB 스키마 변경**(모델 추가 등) 후에도 `prisma db push` 가 빌드 때 자동 반영됩니다.
- 첨부 이미지는 **DB(Postgres bytea)** 에 저장되므로 서버리스에서도 안전하게 유지됩니다.
- 데모 데이터를 운영 DB에도 넣고 싶으면, 운영 `DATABASE_URL` 을 로컬 `.env` 에 잠깐 넣고 `npm run seed` 후 되돌리세요.

---

## 자주 막히는 곳

| 증상 | 원인 / 해결 |
|------|------------|
| 빌드 실패 `Can't reach database` | `DATABASE_URL` 오타 또는 Pooled 주소 아님 |
| 로그인이 풀림/이상 | `AUTH_SECRET` 미설정 또는 배포마다 값이 바뀜 → 고정값 사용 |
| `prisma` 관련 에러 | Vercel 환경변수에 `DATABASE_URL` 이 빠졌는지 확인 |
| 이미지가 안 보임 | 정상 (이미지는 `/api/image/[id]` 로 서빙, DB에 저장됨) |
