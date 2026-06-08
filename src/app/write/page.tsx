import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import WriteForm from "@/components/forms/WriteForm";

export const metadata = { title: "글쓰기 · 아리안로드 온라인 갤러리" };

export default async function WritePage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-2xl animate-fadeup py-2">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-content">글쓰기</h1>
        <Link href="/" className="text-sm font-semibold text-faint hover:text-content">
          ← 목록으로
        </Link>
      </div>

      {!user && (
        <p className="mb-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          비회원으로 익명 작성 중이에요.{" "}
          <Link href="/login" className="font-bold underline">
            로그인
          </Link>
          하면 내 캐릭터로 글을 남길 수 있어요.
        </p>
      )}

      <div className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
        <WriteForm isLoggedIn={!!user} />
      </div>
    </div>
  );
}
