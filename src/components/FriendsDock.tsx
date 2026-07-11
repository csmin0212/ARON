"use client";

import { useActionState, useState } from "react";
import {
  inviteToHouse,
  removeFriend,
  respondFriendRequest,
  respondHouseInvite,
  sendFriendRequest,
  type FriendState,
} from "@/app/actions/friends";

export type FriendView = { id: string; nickname: string; where: string };
export type FriendRequestView = { id: string; nickname: string };
export type HouseInviteView = { id: string; nickname: string };

function StateLine({ state }: { state: FriendState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p
      className={`rounded-xl px-3 py-2 text-xs font-bold ${
        state.error ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
      }`}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export default function FriendsDock({
  friends,
  requests,
  invites,
  canInvite,
}: {
  friends: FriendView[];
  requests: FriendRequestView[];
  invites: HouseInviteView[];
  canInvite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [addState, addAction, addPending] = useActionState<FriendState, FormData>(
    sendFriendRequest,
    undefined,
  );
  const [respondState, respondAction, respondPending] = useActionState<FriendState, FormData>(
    respondFriendRequest,
    undefined,
  );
  const [removeState, removeAction, removePending] = useActionState<FriendState, FormData>(
    removeFriend,
    undefined,
  );
  const [inviteState, inviteAction, invitePending] = useActionState<FriendState, FormData>(
    inviteToHouse,
    undefined,
  );
  const [visitState, visitAction, visitPending] = useActionState<FriendState, FormData>(
    respondHouseInvite,
    undefined,
  );

  const alertCount = requests.length + invites.length;

  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-1"
      >
        <h2 className="text-sm font-extrabold text-content">
          👥 친구 <span className="font-bold text-faint">{friends.length}</span>
        </h2>
        <span className="flex items-center gap-2">
          {alertCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white">
              {alertCount}
            </span>
          )}
          <span className="text-faint2">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <StateLine state={addState} />
          <StateLine state={respondState} />
          <StateLine state={removeState} />
          <StateLine state={inviteState} />
          <StateLine state={visitState} />

          {invites.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-brand-200 bg-brand-50 p-3">
              <p className="text-xs font-extrabold text-brand-600">🏠 받은 집 초대</p>
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-content">
                    {invite.nickname}님의 집
                  </span>
                  <form action={visitAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <input type="hidden" name="accept" value="1" />
                    <button
                      type="submit"
                      disabled={visitPending}
                      className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
                    >
                      놀러가기
                    </button>
                  </form>
                  <form action={visitAction}>
                    <input type="hidden" name="id" value={invite.id} />
                    <input type="hidden" name="accept" value="0" />
                    <button
                      type="submit"
                      disabled={visitPending}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle disabled:opacity-50"
                    >
                      거절
                    </button>
                  </form>
                </div>
              ))}
            </section>
          )}

          {requests.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-extrabold text-amber-600">✉️ 받은 친구 요청</p>
              {requests.map((request) => (
                <div key={request.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-content">
                    {request.nickname}
                  </span>
                  <form action={respondAction}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="accept" value="1" />
                    <button
                      type="submit"
                      disabled={respondPending}
                      className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-emerald-600 disabled:opacity-50"
                    >
                      수락
                    </button>
                  </form>
                  <form action={respondAction}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="accept" value="0" />
                    <button
                      type="submit"
                      disabled={respondPending}
                      className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle disabled:opacity-50"
                    >
                      거절
                    </button>
                  </form>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2">
            {friends.length === 0 ? (
              <p className="rounded-2xl bg-subtle px-3 py-3 text-xs text-faint">
                아직 친구가 없어요. 아래에서 닉네임으로 친구를 추가해보세요.
              </p>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-subtle px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-content">
                      {friend.nickname}
                    </p>
                    <p className="truncate text-[11px] text-faint">{friend.where}</p>
                  </div>
                  {canInvite && (
                    <form action={inviteAction}>
                      <input type="hidden" name="friendId" value={friend.id} />
                      <button
                        type="submit"
                        disabled={invitePending}
                        title="내 집으로 초대"
                        className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-black text-brand-600 transition hover:bg-brand-100 disabled:opacity-50"
                      >
                        🏠 초대
                      </button>
                    </form>
                  )}
                  <form
                    action={removeAction}
                    onSubmit={(e) => {
                      if (!window.confirm(`${friend.nickname}님을 친구에서 삭제할까요?`))
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="friendId" value={friend.id} />
                    <button
                      type="submit"
                      disabled={removePending}
                      title="친구 삭제"
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-faint transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              ))
            )}
            {canInvite && friends.length > 0 && (
              <p className="px-1 text-[11px] font-bold text-faint">
                친구만 집에 초대할 수 있어요!
              </p>
            )}
          </section>

          <form action={addAction} className="flex gap-2">
            <input
              type="text"
              name="name"
              maxLength={30}
              placeholder="닉네임 또는 아이디"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-content placeholder:text-faint2 focus:border-brand-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={addPending}
              className="shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-xs font-black text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              친구 추가
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
