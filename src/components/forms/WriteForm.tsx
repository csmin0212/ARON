"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, updatePost, type FormState } from "@/app/actions/posts";
import { CATEGORIES } from "@/lib/categories";

type UploadedImage = { id: number; url: string };

// 수정 모드 초기값 — 있으면 편집, 없으면 새 글 작성
export type EditInitial = {
  id: number;
  category: string;
  title: string;
  content: string;
  price: number | null;
  tradeType: string | null;
  isAnon: boolean; // 익명 글이면 수정 시 비밀번호 필요
  images: { id: number; url: string }[];
};

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function WriteForm({
  isLoggedIn,
  initial,
}: {
  isLoggedIn: boolean;
  initial?: EditInitial;
}) {
  const router = useRouter();
  const isEdit = !!initial;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    isEdit ? updatePost : createPost,
    undefined,
  );
  const [asAnon, setAsAnon] = useState(!isLoggedIn);
  const [category, setCategory] = useState(initial?.category ?? "GENERAL");
  const [images, setImages] = useState<UploadedImage[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (images.length >= 10) {
          setUploadError("이미지는 최대 10장까지 첨부할 수 있어요.");
          break;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setUploadError(data.error ?? "업로드에 실패했어요.");
          continue;
        }
        setImages((prev) => [...prev, { id: data.id, url: data.url }]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage(id: number) {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }

  // 새 글: 익명 옵션에 따라 익명 필드. 수정 글: 익명 글이면 비밀번호로 인증.
  const showAnonFields = !isEdit && (!isLoggedIn || asAnon);
  // 수정 시 공지 지정은 회원 글만. 새 글은 로그인 시에만 공지 가능.
  const canNotice = isEdit ? !initial.isAnon : isLoggedIn;
  const categories = canNotice ? CATEGORIES : CATEGORIES.filter((c) => c.key !== "NOTICE");
  const isTrade = category === "TRADE";

  return (
    <form action={formAction} className="space-y-4">
      {isEdit && <input type="hidden" name="id" value={initial.id} />}
      {/* 말머리 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">말머리</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={c.key}
                checked={category === c.key}
                onChange={() => setCategory(c.key)}
                className="peer sr-only"
              />
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-muted transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-600 hover:bg-subtle">
                {c.emoji} {c.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 거래 전용 필드 */}
      {isTrade && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-content">거래 유형</label>
            <div className="flex gap-2">
              {[
                { v: "SELL", t: "💸 팝니다" },
                { v: "BUY", t: "🛒 삽니다" },
              ].map((o, i) => (
                <label key={o.v} className="cursor-pointer">
                  <input
                    type="radio"
                    name="tradeType"
                    value={o.v}
                    defaultChecked={initial?.tradeType ? initial.tradeType === o.v : i === 0}
                    className="peer sr-only"
                  />
                  <span className="inline-flex rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-muted transition peer-checked:border-emerald-400 peer-checked:bg-emerald-100 peer-checked:text-emerald-700">
                    {o.t}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-content">
              가격 <span className="text-xs font-normal text-faint">(골드)</span>
            </label>
            <div className="relative w-48">
              <input
                name="price"
                type="number"
                min={0}
                defaultValue={initial?.price ?? 0}
                className={inputCls}
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-500">
                G
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 제목 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">제목</label>
        <input
          name="title"
          maxLength={100}
          defaultValue={initial?.title}
          className={inputCls}
          placeholder="제목을 입력하세요"
        />
      </div>

      {/* 내용 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">내용</label>
        <textarea
          name="content"
          rows={12}
          defaultValue={initial?.content}
          className={`${inputCls} resize-y leading-relaxed`}
          placeholder={isTrade ? "매물 설명, 거래 방식 등을 적어주세요." : "내용을 입력하세요. 꿀팁 공유 ㄱㄱ"}
        />
      </div>

      {/* 이미지 첨부 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-semibold text-content">
            이미지 첨부 <span className="text-xs font-normal text-faint">(최대 10장 · 4MB)</span>
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || images.length >= 10}
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-subtle disabled:opacity-50"
          >
            {uploading ? "업로드 중…" : "🖼 이미지 추가"}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((img) => (
              <div key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="첨부 이미지" className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="이미지 제거"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {uploadError && <p className="mt-2 text-sm font-medium text-rose-500">{uploadError}</p>}
      </div>

      <input type="hidden" name="imageIds" value={images.map((i) => i.id).join(",")} />

      {/* 익명 옵션 (새 글 전용 — 수정 시엔 작성자 변경 불가) */}
      {isLoggedIn && !isEdit && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            name="asAnon"
            checked={asAnon}
            onChange={(e) => setAsAnon(e.target.checked)}
            className="h-4 w-4 rounded accent-brand-500"
          />
          익명으로 작성하기
        </label>
      )}

      {/* 수정 인증 — 익명 글은 비밀번호로 본인 확인 */}
      {isEdit && initial.isAnon && (
        <div className="rounded-xl bg-subtle p-4">
          <label className="mb-1 block text-xs font-medium text-faint">
            비밀번호 <span className="text-faint2">(작성 시 설정한 익명 비밀번호)</span>
          </label>
          <input
            name="password"
            type="password"
            maxLength={20}
            className={inputCls}
            placeholder="수정하려면 비밀번호를 입력하세요"
          />
        </div>
      )}

      {showAnonFields && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-subtle p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-faint">닉네임 (선택)</label>
            <input name="anonNick" maxLength={12} className={inputCls} placeholder="ㅇㅇ" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-faint">
              비밀번호 (삭제용{isTrade ? " · 거래완료" : ""}, 선택)
            </label>
            <input
              name="anonPass"
              type="password"
              maxLength={20}
              className={inputCls}
              placeholder="3~20자"
            />
          </div>
        </div>
      )}

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl border border-line px-5 py-3 text-sm font-semibold text-muted transition hover:bg-subtle"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-60"
        >
          {pending ? (isEdit ? "수정 중…" : "등록 중…") : isEdit ? "수정 완료" : "등록"}
        </button>
      </div>
    </form>
  );
}
