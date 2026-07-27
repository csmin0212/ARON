"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  message: string;
  disabled?: boolean;
};

export default function ConfirmSubmitButton({
  children,
  className,
  message,
  disabled = false,
}: Props) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
