import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 엔진을 번들에서 제외해 서버 파일 추적 경고/번들 비대화를 방지
  serverExternalPackages: ["@prisma/client", "@prisma/engines", "prisma"],
};

export default nextConfig;
