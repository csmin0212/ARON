import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatFullDate } from "@/lib/format";
import { CARD_STYLE_MAP, type ProfileCardStyle } from "@/lib/profileCard";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  claimMail,
  deleteAllMail,
  deleteMail,
  markAllMailRead,
  markMailRead,
} from "@/app/actions/mail";

export const metadata = { title: "우편함 · 아리안로드 온라인 갤러리" };

// 한 페이지에 보여줄 통수. 예전엔 최신 100통만 가져오고 끝이라, 그보다 많이 쌓인
// 사람은 오래된 우편이 아예 안 보였다 (228통까지 쌓인 사례).
const PAGE_SIZE = 50;

// 첨부가 없거나 이미 수령한 우편만 지울 수 있다 — '전체 삭제' 버튼 노출 조건과 같다.
const DELETABLE = {
  OR: [
    { claimedAt: { not: null } },
    {
      AND: [
        { gold: { lte: 0 } },
        { OR: [{ itemName: null }, { itemQty: { lte: 0 } }] },
        { cardSkin: null },
      ],
    },
  ],
};

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sp = await searchParams;

  const where = { recipientId: user.id };
  // 개수는 전체 기준으로 센다 — 현재 페이지만 보고 세면 '모두 읽음' 같은 버튼이
  // 뒤쪽 페이지에 읽지 않은 우편이 남아 있어도 사라진다.
  const [total, unread, deletableCount] = await Promise.all([
    prisma.mail.count({ where }),
    prisma.mail.count({ where: { ...where, readAt: null } }),
    prisma.mail.count({ where: { ...where, ...DELETABLE } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const mails = await prisma.mail.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return (
    <div className="mx-auto max-w-2xl animate-fadeup space-y-5 py-4">
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-faint">MAILBOX</p>
            <h1 className="mt-1 text-2xl font-black text-content">📬 우편함</h1>
            <p className="mt-1 text-sm text-faint">
              GM 우편과 경매장 보관품을 수령합니다.
            </p>
            <p className="mt-1 text-xs font-bold text-faint">
              전체 {total}통{unread > 0 ? ` · 안 읽음 ${unread}통` : ""}
              {pageCount > 1 ? ` · ${page}/${pageCount} 페이지` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unread > 0 && (
              <form action={markAllMailRead}>
                <button className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-brand-700">
                  모두 읽음
                </button>
              </form>
            )}
            {deletableCount > 0 && (
              <form action={deleteAllMail}>
                <ConfirmSubmitButton
                  message="수령 완료했거나 첨부가 없는 우편을 모두 삭제할까요? 미수령 첨부 우편은 보존됩니다."
                  className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-extrabold text-rose-600 transition hover:bg-rose-100"
                >
                  전체 삭제
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </div>
      </section>

      {sp.error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {sp.error}
        </p>
      )}

      <section className="space-y-3">
        {mails.length ? (
          mails.map((m) => {
            const hasAttach = m.gold > 0 || (!!m.itemName && m.itemQty > 0) || !!m.cardSkin;
            const claimable = hasAttach && !m.claimedAt;
            const skinLabel = m.cardSkin
              ? CARD_STYLE_MAP[m.cardSkin as ProfileCardStyle]?.label ?? m.cardSkin
              : null;
            return (
              <div
                key={m.id}
                className={`rounded-3xl border p-4 shadow-sm transition ${
                  m.readAt ? "border-line bg-surface" : "border-brand-300 bg-brand-50/60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-faint">✉️ {m.senderName}</p>
                    <p className="mt-0.5 font-extrabold text-content">{m.subject}</p>
                    {m.body && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{m.body}</p>
                    )}
                    {hasAttach && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {m.gold > 0 && (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                            💰 {m.gold.toLocaleString("ko-KR")}G
                          </span>
                        )}
                        {m.itemName && m.itemQty > 0 && (
                          <span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
                            🎁 {m.itemName} x{m.itemQty}
                          </span>
                        )}
                        {skinLabel && (
                          <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
                            🎨 {skinLabel} 카드
                          </span>
                        )}
                        <span
                          className={`rounded-lg px-2 py-1 text-xs font-bold ${
                            m.claimedAt
                              ? "bg-subtle text-faint"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {m.claimedAt ? "수령 완료" : "미수령"}
                        </span>
                      </div>
                    )}
                    <p className="mt-2 text-xs font-bold text-faint">{formatFullDate(m.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {claimable && (
                      <form action={claimMail}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-emerald-600">
                          📥 받기
                        </button>
                      </form>
                    )}
                    {!m.readAt && (
                      <form action={markMailRead}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="rounded-xl bg-surface px-3 py-2 text-xs font-extrabold text-brand-600 shadow-sm ring-1 ring-line">
                          읽음
                        </button>
                      </form>
                    )}
                    {!claimable && (
                      <form action={deleteMail}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="rounded-xl px-3 py-2 text-xs font-bold text-faint transition hover:text-rose-500">
                          삭제
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-3xl border border-line bg-surface p-8 text-center text-sm text-faint shadow-sm">
            아직 우편이 없어요.
          </div>
        )}
      </section>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-2 rounded-3xl border border-line bg-surface px-4 py-3 shadow-sm">
          {page > 1 ? (
            <a
              href={`/mail?page=${page - 1}`}
              className="rounded-xl border border-line px-3 py-2 text-xs font-extrabold text-content transition hover:border-brand-300 hover:bg-brand-50"
            >
              ← 최신
            </a>
          ) : (
            <span className="px-3 py-2 text-xs font-bold text-faint">← 최신</span>
          )}
          <span className="text-xs font-extrabold text-muted">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <a
              href={`/mail?page=${page + 1}`}
              className="rounded-xl border border-line px-3 py-2 text-xs font-extrabold text-content transition hover:border-brand-300 hover:bg-brand-50"
            >
              지난 우편 →
            </a>
          ) : (
            <span className="px-3 py-2 text-xs font-bold text-faint">지난 우편 →</span>
          )}
        </nav>
      )}
    </div>
  );
}
