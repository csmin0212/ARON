import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 text-6xl">🗺️</div>
      <h1 className="text-2xl font-extrabold text-content">길을 잃으셨나요?</h1>
      <p className="mt-2 text-sm text-faint">
        존재하지 않는 페이지이거나 삭제된 게시글이에요.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
      >
        갤러리로 돌아가기
      </Link>
    </div>
  );
}
