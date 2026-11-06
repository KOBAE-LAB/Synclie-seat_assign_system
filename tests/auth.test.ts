import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db/index.ts";
import { hashSecret, verifySecret } from "../src/lib/auth/hash.ts";
import {
  generateRecoveryCode,
  isWellFormedRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_ALPHABET,
} from "../src/lib/auth/recovery-code.ts";
import {
  clearGhostCounters,
  createTeacher,
  isLoginIdTaken,
  LOCK_DURATION_MS,
  login,
  resetPassword,
} from "../src/lib/auth/teachers.ts";
import {
  createSession,
  destroySession,
  getSession,
  SESSION_TTL_MS,
  signSessionToken,
  unsignSessionToken,
} from "../src/lib/auth/sessions.ts";
import { RateLimiter } from "../src/lib/auth/rate-limit.ts";
import { loginIdError, passwordError } from "../src/lib/auth/validation.ts";

const PASSWORD = "correct horse battery";
const T0 = new Date("2026-04-01T09:00:00.000Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60 * 1000);

let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
  clearGhostCounters();
});

afterEach(() => {
  db.close();
});

async function signup(loginId = "kobae_lab") {
  const r = await createTeacher(db, loginId, PASSWORD, T0);
  assert.ok(r.ok);
  return r;
}

/* ---------------- ハッシュ ---------------- */

test("パスワードは scrypt でソルト付きハッシュになり、照合できる", async () => {
  const h1 = await hashSecret(PASSWORD);
  const h2 = await hashSecret(PASSWORD);
  assert.match(h1, /^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
  assert.notEqual(h1, h2, "ソルトが毎回異なる");
  assert.ok(!h1.includes(PASSWORD));
  assert.equal(await verifySecret(PASSWORD, h1), true);
  assert.equal(await verifySecret(PASSWORD + "x", h1), false);
  assert.equal(await verifySecret(PASSWORD, "garbage"), false);
  assert.equal(await verifySecret(PASSWORD, "scrypt$99999999$8$1$AA$AA"), false);
});

/* ---------------- 入力ルール ---------------- */

test("ログイン ID とパスワードの入力ルール", () => {
  assert.equal(loginIdError("abc"), null);
  assert.equal(loginIdError("A-b_9".padEnd(40, "x")), null);
  assert.ok(loginIdError("ab"));
  assert.ok(loginIdError("a".repeat(41)));
  assert.ok(loginIdError("bad id"));
  assert.ok(loginIdError("日本語"));
  assert.ok(passwordError("123456789"));
  assert.equal(passwordError("1234567890"), null);
});

/* ---------------- 復元コード ---------------- */

test("復元コードは XXXX-XXXX-XXXX-XXXX 形式で、紛らわしい文字を含まない", () => {
  for (const ch of "0O1IL") assert.ok(!RECOVERY_CODE_ALPHABET.includes(ch));
  const codes = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const code = generateRecoveryCode();
    assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.doesNotMatch(code, /[0O1IL]/);
    assert.ok(isWellFormedRecoveryCode(normalizeRecoveryCode(code)));
    codes.add(code);
  }
  assert.equal(codes.size, 200);
  assert.equal(normalizeRecoveryCode(" abcd-efgh jkmn－PQRS "), "ABCDEFGHJKMNPQRS");
});

/* ---------------- アカウント作成・ログイン ---------------- */

test("アカウント作成：ハッシュだけを保存し、同じ ID（大文字小文字違い含む）は使えない", async () => {
  const r = await signup("Kobae");
  const row = db.prepare("SELECT * FROM teachers WHERE id = ?").get(r.teacherId) as Record<string, string>;
  assert.notEqual(row.password_hash, PASSWORD);
  assert.ok(!row.recovery_code_hash.includes(normalizeRecoveryCode(r.recoveryCode)));
  assert.equal(row.last_login_at, T0.toISOString());

  assert.equal(isLoginIdTaken(db, "kobae"), true);
  const dup = await createTeacher(db, "kobae", PASSWORD);
  assert.deepEqual(dup.ok ? null : dup.reason, "taken");
  assert.throws(
    () => db.prepare("INSERT INTO teachers (login_id, password_hash, recovery_code_hash) VALUES ('KOBAE','h','r')").run(),
    /UNIQUE/,
  );
  const bad = await createTeacher(db, "ok_id", "short");
  assert.equal(bad.ok ? null : bad.reason, "invalid_input");
});

