import crypto from "node:crypto";
import type { Db } from "../db/index.ts";
import { parseLayout, planLecture, type ClassroomLayout, type GroupMode } from "./layout.ts";

export type AcceptState = "before" | "open" | "closed";

export const STATE_LABEL: Record<AcceptState, string> = {
  before: "受付前",
  open: "受付中",
  closed: "受付終了",
};

export type LectureSummary = {
  id: number;
  name: string;
  lectureDate: string | null;
  enrolledCount: number;
  acceptState: AcceptState;
  classroomName: string;
  drawnCount: number;
};

export type SeatInfo = {
  id: number;
  number: number;
  status: "used" | "spare";
  groupId: number | null;
  groupName: string | null;
  groupColor: string | null;
};

export type Lecture = {
  id: number;
  name: string;
  lectureDate: string | null;
  enrolledCount: number;
  messageJa: string;
  acceptState: AcceptState;
  publicToken: string;
  classroomName: string;
  layout: ClassroomLayout;
  seats: SeatInfo[];
  groups: { id: number; name: string; color: string }[];
};

export const ENROLLED_MAX = 150;
export const MESSAGE_MAX = 500;

/** QR に載せる公開トークン（推測困難・URL に安全な 16 文字） */
export function generatePublicToken(): string {
  return crypto.randomBytes(12).toString("base64url");
}

export function listLectures(db: Db, teacherId: number): LectureSummary[] {
  return db
    .prepare(
      `SELECT l.id, l.name, l.lecture_date AS lectureDate, l.enrolled_count AS enrolledCount,
              l.accept_state AS acceptState, c.name AS classroomName,
              (SELECT count(*) FROM draws d WHERE d.lecture_id = l.id AND d.cancelled = 0) AS drawnCount
         FROM lectures l JOIN classrooms c ON c.id = l.classroom_id
        WHERE l.owner_teacher_id = ? AND l.archived = 0
        ORDER BY COALESCE(l.lecture_date, '') DESC, l.id DESC`,
    )
    .all(teacherId) as LectureSummary[];
}

export type CreateLectureInput = {
  classroomId: number;
  name: string;
  lectureDate: string | null;
  enrolledCount: number;
  messageJa: string;
  groupMode: GroupMode;
};

export function createLecture(db: Db, teacherId: number, input: CreateLectureInput): number | null {
  const classroom = db
    .prepare("SELECT layout_json FROM classrooms WHERE id = ? AND owner_teacher_id = ?")
    .get(input.classroomId, teacherId) as { layout_json: string } | undefined;
  if (!classroom) return null;
  const layout = parseLayout(classroom.layout_json);
  if (!layout || layout.seats.length === 0) return null;
  const plan = planLecture(layout, input.enrolledCount, input.groupMode);

  return db.transaction(() => {
    const lectureId = Number(
      db
        .prepare(
          `INSERT INTO lectures (owner_teacher_id, classroom_id, name, lecture_date, enrolled_count,
                                 message_ja, public_token, layout_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          teacherId,
          input.classroomId,
          input.name,
          input.lectureDate,
          input.enrolledCount,
          input.messageJa,
          generatePublicToken(),
          JSON.stringify(layout),
        ).lastInsertRowid,
    );
    const insertGroup = db.prepare(
      "INSERT INTO lecture_groups (lecture_id, name, color, sort_order) VALUES (?, ?, ?, ?)",
    );
    const groupIds = plan.groups.map((g) =>
      Number(insertGroup.run(lectureId, g.name, g.color, g.order).lastInsertRowid),
    );
    const insertSeat = db.prepare(
      "INSERT INTO lecture_seats (lecture_id, seat_number, group_id, status) VALUES (?, ?, ?, ?)",
    );
    for (const s of plan.seats) {
      insertSeat.run(lectureId, s.number, s.groupIndex === null ? null : groupIds[s.groupIndex], s.status);
    }
    return lectureId;
  })();
}

type LectureRow = {
  id: number;
  name: string;
  lecture_date: string | null;
  enrolled_count: number;
  message_ja: string;
  accept_state: AcceptState;
  public_token: string;
  layout_json: string;
  classroom_name: string;
};

function loadLecture(db: Db, row: LectureRow | undefined): Lecture | null {
  if (!row) return null;
  const layout = parseLayout(row.layout_json);
  if (!layout) return null;
  const seats = db
    .prepare(
      `SELECT s.id, s.seat_number AS number, s.status, s.group_id AS groupId,
              g.name AS groupName, g.color AS groupColor
         FROM lecture_seats s LEFT JOIN lecture_groups g ON g.id = s.group_id
        WHERE s.lecture_id = ? ORDER BY s.seat_number`,
    )
    .all(row.id) as SeatInfo[];
  const groups = db
    .prepare("SELECT id, name, color FROM lecture_groups WHERE lecture_id = ? ORDER BY sort_order, id")
    .all(row.id) as Lecture["groups"];
  return {
    id: row.id,
    name: row.name,
    lectureDate: row.lecture_date,
    enrolledCount: row.enrolled_count,
    messageJa: row.message_ja,
    acceptState: row.accept_state,
    publicToken: row.public_token,
    classroomName: row.classroom_name,
    layout,
    seats,
    groups,
  };
}

const LECTURE_SELECT = `
  SELECT l.id, l.name, l.lecture_date, l.enrolled_count, l.message_ja, l.accept_state,
         l.public_token, l.layout_json, c.name AS classroom_name
    FROM lectures l JOIN classrooms c ON c.id = l.classroom_id`;

export function getLecture(db: Db, teacherId: number, id: number): Lecture | null {
  return loadLecture(
    db,
    db.prepare(`${LECTURE_SELECT} WHERE l.id = ? AND l.owner_teacher_id = ?`).get(id, teacherId) as
      | LectureRow
      | undefined,
  );
}

export function getLectureByToken(db: Db, token: string): Lecture | null {
  return loadLecture(
    db,
    db.prepare(`${LECTURE_SELECT} WHERE l.public_token = ? AND l.archived = 0`).get(token) as
      | LectureRow
      | undefined,
  );
}

export function setAcceptState(db: Db, teacherId: number, id: number, state: AcceptState): boolean {
  return (
    db
      .prepare(
        `UPDATE lectures SET accept_state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND owner_teacher_id = ?`,
      )
      .run(state, id, teacherId).changes > 0
  );
}

/** 講義を削除する（抽選結果も消える） */
export function deleteLecture(db: Db, teacherId: number, id: number): boolean {
  return db.prepare("DELETE FROM lectures WHERE id = ? AND owner_teacher_id = ?").run(id, teacherId).changes > 0;
}
