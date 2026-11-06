import type { Db } from "../db/index.ts";
import { hashSecret, verifyDummy, verifySecret } from "./hash.ts";
import { generateRecoveryCode, isWellFormedRecoveryCode, normalizeRecoveryCode } from "./recovery-code.ts";
import { loginIdError, passwordError } from "./validation.ts";

/** 続けて何回間違えるとロックするか */
export const MAX_FAILED_ATTEMPTS = 5;
/** ロックする時間 */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

type TeacherRow = {
  id: number;
  login_id: string;
  password_hash: string;
  recovery_code_hash: string;
  failed_login_count: number;
  locked_until: string | null;
};

export type AuthFailure =
  | { ok: false; reason: "invalid"; remaining: number }
  | { ok: false; reason: "locked"; lockedUntil: Date };

export type LoginResult = { ok: true; teacherId: number; loginId: string } | AuthFailure;

export type IssuedAccount = { ok: true; teacherId: number; loginId: string; recoveryCode: string };

function findTeacher(db: Db, loginId: string): TeacherRow | undefined {
  return db
    .prepare(
      `SELECT id, login_id, password_hash, recovery_code_hash, failed_login_count, locked_until
         FROM teachers WHERE login_id = ? COLLATE NOCASE`,
    )
    .get(loginId) as TeacherRow | undefined;
}

export function isLoginIdTaken(db: Db, loginId: string): boolean {
  return db.prepare("SELECT 1 FROM teachers WHERE login_id = ? COLLATE NOCASE").get(loginId) !== undefined;
}

/* ------------------------------------------------------------------ */
/* ロック判定                                                           */
/* ------------------------------------------------------------------ */

/** ロック中なら解除時刻を返す。期限切れのロックは解除して回数を 0 に戻す */
function activeLock(db: Db, row: TeacherRow, now: Date): Date | null {
  if (!row.locked_until) return null;
  const until = new Date(row.locked_until);
  if (until.getTime() > now.getTime()) return until;
  db.prepare(
    "UPDATE teachers SET failed_login_count = 0, locked_until = NULL WHERE id = ? AND locked_until = ?",
  ).run(row.id, row.locked_until);
  return null;
}

/** 失敗を 1 回記録する。5 回目でロックし、回数は 0 に戻す */
function recordFailure(db: Db, teacherId: number, now: Date): AuthFailure {
  return db.transaction((): AuthFailure => {
    const { failed_login_count: count } = db
      .prepare(
        `UPDATE teachers SET failed_login_count = failed_login_count + 1
          WHERE id = ? RETURNING failed_login_count`,
      )
      .get(teacherId) as { failed_login_count: number };
    if (count >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
      db.prepare("UPDATE teachers SET failed_login_count = 0, locked_until = ? WHERE id = ?").run(
        lockedUntil.toISOString(),
        teacherId,
      );
      return { ok: false, reason: "locked", lockedUntil };
    }
    return { ok: false, reason: "invalid", remaining: MAX_FAILED_ATTEMPTS - count };
  })();
}

function recordSuccess(db: Db, teacherId: number, now: Date): void {
  db.prepare(
    `UPDATE teachers SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
      WHERE id = ?`,
  ).run(now.toISOString(), now.toISOString(), teacherId);
}

/**
 * 存在しないログイン ID 用の仮の失敗カウンタ（メモリのみ）。
 * 実在する ID と同じ「あと○回」「15分間ログインできません」を返し、ID の有無を推測させない。
 */
const ghostCounters = new Map<string, { count: number; lockedUntil: number | null }>();
const GHOST_MAX_ENTRIES = 10_000;

function recordGhostFailure(loginId: string, now: Date): AuthFailure {
  const key = loginId.toLowerCase();
  let entry = ghostCounters.get(key);
  if (entry?.lockedUntil && entry.lockedUntil > now.getTime()) {
    return { ok: false, reason: "locked", lockedUntil: new Date(entry.lockedUntil) };
  }
  if (!entry || entry.lockedUntil) entry = { count: 0, lockedUntil: null };
  entry.count += 1;
  ghostCounters.delete(key);
  if (ghostCounters.size >= GHOST_MAX_ENTRIES) {
    ghostCounters.delete(ghostCounters.keys().next().value as string);
  }
  ghostCounters.set(key, entry);
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.count = 0;
    entry.lockedUntil = now.getTime() + LOCK_DURATION_MS;
    return { ok: false, reason: "locked", lockedUntil: new Date(entry.lockedUntil) };
  }
  return { ok: false, reason: "invalid", remaining: MAX_FAILED_ATTEMPTS - entry.count };
}