test("正しいパスワードでログインでき、last_login_at が更新される", async () => {
  const { teacherId } = await signup();
  const r = await login(db, "kobae_lab", PASSWORD, minutes(10));
  assert.deepEqual(r, { ok: true, teacherId, loginId: "kobae_lab" });
  const { last_login_at } = db.prepare("SELECT last_login_at FROM teachers WHERE id = ?").get(teacherId) as {
    last_login_at: string;
  };
  assert.equal(last_login_at, minutes(10).toISOString());
});

/* ---------------- ロック ---------------- */

test("続けて 5 回間違えると 15 分ロックされ、正しいパスワードでも入れない", async () => {
  await signup();
  for (let i = 1; i <= 4; i++) {
    const r = await login(db, "kobae_lab", "wrong-password", minutes(i));
    assert.deepEqual(r, { ok: false, reason: "invalid", remaining: 5 - i });
  }
  const fifth = await login(db, "kobae_lab", "wrong-password", minutes(5));
  assert.equal(fifth.ok ? null : fifth.reason, "locked");

  const during = await login(db, "kobae_lab", PASSWORD, minutes(19));
  assert.equal(during.ok ? null : during.reason, "locked");

  // ロック解除後は入れて、回数もリセットされる
  const after = await login(db, "kobae_lab", PASSWORD, new Date(minutes(5).getTime() + LOCK_DURATION_MS));
  assert.equal(after.ok, true);
  const next = await login(db, "kobae_lab", "wrong-password", minutes(30));
  assert.deepEqual(next, { ok: false, reason: "invalid", remaining: 4 });
});

test("ログインに成功すると失敗回数は 0 に戻る", async () => {
  await signup();
  await login(db, "kobae_lab", "wrong-password", minutes(1));
  await login(db, "kobae_lab", "wrong-password", minutes(2));
  assert.equal((await login(db, "kobae_lab", PASSWORD, minutes(3))).ok, true);
  assert.deepEqual(await login(db, "kobae_lab", "wrong-password", minutes(4)), {
    ok: false,
    reason: "invalid",
    remaining: 4,
  });
});

test("復元コードの失敗もロック回数に数える", async () => {
  await signup();
  for (let i = 1; i <= 3; i++) await login(db, "kobae_lab", "wrong-password", minutes(i));
  const r1 = await resetPassword(db, "kobae_lab", "AAAA-AAAA-AAAA-AAAA", "new password 123", minutes(4));
  assert.deepEqual(r1, { ok: false, reason: "invalid", remaining: 1 });
  const r2 = await resetPassword(db, "kobae_lab", "not-a-code", "new password 123", minutes(5));
  assert.equal(r2.ok ? null : r2.reason, "locked");
  assert.equal((await login(db, "kobae_lab", PASSWORD, minutes(6))).ok, false);
});

test("存在しない ID でも同じ形の応答を返し、ID の有無を明かさない", async () => {
  await signup();
  for (let i = 1; i <= 4; i++) {
    assert.deepEqual(await login(db, "nobody", "wrong-password", minutes(i)), {
      ok: false,
      reason: "invalid",
      remaining: 5 - i,
    });
  }
  const fifth = await login(db, "nobody", "wrong-password", minutes(5));
  assert.equal(fifth.ok ? null : fifth.reason, "locked");
  // 実在するアカウントには影響しない
  assert.equal((await login(db, "kobae_lab", PASSWORD, minutes(6))).ok, true);
});

/* ---------------- 復元コード（1 回限り） ---------------- */

