import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import RegisterForm from "@/components/forms/RegisterForm";

export const metadata = { title: "회원가입 · 아리안로드 온라인 갤러리" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="mx-auto max-w-sm animate-fadeup py-8">
      <div className="rounded-3xl border border-line bg-white p-7 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl shadow-sm">
            ✨
          </div>
          <h1 className="text-xl font-extrabold text-slate-800">모험가 등록</h1>
          <p className="mt-1 text-sm text-slate-400">계정을 만들고 갤러리에 합류하세요</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