/** テスト用 */
export function clearGhostCounters(): void {
  ghostCounters.clear();
}

/* ------------------------------------------------------------------ */
/* アカウント作成・ログイン・パスワード再設定                            */
/* ------------------------------------------------------------------ */

export async function createTeacher(
  db: Db,
  loginId: string,
  password: string,
  now: Date = new Date(),
): Promise<IssuedAccount | { ok: false; reason: "taken" | "invalid_input"; message: string }> {
  const inputError = loginIdError(loginId) ?? passwordError(password);
  if (inputError) return { ok: false, reason: "invalid_input", message: inputError };
  if (isLoginIdTaken(db, loginId)) return takenResult();

  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(password),
    hashSecret(normalizeRecoveryCode(recoveryCode)),
  ]);
  try {
    const iso = now.toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO teachers (login_id, password_hash, recovery_code_hash, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(loginId, passwordHash, recoveryHash, iso, iso, iso);
    return { ok: true, teacherId: Number(lastInsertRowid), loginId, recoveryCode };
  } catch (e) {
    // ハッシュ計算中に同じ ID が登録された場合
    if (e instanceof Error && /UNIQUE/.test(e.message)) return takenResult();
    throw e;
  }
}

function takenResult() {
  return { ok: false as const, reason: "taken" as const, message: "このログインIDはすでに使われています。" };
}

export async function login(
  db: Db,
  loginId: string,
  password: string,
  now: Date = new Date(),
): Promise<LoginResult> {
  const row = loginIdError(loginId) ? undefined : findTeacher(db, loginId);
  if (!row) {
    await verifyDummy(password);
    return recordGhostFailure(loginId, now);
  }
  const lockedUntil = activeLock(db, row, now);
  if (lockedUntil) return { ok: false, reason: "locked", lockedUntil };

  if (!(await verifySecret(password, row.password_hash))) return recordFailure(db, row.id, now);
  recordSuccess(db, row.id, now);
  return { ok: true, teacherId: row.id, loginId: row.login_id };
}

/**
 * 復元コードでパスワードを再設定する。
 * 復元コードは 1 回限り。成功すると新しい復元コードを発行し、既存のセッションはすべて無効にする。
 */
export async function resetPassword(
  db: Db,
  loginId: string,
  recoveryCode: string,
  newPassword: string,
  now: Date = new Date(),
): Promise<IssuedAccount | AuthFailure | { ok: false; reason: "invalid_input"; message: string }> {
  const inputError = passwordError(newPassword);
  if (inputError) return { ok: false, reason: "invalid_input", message: inputError };

  const code = normalizeRecoveryCode(recoveryCode);
  const row = loginIdError(loginId) ? undefined : findTeacher(db, loginId);
  if (!row) {
    await verifyDummy(code);
    return recordGhostFailure(loginId, now);
  }
  const lockedUntil = activeLock(db, row, now);
  if (lockedUntil) return { ok: false, reason: "locked", lockedUntil };

  const matched = isWellFormedRecoveryCode(code)
    ? await verifySecret(code, row.recovery_code_hash)
    : await verifyDummy(code);
  if (!matched) return recordFailure(db, row.id, now);

  const newCode = generateRecoveryCode();
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(newPassword),
    hashSecret(normalizeRecoveryCode(newCode)),
  ]);
  const iso = now.toISOString();
  const consumed = db.transaction(() => {
    // 照合したコードがまだ有効な場合だけ置き換える（同じコードの同時使用を防ぐ）
    const { changes } = db
      .prepare(
        `UPDATE teachers
            SET password_hash = ?, recovery_code_hash = ?, failed_login_count = 0, locked_until = NULL,
                last_login_at = ?, updated_at = ?
          WHERE id = ? AND recovery_code_hash = ?`,
      )
      .run(passwordHash, recoveryHash, iso, iso, row.id, row.recovery_code_hash);
    if (changes !== 1) return false;
    db.prepare("DELETE FROM teacher_sessions WHERE teacher_id = ?").run(row.id);
    return true;
  })();
  if (!consumed) return recordFailure(db, row.id, now);
  return { ok: true, teacherId: row.id, loginId: row.login_id, recoveryCode: newCode };
}
