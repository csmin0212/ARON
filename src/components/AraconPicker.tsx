"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ARACONS } from "@/lib/aracon";

const PICKER_GAP = 8;
const VIEWPORT_MARGIN = 12;

type PickerPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export default function AraconPicker({
  onPick,
  compact = false,
  variant = "text",
  align = "right",
  placement = "bottom",
}: {
  onPick: (token: string) => void;
  compact?: boolean;
  variant?: "text" | "icon";
  align?: "left" | "right";
  placement?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<0 | 1>(0);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isIcon = variant === "icon";
  const visibleAracons = ARACONS.slice(tab * 16, tab * 16 + 16);
  const pickerWidth = compact ? 288 : 320;

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(pickerWidth, viewportWidth - VIEWPORT_MARGIN * 2);
      const panelHeight = panelRef.current?.offsetHeight ?? 420;
      const spaceAbove = rect.top - VIEWPORT_MARGIN - PICKER_GAP;
      const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - PICKER_GAP;
      const openUp =
        placement === "top"
          ? spaceAbove >= Math.min(panelHeight, 260) || spaceAbove >= spaceBelow
          : !(spaceBelow >= Math.min(panelHeight, 260) || spaceBelow >= spaceAbove);
      const maxHeight = Math.max(220, openUp ? spaceAbove : spaceBelow);
      const leftBase = align === "right" ? rect.right - width : rect.left;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, leftBase),
        viewportWidth - width - VIEWPORT_MARGIN,
      );
      const top = openUp
        ? Math.max(VIEWPORT_MARGIN, rect.top - PICKER_GAP - Math.min(panelHeight, maxHeight))
        : Math.min(rect.bottom + PICKER_GAP, viewportHeight - VIEWPORT_MARGIN);

      setPosition({ left, top, width, maxHeight });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, open, pickerWidth, placement]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const pickerPanel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[9999] overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-xl"
            style={{
              left: position?.left ?? VIEWPORT_MARGIN,
              top: position?.top ?? VIEWPORT_MARGIN,
              width: position?.width ?? pickerWidth,
              maxHeight: position?.maxHeight ?? "70vh",
              visibility: position ? "visible" : "hidden",
            }}
          >
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-subtle p-1">
              {(["아라콘1", "아라콘2"] as const).map((label, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setTab(index as 0 | 1)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-extrabold transition ${
                    tab === index
                      ? "bg-surface text-brand-600 shadow-sm"
                      : "text-faint hover:bg-surface/70 hover:text-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {visibleAracons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onPick(item.token);
                    setOpen(false);
                  }}
                  className="group rounded-xl border border-transparent bg-subtle p-1 transition hover:border-brand-300 hover:bg-brand-50"
                  title={`${item.label} ${item.token}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.src} alt={item.label} className="mx-auto h-14 w-14 object-contain" />
                  <span className="block truncate text-[10px] font-bold text-faint group-hover:text-brand-600">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setPosition(null);
          setOpen((value) => !value);
        }}
        className={
          isIcon
            ? "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl border border-line bg-subtle text-lg transition hover:border-brand-300 hover:bg-brand-50"
            : "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-subtle hover:text-content"
        }
        aria-label="아라콘 선택"
        title="아라콘"
      >
        {isIcon ? "🧊" : "🧊 아라콘"}
      </button>
      {pickerPanel}
    </div>
  );
}
