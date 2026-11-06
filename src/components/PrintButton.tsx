"use client";

export function PrintButton({ children = "印刷 / PDF に保存" }: { children?: React.ReactNode }) {
  return (
    <button type="button" className="button" onClick={() => window.print()}>
      {children}
    </button>
  );
}
