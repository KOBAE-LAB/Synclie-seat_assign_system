import type { Db } from "../db/index.ts";
import { parseLayout, type ClassroomLayout } from "./layout.ts";
import { generateTtCode, normalizeTtCode } from "./lectures.ts";

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

// ---------- 共有コード（ほかの講師が教室レイアウトをコピーできる） ----------

export function getShareCode(db: Db, teacherId: number, id: number): string | null {
  const row = db
    .prepare("SELECT share_code FROM classrooms WHERE id = ? AND owner_teacher_id = ?")
    .get(id, teacherId) as { share_code: string | null } | undefined;
  return row?.share_code ?? null;
}

/** 共有コードを発行（再発行で前のコードは使えなくなる） */
export function issueShareCode(db: Db, teacherId: number, id: number): string | null {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateTtCode();
    try {
      const res = db
        .prepare("UPDATE classrooms SET share_code = ? WHERE id = ? AND owner_teacher_id = ?")
        .run(code, id, teacherId);
      return res.changes ? code : null;
    } catch (e) {
      if (!(e instanceof Error && /UNIQUE/.test(e.message))) throw e;
    }
  }
  return null;
}

export function revokeShareCode(db: Db, teacherId: number, id: number): boolean {
  return (
    db.prepare("UPDATE classrooms SET share_code = NULL WHERE id = ? AND owner_teacher_id = ?").run(id, teacherId)
      .changes > 0
  );
}

/** 共有コードの教室を自分の教室としてコピーする。新しい教室の ID（コードが違えば null） */
export function copyClassroomByShareCode(db: Db, teacherId: number, input: string): number | null {
  const code = normalizeTtCode(input);
  if (!code) return null;
  const src = db
    .prepare("SELECT name, layout_json FROM classrooms WHERE share_code = ?")
    .get(code) as { name: string; layout_json: string } | undefined;
  if (!src) return null;
  const layout = parseLayout(src.layout_json);
  if (!layout) return null;
  const name = `${src.name}（コピー）`.slice(0, CLASSROOM_NAME_MAX);
  return saveClassroom(db, teacherId, { name, layout });
}
