import type { Db } from "../db/index.ts";
import { assignGroups, GROUP_COLORS, groupName, parseLayout, type GroupMode } from "./layout.ts";

/**
 * 講義のグループ（作成後の追加・名前と色の変更・削除・席の割り当て・作り直し）。
 * どれも講義の持ち主の講師だけができる。席の「使用／予備」は変えない。
 */

export const GROUP_NAME_MAX = 50;
export const GROUP_MAX = 50;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type GroupResult = { ok: true } | { ok: false; error: string };

function owns(db: Db, teacherId: number, lectureId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM lectures WHERE id = ? AND owner_teacher_id = ?").get(lectureId, teacherId));
}

function groupBelongs(db: Db, lectureId: number, groupId: number): boolean {
  return Boolean(db.prepare("SELECT 1 FROM lecture_groups WHERE id = ? AND lecture_id = ?").get(groupId, lectureId));
}

export function groupNameError(name: string): string | null {
  if (!name) return "グループ名を入力してください。";
  if (name.length > GROUP_NAME_MAX) return `グループ名は ${GROUP_NAME_MAX} 文字以内にしてください。`;
  return null;
}

/** グループを追加する（名前・色は空いているものを自動で付ける）。新しいグループの ID */
export function addGroup(db: Db, teacherId: number, lectureId: number): number | null {
  if (!owns(db, teacherId, lectureId)) return null;
  const rows = db
    .prepare("SELECT name, color, sort_order FROM lecture_groups WHERE lecture_id = ?")
    .all(lectureId) as { name: string; color: string; sort_order: number }[];
  if (rows.length >= GROUP_MAX) return null;
  const names = new Set(rows.map((r) => r.name));
  let i = 0;
  while (names.has(groupName(i))) i++;
  const colors = new Set(rows.map((r) => r.color.toLowerCase()));
  const color = GROUP_COLORS.find((c) => !colors.has(c.toLowerCase())) ?? GROUP_COLORS[rows.length % GROUP_COLORS.length];
  const order = rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  return Number(
    db
      .prepare("INSERT INTO lecture_groups (lecture_id, name, color, sort_order) VALUES (?, ?, ?, ?)")
      .run(lectureId, groupName(i), color, order).lastInsertRowid,
  );
}

export function updateGroup(
  db: Db,
  teacherId: number,
  lectureId: number,
  groupId: number,
  input: { name: string; color: string },
): GroupResult {
  if (!owns(db, teacherId, lectureId) || !groupBelongs(db, lectureId, groupId)) {
    return { ok: false, error: "グループが見つかりません。" };
  }
  const name = input.name.trim();
  const nameError = groupNameError(name);
  if (nameError) return { ok: false, error: nameError };
  if (!COLOR_PATTERN.test(input.color)) return { ok: false, error: "色の指定が正しくありません。" };
  db.prepare("UPDATE lecture_groups SET name = ?, color = ? WHERE id = ?").run(name, input.color, groupId);
  return { ok: true };
}

/** グループを削除する。そのグループだった席は「グループなし」になる */
export function deleteGroup(db: Db, teacherId: number, lectureId: number, groupId: number): boolean {
  if (!owns(db, teacherId, lectureId) || !groupBelongs(db, lectureId, groupId)) return false;
  db.transaction(() => {
    db.prepare("UPDATE lecture_seats SET group_id = NULL WHERE lecture_id = ? AND group_id = ?").run(lectureId, groupId);
    db.prepare("DELETE FROM lecture_groups WHERE id = ?").run(groupId);
  })();
  return true;
}

/** 席をグループに入れる（groupId = null でグループなし）。変えた席の数 */
export function assignSeatsToGroup(
  db: Db,
  teacherId: number,
  lectureId: number,
  seatNumbers: number[],
  groupId: number | null,
): number {
  if (!owns(db, teacherId, lectureId)) return 0;
  if (groupId !== null && !groupBelongs(db, lectureId, groupId)) return 0;
  const stmt = db.prepare("UPDATE lecture_seats SET group_id = ? WHERE lecture_id = ? AND seat_number = ?");
  return db.transaction(() =>
    seatNumbers.filter((n) => Number.isInteger(n)).reduce((sum, n) => sum + stmt.run(groupId, lectureId, n).changes, 0),
  )();
}

/** グループをすべて作り直す（島ごと／席番号順に N 個／なし）。使用席・予備席はそのまま */
export function regroupLecture(db: Db, teacherId: number, lectureId: number, mode: GroupMode): GroupResult {
  const row = db
    .prepare("SELECT layout_json FROM lectures WHERE id = ? AND owner_teacher_id = ?")
    .get(lectureId, teacherId) as { layout_json: string } | undefined;
  const layout = row ? parseLayout(row.layout_json) : null;
  if (!layout) return { ok: false, error: "講義が見つかりません。" };
  const used = new Set(
    (
      db.prepare("SELECT seat_number FROM lecture_seats WHERE lecture_id = ? AND status = 'used'").all(lectureId) as {
        seat_number: number;
      }[]
    ).map((r) => r.seat_number),
  );
  const { groups, groupOf } = assignGroups(layout, used, mode);
  db.transaction(() => {
    db.prepare("UPDATE lecture_seats SET group_id = NULL WHERE lecture_id = ?").run(lectureId);
    db.prepare("DELETE FROM lecture_groups WHERE lecture_id = ?").run(lectureId);
    const insert = db.prepare("INSERT INTO lecture_groups (lecture_id, name, color, sort_order) VALUES (?, ?, ?, ?)");
    const ids = groups.map((g) => Number(insert.run(lectureId, g.name, g.color, g.order).lastInsertRowid));
    const setGroup = db.prepare("UPDATE lecture_seats SET group_id = ? WHERE lecture_id = ? AND seat_number = ?");
    for (const [n, gi] of groupOf) setGroup.run(ids[gi], lectureId, n);
  })();
  return { ok: true };
}
