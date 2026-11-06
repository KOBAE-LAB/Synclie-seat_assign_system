import type { Db } from "../db/index.ts";
import { hashSecret, verifySecret } from "./hash.ts";
import { generateRecoveryCode, normalizeRecoveryCode } from "./recovery-code.ts";
import { passwordError } from "./validation.ts";

/** 最後のログインからこの期間たったアカウントを自動削除する */
export const INACTIVE_DAYS = 730;

type Fail = { ok: false; message: string };

function currentHash(db: Db, teacherId: number): string | null {
  const row = db.prepare("SELECT password_hash FROM teachers WHERE id = ?").get(teacherId) as
    | { password_hash: string }
    | undefined;
  return row?.password_hash ?? null;
}

async function checkPassword(db: Db, teacherId: number, password: string): Promise<Fail | null> {
  const hash = currentHash(db, teacherId);
  if (!hash) return { ok: false, message: "アカウントが見つかりません。" };
  if (!(await verifySecret(password, hash))) return { ok: false, message: "今のパスワードが違います。" };
  return null;
}

/**
 * ログイン中の講師のパスワードを変更する。
 * ほかの端末のセッションはすべて無効にし、今使っているセッション（keepSessionId）だけ残す。
 */
export async function changePassword(
  db: Db,
  teacherId: number,
  currentPassword: string,
  newPassword: string,
  keepSessionId: number,
): Promise<{ ok: true } | Fail> {
  const inputError = passwordError(newPassword);
  if (inputError) return { ok: false, message: inputError };
  const fail = await checkPassword(db, teacherId, currentPassword);
  if (fail) return fail;
  if (await verifySecret(newPassword, currentHash(db, teacherId)!)) {
    return { ok: false, message: "新しいパスワードが今のパスワードと同じです。" };
  }
  const hash = await hashSecret(newPassword);
  db.transaction(() => {
    db.prepare("UPDATE teachers SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hash,
      new Date().toISOString(),
      teacherId,
    );
    db.prepare("DELETE FROM teacher_sessions WHERE teacher_id = ? AND id <> ?").run(teacherId, keepSessionId);
  })();
  return { ok: true };
}

/** 復元コードをなくしたとき用：パスワードを確認して新しい復元コードを発行する */
export async function reissueRecoveryCode(
  db: Db,
  teacherId: number,
  password: string,
): Promise<{ ok: true; recoveryCode: string } | Fail> {
  const fail = await checkPassword(db, teacherId, password);
  if (fail) return fail;
  const code = generateRecoveryCode();
  const hash = await hashSecret(normalizeRecoveryCode(code));
  db.prepare("UPDATE teachers SET recovery_code_hash = ?, updated_at = ? WHERE id = ?").run(
    hash,
    new Date().toISOString(),
    teacherId,
  );
  return { ok: true, recoveryCode: code };
}

/** アカウントを削除する（教室・講義・抽選結果・セッションもすべて消える） */
export async function deleteAccount(db: Db, teacherId: number, password: string): Promise<{ ok: true } | Fail> {
  const fail = await checkPassword(db, teacherId, password);
  if (fail) return fail;
  db.prepare("DELETE FROM teachers WHERE id = ?").run(teacherId);
  return { ok: true };
}

/**
 * 最後のログイン（ログインしたことがなければ作成日）から INACTIVE_DAYS 日たった講師を削除する。
 * 教室・講義・抽選結果は外部キーの ON DELETE CASCADE で一緒に消える。削除した件数を返す。
 */
export function purgeInactiveTeachers(db: Db, now: Date = new Date(), days = INACTIVE_DAYS): number {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return db.transaction(() => {
    db.prepare("DELETE FROM teacher_sessions WHERE expires_at <= ?").run(now.toISOString());
    return db.prepare("DELETE FROM teachers WHERE COALESCE(last_login_at, created_at) < ?").run(cutoff).changes;
  })();
}
