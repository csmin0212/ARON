"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPost, type FormState } from "@/app/actions/posts";
import { CATEGORIES } from "@/lib/categories";

type UploadedImage = { id: number; url: string };

const inputCls =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

export default function WriteForm({ isLoggedIn }: { isLoggedIn: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createPost,
    undefined,
  );
  const [asAnon, setAsAnon] = useState(!isLoggedIn);
  const [images, setImages] = useState<UploadedImage[]>([]);
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

  const showAnonFields = !isLoggedIn || asAnon;
  const categories = isLoggedIn
    ? CATEGORIES
    : CATEGORIES.filter((c) => c.key !== "NOTICE");

  return (
    <form action={formAction} className="space-y-4">
      {/* 말머리 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">말머리</label>
        <div className="flex flex-wrap gap-2">
          {categories.map((c, i) => (
            <label key={c.key} className="cursor-pointer">
              <input
                type="radio"
                name="category"
                value={c.key}
                defaultChecked={i === 0 || c.key === "GENERAL"}
                className="peer sr-only"
              />
              <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-muted transition peer-checked:border-brand-400 peer-checked:bg-brand-50 peer-checked:text-brand-600 hover:bg-subtle">
                {c.emoji} {c.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">제목</label>
        <input name="title" maxLength={100} className={inputCls} placeholder="제목을 입력하세요" />
      </div>

      {/* 내용 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-content">내용</label>
        <textarea
          name="content"
          rows={12}
          className={`${inputCls} resize-y leading-relaxed`}
          placeholder="내용을 입력하세요. 꿀팁 공유 ㄱㄱ"
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

      {/* 익명 옵션 */}
      {isLoggedIn && (
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

      {showAnonFields && (
        <div className="grid grid-cols-1 gap-3 rounded-xl bg-subtle p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-faint">닉네임 (선택)</label>
            <input name="anonNick" maxLength={12} className={inputCls} placeholder="ㅇㅇ" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-faint">
              비밀번호 (삭제용, 선택)
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
          {pending ? "등록 중…" : "등록"}
        </button>
      </div>
    </form>
  );
}
