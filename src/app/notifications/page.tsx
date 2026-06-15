import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";

export const metadata = { title: "알림 · 아리안로드 온라인 갤러리" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">NOTIFICATIONS</p>
            <h1 className="mt-1 text-2xl font-black text-content">알림</h1>
            <p className="mt-1 text-sm text-faint">
              거래 요청, 거래 대화, 확정 상태 같은 기록을 확인합니다.
            </p>
          </div>
          {unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-700">
                모두 읽음
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {notifications.length ? (
          notifications.map((item) => {
            const content = (
              <div
                className={`rounded-3xl border p-4 shadow-sm transition ${
                  item.readAt
                    ? "border-line bg-surface"
                    : "border-brand-300 bg-brand-50/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-extrabold text-content">
                      {item.kind === "trade" ? "🔔 " : ""}
                      {item.title}
                    </p>
                    {item.body && <p className="mt-1 text-sm text-muted">{item.body}</p>}
                    <p className="mt-2 text-xs font-bold text-faint">{formatFullDate(item.createdAt)}</p>
                  </div>
                  {!item.readAt && (
                    <form action={markNotificationRead} className="shrink-0">
                      <input type="hidden" name="id" value={item.id} />
                      <button className="rounded-xl bg-surface px-3 py-2 text-xs font-extrabold text-brand-600 shadow-sm">
                        읽음
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );

            return item.href ? (
              <Link key={item.id} href={item.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={item.id}>{content}</div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-line bg-surface p-8 text-center text-sm text-faint shadow-sm">
            아직 알림이 없어요.
          </div>
        )}
      </section>
    </div>
  );
}
