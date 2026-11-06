"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 画面が表示されている間、一定間隔でサーバーの最新状態を取り込む */
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
