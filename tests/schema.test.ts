import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, migrate, resolveDbPath, type Db } from "../src/lib/db/index.ts";
import { migrations } from "../src/lib/db/migrations.ts";

let db: Db;

beforeEach(() => {
  db = openDatabase(":memory:");
});

afterEach(() => {
  db.close();
});

function seed() {
  const teacherId = db
    .prepare("INSERT INTO teachers (login_id, password_hash, recovery_code_hash) VALUES (?, ?, ?)")
    .run("kobae_lab-01", "hash", "rhash").lastInsertRowid;
  const classroomId = db
    .prepare("INSERT INTO classrooms (owner_teacher_id, name) VALUES (?, ?)")
    .run(teacherId, "301 教室").lastInsertRowid;
  const lectureId = db
    .prepare(
      "INSERT INTO lectures (owner_teacher_id, classroom_id, name, enrolled_count, public_token) VALUES (?, ?, ?, ?, ?)",
    )
    .run(teacherId, classroomId, "情報リテラシー", 3, "tok-1").lastInsertRowid;
  const groupId = db
    .prepare("INSERT INTO lecture_groups (lecture_id, name, sort_order) VALUES (?, ?, ?)")
    .run(lectureId, "A", 1).lastInsertRowid;
  const insertSeat = db.prepare(
    "INSERT INTO lecture_seats (lecture_id, seat_number, group_id, status) VALUES (?, ?, ?, ?)",
  );
  const seat1 = insertSeat.run(lectureId, 1, groupId, "used").lastInsertRowid;
  const seat2 = insertSeat.run(lectureId, 2, groupId, "used").lastInsertRowid;
  return { teacherId, classroomId, lectureId, groupId, seat1, seat2 };
}

const insertDraw = (lectureId: number | bigint, seatId: number | bigint, deviceId: string | null) =>
  db
    .prepare("INSERT INTO draws (lecture_id, seat_id, device_id, drawn_by) VALUES (?, ?, ?, ?)")
    .run(lectureId, seatId, deviceId, deviceId ? "student" : "proxy");

test("マイグレーションが最新バージョンまで適用され、再実行しても変わらない", () => {
  const latest = migrations[migrations.length - 1].version;
  assert.equal(db.pragma("user_version", { simple: true }), latest);
  assert.equal(migrate(db), latest);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  for (const t of ["teachers", "classrooms", "lectures", "lecture_groups", "lecture_seats", "draws"]) {
    assert.ok(tables.includes(t), `${t} テーブルがある`);
  }
  assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
});

test("ログイン ID は 3〜40 文字の英数字・_・- のみ", () => {
  const ins = db.prepare(
    "INSERT INTO teachers (login_id, password_hash, recovery_code_hash) VALUES (?, 'h', 'r')",
  );
  assert.doesNotThrow(() => ins.run("abc"));
  assert.throws(() => ins.run("ab"), /CHECK/);
  assert.throws(() => ins.run("a".repeat(41)), /CHECK/);
  assert.throws(() => ins.run("bad id"), /CHECK/);
  assert.throws(() => ins.run("日本語id"), /CHECK/);
  assert.throws(() => ins.run("abc"), /UNIQUE/);
});

test("同じ座席は二重に割り当てられない", () => {
  const s = seed();
  insertDraw(s.lectureId, s.seat1, "device-a");
  assert.throws(() => insertDraw(s.lectureId, s.seat1, "device-b"), /UNIQUE/);
});

test("1 端末は 1 講義で 1 座席のみ", () => {
  const s = seed();
  insertDraw(s.lectureId, s.seat1, "device-a");
  assert.throws(() => insertDraw(s.lectureId, s.seat2, "device-a"), /UNIQUE/);
});

test("取消済みの抽選は座席・端末の重複判定から外れる", () => {
  const s = seed();
  const { lastInsertRowid } = insertDraw(s.lectureId, s.seat1, "device-a");
  db.prepare("UPDATE draws SET cancelled = 1 WHERE id = ?").run(lastInsertRowid);
  assert.doesNotThrow(() => insertDraw(s.lectureId, s.seat1, "device-b"));
  assert.doesNotThrow(() => insertDraw(s.lectureId, s.seat2, "device-a"));
});

test("代理抽選は端末 ID なしで登録でき、学生抽選は端末 ID が必須", () => {
  const s = seed();
  assert.doesNotThrow(() => insertDraw(s.lectureId, s.seat1, null));
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO draws (lecture_id, seat_id, device_id, drawn_by) VALUES (?, ?, NULL, 'student')")
        .run(s.lectureId, s.seat2),
    /CHECK/,
  );
});

test("他の講義の座席には抽選を登録できない", () => {
  const s = seed();
  const other = db
    .prepare(
      "INSERT INTO lectures (owner_teacher_id, classroom_id, name, public_token) VALUES (?, ?, '別講義', 'tok-2')",
    )
    .run(s.teacherId, s.classroomId).lastInsertRowid;
  assert.throws(() => insertDraw(other, s.seat1, "device-a"), /FOREIGN KEY/);
});

test("受付状態・JSON 列の制約", () => {
  const s = seed();
  assert.throws(
    () => db.prepare("UPDATE lectures SET accept_state = 'paused' WHERE id = ?").run(s.lectureId),
    /CHECK/,
  );
  assert.throws(
    () => db.prepare("UPDATE lectures SET tags_json = '{\"a\":1}' WHERE id = ?").run(s.lectureId),
    /CHECK/,
  );
  assert.throws(
    () => db.prepare("UPDATE classrooms SET layout_json = 'not json' WHERE id = ?").run(s.classroomId),
    /CHECK/,
  );
  assert.throws(
    () => db.prepare("UPDATE lectures SET enrolled_count = 151 WHERE id = ?").run(s.lectureId),
    /CHECK/,
  );
});

test("教員を削除すると教室・講義・抽選結果もまとめて削除される", () => {
  const s = seed();
  insertDraw(s.lectureId, s.seat1, "device-a");
  db.prepare("DELETE FROM teachers WHERE id = ?").run(s.teacherId);
  for (const t of ["classrooms", "lectures", "lecture_groups", "lecture_seats", "draws"]) {
    const { n } = db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number };
    assert.equal(n, 0, `${t} が空になる`);
  }
});

test("SEAT_ASSIGN_DB_PATH で DB ファイルの場所を指定できる", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seat-assign-"));
  const file = path.join(dir, "nested", "test.db");
  try {
    assert.equal(resolveDbPath({ SEAT_ASSIGN_DB_PATH: file }), file);
    const fileDb = openDatabase(resolveDbPath({ SEAT_ASSIGN_DB_PATH: file }));
    assert.equal(fileDb.pragma("journal_mode", { simple: true }), "wal");
    fileDb.close();
    assert.ok(fs.existsSync(file));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
