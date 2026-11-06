import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db/index.ts";
import { createTeacher, login, resetPassword } from "../src/lib/auth/teachers.ts";
import { createSession, getSession } from "../src/lib/auth/sessions.ts";
import { changePassword, deleteAccount, purgeInactiveTeachers, reissueRecoveryCode } from "../src/lib/auth/account.ts";

const PASSWORD = "correct horse battery";
let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
});
afterEach(() => db.close());

async function makeTeacher(loginId = "teacher1") {
  const r = await createTeacher(db, loginId, PASSWORD);
  assert.ok(r.ok);
  return r;
}

test("パスワード変更：今のパスワードが必要で、ほかの端末はログアウトされる", async () => {
  const t = await makeTeacher();
  const here = createSession(db, t.teacherId);
  const other = createSession(db, t.teacherId);
  const hereId = getSession(db, here.token)!.sessionId;
  assert.deepEqual(await changePassword(db, t.teacherId, "wrong password!", "new password 123", hereId), {
    ok: false,
    message: "今のパスワードが違います。",
  });
  assert.equal((await changePassword(db, t.teacherId, PASSWORD, "short", hereId)).ok, false);
  assert.equal((await changePassword(db, t.teacherId, PASSWORD, PASSWORD, hereId)).ok, false, "同じパスワードは不可");
  assert.deepEqual(await changePassword(db, t.teacherId, PASSWORD, "new password 123", hereId), { ok: true });
  assert.ok(getSession(db, here.token), "今の端末は残る");
  assert.equal(getSession(db, other.token), null, "ほかの端末はログアウト");
  assert.equal((await login(db, "teacher1", PASSWORD)).ok, false);
  assert.equal((await login(db, "teacher1", "new password 123")).ok, true);
});

test("復元コードの再発行：前のコードは使えなくなる", async () => {
  const t = await makeTeacher();
  assert.equal((await reissueRecoveryCode(db, t.teacherId, "wrong password!")).ok, false);
  const r = await reissueRecoveryCode(db, t.teacherId, PASSWORD);
  assert.ok(r.ok);
  assert.equal((await resetPassword(db, "teacher1", t.recoveryCode, "another pass 1")).ok, false, "古いコード");
  assert.equal((await resetPassword(db, "teacher1", r.recoveryCode, "another pass 1")).ok, true, "新しいコード");
});

test("アカウント削除：パスワードが必要で、教室・講義もすべて消える", async () => {
  const t = await makeTeacher();
  db.prepare("INSERT INTO classrooms (owner_teacher_id, name) VALUES (?, '301')").run(t.teacherId);
  assert.equal((await deleteAccount(db, t.teacherId, "wrong password!")).ok, false);
  assert.deepEqual(await deleteAccount(db, t.teacherId, PASSWORD), { ok: true });
  assert.equal((db.prepare("SELECT count(*) AS n FROM classrooms").get() as { n: number }).n, 0);
  assert.equal((await login(db, "teacher1", PASSWORD)).ok, false);
});

test("最後のログインから 2 年（730 日）たったアカウントを自動削除する", async () => {
  const old = await makeTeacher("old_teacher");
  const recent = await makeTeacher("recent_teacher");
  const never = await makeTeacher("never_logged");
  const now = new Date("2028-12-01T00:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;
  db.prepare("UPDATE teachers SET last_login_at = ? WHERE id = ?").run(new Date(now.getTime() - 731 * day).toISOString(), old.teacherId);
  db.prepare("UPDATE teachers SET last_login_at = ? WHERE id = ?").run(new Date(now.getTime() - 729 * day).toISOString(), recent.teacherId);
  db.prepare("UPDATE teachers SET last_login_at = NULL, created_at = ? WHERE id = ?").run(new Date(now.getTime() - 800 * day).toISOString(), never.teacherId);
  assert.equal(purgeInactiveTeachers(db, now), 2);
  const left = (db.prepare("SELECT login_id FROM teachers").all() as { login_id: string }[]).map((r) => r.login_id);
  assert.deepEqual(left, ["recent_teacher"]);
  assert.equal(purgeInactiveTeachers(db, now), 0, "2 回目は何もしない");
});
