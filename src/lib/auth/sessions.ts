import crypto from "node:crypto";
import type { Db } from "../db/index.ts";

/**
 * 講師のログインセッション。
 * Cookie には「ランダムなトークン.HMAC 署名」を入れ、DB にはトークンの SHA-256 だけを保存する。
 * ログアウト・アカウント削除・パスワード再設定で DB の行を消せば、その Cookie は使えなくなる。
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SessionTeacher = { sessionId: number; teacherId: number; loginId: string };

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function sign(token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(token).digest("base64url");
}

/** Cookie の値を作る */
export function signSessionToken(token: string, secret: string): string {
  return `${token}.${sign(token, secret)}`;
}

/** Cookie の値の署名を確かめ、トークン本体を返す（不正なら null） */
export function unsignSessionToken(value: string, secret: string): string | null {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(token, secret));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return token;
}

/** セッションを作り、Cookie に入れるトークンを返す */
export function createSession(
  db: Db,
  teacherId: number,
  now: Date = new Date(),
): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare("DELETE FROM teacher_sessions WHERE expires_at <= ?").run(now.toISOString());
  db.prepare(
    "INSERT INTO teacher_sessions (token_hash, teacher_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sha256(token), teacherId, now.toISOString(), expiresAt.toISOString(), now.toISOString());
  return { token, expiresAt };
}

/** 有効なセッションならログイン中の講師を返す */
export function getSession(db: Db, token: string, now: Date = new Date()): SessionTeacher | null {
  const row = db
    .prepare(
      `SELECT s.id AS sessionId, s.teacher_id AS teacherId, t.login_id AS loginId, s.expires_at AS expiresAt
         FROM teacher_sessions s JOIN teachers t ON t.id = s.teacher_id
        WHERE s.token_hash = ?`,
    )
    .get(sha256(token)) as (SessionTeacher & { expiresAt: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= now.getTime()) {
    db.prepare("DELETE FROM teacher_sessions WHERE id = ?").run(row.sessionId);
    return null;
  }
  return { sessionId: row.sessionId, teacherId: row.teacherId, loginId: row.loginId };
}

export function destroySession(db: Db, token: string): void {
  db.prepare("DELETE FROM teacher_sessions WHERE token_hash = ?").run(sha256(token));
}
