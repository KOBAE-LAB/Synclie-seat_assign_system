import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db/index.ts";
import {
  createSession,
  destroySession,
  getSession,
  signSessionToken,
  unsignSessionToken,
  type SessionTeacher,
} from "./sessions.ts";

const isProduction = process.env.NODE_ENV === "production";

/** 本番では __Host- 接頭辞（Secure・Path=/・Domain なしを強制）を付ける */
export const SESSION_COOKIE = isProduction ? "__Host-seat_assign_session" : "seat_assign_session";

const DEV_SECRET = "dev-only-session-secret-do-not-use-in-production";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && !secret.startsWith("change-me")) {
    if (secret.length < 32) console.warn("SESSION_SECRET は 32 文字以上を推奨します。");
    return secret;
  }
  if (isProduction) throw new Error("SESSION_SECRET が設定されていません。");
  return DEV_SECRET;
}

async function readToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? unsignSessionToken(value, sessionSecret()) : null;
}

/** ログイン中の講師（いなければ null）。1 リクエスト内ではキャッシュする */
export const getCurrentTeacher = cache(async (): Promise<SessionTeacher | null> => {
  const token = await readToken();
  return token ? getSession(getDb(), token) : null;
});

/** ログイン必須のページ・処理で使う。未ログインならログイン画面へ */
export async function requireTeacher(): Promise<SessionTeacher> {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teacher/login");
  return teacher;
}

/** セッションを作って Cookie を発行する（Server Action 内で呼ぶ） */
export async function startSession(teacherId: number): Promise<void> {
  const { token, expiresAt } = createSession(getDb(), teacherId);
  (await cookies()).set(SESSION_COOKIE, signSessionToken(token, sessionSecret()), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** セッションを DB から消し、Cookie も削除する */
export async function endSession(): Promise<void> {
  const token = await readToken();
  if (token) destroySession(getDb(), token);
  (await cookies()).delete(SESSION_COOKIE);
}

/** クライアントの IP（nginx が付ける X-Real-IP を優先） */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").at(-1)!.trim();
  return "unknown";
}

/**
 * CSRF 対策：フォーム送信元が同じオリジンかを確かめる。
 * Next.js の Server Actions も Origin と Host を照合するが、念のため明示的にも確認する。
 */
export async function isSameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
