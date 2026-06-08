export default function Banner() {
  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-indigo-700 px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9">
      {/* 장식용 도형 */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 right-24 h-32 w-32 rounded-full bg-indigo-300/20 blur-2xl" />
      <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 select-none text-7xl opacity-30 sm:block">
        🏰
      </div>

      <div className="relative">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur">
          ⚔️ ArianRod Online
        </span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
          아리안로드 온라인 갤러리
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-white/80">
          던전 공략부터 자유로운 잡담까지. 모험가들이 모이는 공간에 오신 걸 환영합니다.
        </p>
      </div>
    </div>
  );
}