test("復元コードで再設定でき、同じコードは 2 回使えない。新しいコードが発行される", async () => {
  const { teacherId, recoveryCode } = await signup();
  const { token } = createSession(db, teacherId, T0);

  // 小文字・ハイフンなしでも受け付ける
  const typed = recoveryCode.replaceAll("-", "").toLowerCase();
  const r = await resetPassword(db, "KOBAE_LAB", typed, "new password 123", minutes(1));
  assert.ok(r.ok);
  assert.notEqual(r.recoveryCode, recoveryCode);
  assert.match(r.recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

  // 古いパスワードは使えず、新しいパスワードで入れる
  assert.equal((await login(db, "kobae_lab", PASSWORD, minutes(2))).ok, false);
  assert.equal((await login(db, "kobae_lab", "new password 123", minutes(3))).ok, true);

  // 使った復元コードは無効
  const again = await resetPassword(db, "kobae_lab", recoveryCode, "another password", minutes(4));
  assert.deepEqual(again, { ok: false, reason: "invalid", remaining: 4 });

  // 新しい復元コードは使える
  const third = await resetPassword(db, "kobae_lab", r.recoveryCode, "another password", minutes(5));
  assert.equal(third.ok, true);

  // 再設定で既存のセッションは無効になる
  assert.equal(getSession(db, token, minutes(6)), null);
});

test("同じ復元コードを同時に使っても成功は 1 回だけ", async () => {
  const { recoveryCode } = await signup();
  const results = await Promise.all([
    resetPassword(db, "kobae_lab", recoveryCode, "parallel pass 1", minutes(1)),
    resetPassword(db, "kobae_lab", recoveryCode, "parallel pass 2", minutes(1)),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
});

/* ---------------- セッション ---------------- */

test("セッションの作成・取得・ログアウト", async () => {
  const { teacherId } = await signup();
  const { token, expiresAt } = createSession(db, teacherId, T0);
  assert.equal(expiresAt.getTime(), T0.getTime() + SESSION_TTL_MS);

  const stored = db.prepare("SELECT token_hash FROM teacher_sessions").get() as { token_hash: string };
  assert.notEqual(stored.token_hash, token, "トークンそのものは保存しない");

  assert.deepEqual(getSession(db, token, minutes(1)), {
    sessionId: 1,
    teacherId,
    loginId: "kobae_lab",
  });
  assert.equal(getSession(db, "unknown-token", minutes(1)), null);

  destroySession(db, token);
  assert.equal(getSession(db, token, minutes(2)), null);
});

test("期限切れのセッションは使えない", async () => {
  const { teacherId } = await signup();
  const { token } = createSession(db, teacherId, T0);
  assert.equal(getSession(db, token, new Date(T0.getTime() + SESSION_TTL_MS)), null);
  const { n } = db.prepare("SELECT count(*) AS n FROM teacher_sessions").get() as { n: number };
  assert.equal(n, 0);
});

test("アカウントを削除するとセッションも消える", async () => {
  const { teacherId } = await signup();
  const { token } = createSession(db, teacherId, T0);
  db.prepare("DELETE FROM teachers WHERE id = ?").run(teacherId);
  assert.equal(getSession(db, token, minutes(1)), null);
});

test("Cookie の署名：改ざん・別の秘密鍵では検証に失敗する", () => {
  const secret = "s".repeat(48);
  const value = signSessionToken("token-abc", secret);
  assert.equal(unsignSessionToken(value, secret), "token-abc");
  assert.equal(unsignSessionToken(value, "t".repeat(48)), null);
  assert.equal(unsignSessionToken(value.replace("token-abc", "token-abd"), secret), null);
  assert.equal(unsignSessionToken("no-signature", secret), null);
  assert.equal(unsignSessionToken(value + "x", secret), null);
});

/* ---------------- レート制限 ---------------- */

test("IP ごとのレート制限", () => {
  const limiter = new RateLimiter({ limit: 3, windowMs: 1000 });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.consume("1.2.3.4", 0)), [true, true, true, false]);
  assert.equal(limiter.consume("5.6.7.8", 0), true, "別の IP は別枠");
  assert.equal(limiter.consume("1.2.3.4", 1000), true, "時間がたてば戻る");
});
