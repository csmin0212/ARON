"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import CommentForm from "./CommentForm";
import { deleteComment } from "@/app/actions/comments";
import { formatFullDate } from "@/lib/format";

export type CommentNode = {
  id: number;
  content: string;
  createdAt: string;
  isDeleted: boolean;
  isAuthorPost: boolean;
  member: { username: string; nickname: string; avatar: string | null } | null;
  anonNick: string | null;
  anonIp: string | null;
  isMine: boolean;
  anonHasPass: boolean;
  replies: CommentNode[];
};

function AuthorLine({ node }: { node: CommentNode }) {
  if (node.member) {
    return (
      <span className="flex items-center gap-1.5">
        <Avatar name={node.member.nickname} avatar={node.member.avatar} size={22} />
        <Link
          href={`/u/${encodeURIComponent(node.member.username)}`}
          className="text-sm font-bold text-content transition hover:text-brand-600 hover:underline"
        >
          {node.member.nickname}
        </Link>
        {node.isAuthorPost && (
          <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
            작성자
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <Avatar name="ㅇㅇ" anonymous size={22} />
      <span className="text-sm font-bold text-muted">
        {node.anonNick ?? "ㅇㅇ"}
        <span className="ml-1 text-[11px] font-normal text-faint2">({node.anonIp})</span>
      </span>
      {node.isAuthorPost && (
        <span className="rounded bg-subtle-hover px-1.5 py-0.5 text-[10px] font-bold text-muted">
          작성자
        </span>
      )}
    </span>
  );
}

function Node({
  node,
  postId,
  isLoggedIn,
  depth,
}: {
  node: CommentNode;
  postId: number;
  isLoggedIn: boolean;
  depth: number;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const canDelete = !node.isDeleted && (node.isMine || node.anonHasPass);

  function handleDelete() {
    let password = "";
    if (!node.isMine && node.anonHasPass) {
      password = window.prompt("댓글 비밀번호를 입력하세요") ?? "";
      if (!password) return;
    } else if (!window.confirm("댓글을 삭제할까요?")) {
      return;
    }
    const fd = new FormData();
    fd.set("id", String(node.id));
    fd.set("password", password);
    startTransition(() => {
      void deleteComment(fd);
    });
  }

  return (
    <li>
      <div className={depth > 0 ? "border-l-2 border-line pl-3 sm:pl-4" : ""}>
        <div className="py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {depth > 0 && <span className="text-faint2">└</span>}
              <AuthorLine node={node} />
            </div>
            <span className="shrink-0 text-[11px] text-faint2">
              {formatFullDate(node.createdAt)}
            </span>
          </div>

          <p
            className={`mt-1.5 whitespace-pre-wrap break-words pl-0.5 text-[15px] leading-relaxed ${
              node.isDeleted ? "italic text-faint2" : "text-content"
            }`}
          >
            {node.content}
          </p>

          {!node.isDeleted && (
            <div className="mt-1.5 flex items-center gap-3 text-xs text-faint">
              <button
                onClick={() => setReplyOpen((v) => !v)}
                className="font-semibold transition hover:text-brand-500"
              >
                답글
              </button>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={pending}
                  className="font-semibold transition hover:text-rose-500 disabled:opacity-50"
                >
                  삭제
                </button>
              )}
            </div>
          )}

          {replyOpen && (
            <div className="mt-2">
              <CommentForm
                postId={postId}
                parentId={node.id}
                isLoggedIn={isLoggedIn}
                compact
                autoFocus
                onSuccess={() => setReplyOpen(false)}
              />
            </div>
          )}
        </div>

        {node.replies.length > 0 && (
          <ul className="space-y-0">
            {node.replies.map((child) => (
              <Node
                key={child.id}
                node={child}
                postId={postId}
                isLoggedIn={isLoggedIn}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function CommentThread({
  nodes,
  postId,
  isLoggedIn,
}: {
  nodes: CommentNode[];
  postId: number;
  isLoggedIn: boolean;
}) {
  if (nodes.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-faint2">
        아직 댓글이 없어요. 첫 댓글을 남겨보세요!
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {nodes.map((n) => (
        <Node key={n.id} node={n} postId={postId} isLoggedIn={isLoggedIn} depth={0} />
      ))}
    </ul>
  );
}
