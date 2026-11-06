"use client";

/** 押す前に確認ダイアログを出す送信ボタン */
export function ConfirmButton({
  message,
  className = "button button--secondary",
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
