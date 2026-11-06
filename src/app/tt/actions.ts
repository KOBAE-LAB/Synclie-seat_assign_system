"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { clientIp, isSameOrigin } from "@/lib/auth/server";
import { RATE_LIMIT_MESSAGE, RateLimiter } from "@/lib/auth/rate-limit";
import { getLectureByTtCode, normalizeTtCode } from "@/lib/seating/lectures";
import { TT_COOKIE } from "@/lib/seating/tt-cookie";

export type TtState = { error?: string };

const globalForTt = globalThis as unknown as { __seatAssignTtLimiter?: RateLimiter };
// コードの総当たりを防ぐ：10 分に 20 回まで
const ttLimiter = (globalForTt.__seatAssignTtLimiter ??= new RateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 }));

export async function enterTtCodeAction(_prev: TtState, formData: FormData): Promise<TtState> {
  if (!(await isSameOrigin())) return { error: "ページを再読み込みしてから、もう一度お試しください。" };
  if (!ttLimiter.consume(await clientIp())) return { error: RATE_LIMIT_MESSAGE };
  const raw = formData.get("code");
  const code = typeof raw === "string" ? normalizeTtCode(raw) : null;
  if (!code || !getLectureByTtCode(getDb(), code)) {
    return { error: "コードが違うか、講師によって無効にされています。" };
  }
  (await cookies()).set(TT_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  redirect("/tt/view");
}

export async function leaveTtAction(): Promise<void> {
  (await cookies()).delete(TT_COOKIE);
  redirect("/tt");
}
