import type { Db } from "../db/index.ts";
import { parseLayout, type ClassroomLayout } from "./layout.ts";

export type ClassroomSummary = { id: number; name: string; seatCount: number; updatedAt: string };
export type Classroom = { id: number; name: string; layout: ClassroomLayout };

export const CLASSROOM_NAME_MAX = 100;

export function classroomNameError(name: string): string | null {
  if (!name) return "教室名を入力してください。";
  if (name.length > CLASSROOM_NAME_MAX) return `教室名は ${CLASSROOM_NAME_MAX} 文字以内にしてください。`;
  return null;
}

export function listClassrooms(db: Db, teacherId: number): ClassroomSummary[] {
  return db
    .prepare(
      `SELECT id, name, json_array_length(layout_json, '$.seats') AS seatCount, updated_at AS updatedAt
         FROM classrooms WHERE owner_teacher_id = ? ORDER BY updated_at DESC`,
    )
    .all(teacherId) as ClassroomSummary[];
}

export function getClassroom(db: Db, teacherId: number, id: number): Classroom | null {
  const row = db
    .prepare("SELECT id, name, layout_json FROM classrooms WHERE id = ? AND owner_teacher_id = ?")
    .get(id, teacherId) as { id: number; name: string; layout_json: string } | undefined;
  if (!row) return null;
  const layout = parseLayout(row.layout_json);
  if (!layout) return null;
  return { id: row.id, name: row.name, layout };
}

export function saveClassroom(
  db: Db,
  teacherId: number,
  input: { id?: number; name: string; layout: ClassroomLayout },
): number | null {
  const json = JSON.stringify(input.layout);
  if (input.id) {
    const res = db
      .prepare(
        `UPDATE classrooms SET name = ?, layout_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND owner_teacher_id = ?`,
      )
      .run(input.name, json, input.id, teacherId);
    return res.changes ? input.id : null;
  }
  return Number(
    db
      .prepare("INSERT INTO classrooms (owner_teacher_id, name, layout_json) VALUES (?, ?, ?)")
      .run(teacherId, input.name, json).lastInsertRowid,
  );
}

/** 講義で使われていない教室だけ削除できる */
export function deleteClassroom(db: Db, teacherId: number, id: number): "deleted" | "in_use" | "not_found" {
  const used = db.prepare("SELECT 1 FROM lectures WHERE classroom_id = ? LIMIT 1").get(id);
  if (used) return "in_use";
  const res = db.prepare("DELETE FROM classrooms WHERE id = ? AND owner_teacher_id = ?").run(id, teacherId);
  return res.changes ? "deleted" : "not_found";
}
