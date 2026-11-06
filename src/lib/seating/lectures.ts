import crypto from "node:crypto";
import type { Db } from "../db/index.ts";
import { parseLayout, planLecture, type ClassroomLayout, type GroupMode, type SeatFill } from "./layout.ts";

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
  folder: string;
  tags: string[];
  archived: boolean;
};

export type LectureFilter = { folder?: string; tag?: string; q?: string; archived?: boolean };

export const FOLDER_MAX = 50;
export const TAG_MAX = 20;
export const TAGS_PER_LECTURE = 10;
export const MEMO_MAX = 2000;

/** 「数学, 1年 、前期」→ ["数学", "1年", "前期"]（重複・空を除く） */
export function parseTags(input: string): string[] {
  const tags = input
    .split(/[,、，\s]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .map((t) => t.slice(0, TAG_MAX));
  return [...new Set(tags)].slice(0, TAGS_PER_LECTURE);
}

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
  messageFurigana: string;
  messageEn: string;
  memo: string;
  folder: string;
  tags: string[];
  archived: boolean;
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

export function listLectures(db: Db, teacherId: number, filter: LectureFilter = {}): LectureSummary[] {
  const where = ["l.owner_teacher_id = ?", "l.archived = ?"];
  const args: (string | number)[] = [teacherId, filter.archived ? 1 : 0];
  if (filter.folder !== undefined) {
    where.push("l.folder = ?");
    args.push(filter.folder);
  }
  if (filter.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(l.tags_json) WHERE value = ?)");
    args.push(filter.tag);
  }
  if (filter.q) {
    where.push("(l.name LIKE ? ESCAPE '\\' OR l.memo LIKE ? ESCAPE '\\')");
    const like = `%${filter.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    args.push(like, like);
  }
  const rows = db
    .prepare(
      `SELECT l.id, l.name, l.lecture_date AS lectureDate, l.enrolled_count AS enrolledCount,
              l.accept_state AS acceptState, c.name AS classroomName, l.folder, l.tags_json, l.archived,
              (SELECT count(*) FROM draws d WHERE d.lecture_id = l.id AND d.cancelled = 0) AS drawnCount
         FROM lectures l JOIN classrooms c ON c.id = l.classroom_id
        WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(l.lecture_date, '') DESC, l.id DESC`,
    )
    .all(...args) as (Omit<LectureSummary, "tags" | "archived"> & { tags_json: string; archived: number })[];
  return rows.map(({ tags_json, archived, ...r }) => ({ ...r, tags: JSON.parse(tags_json) as string[], archived: archived === 1 }));
}

/** 講師が使っているフォルダとタグの一覧（絞り込み用） */
export function listFoldersAndTags(db: Db, teacherId: number): { folders: string[]; tags: string[] } {
  const folders = (
    db
      .prepare("SELECT DISTINCT folder FROM lectures WHERE owner_teacher_id = ? AND folder <> '' ORDER BY folder")
      .all(teacherId) as { folder: string }[]
  ).map((r) => r.folder);
  const tags = (
    db
      .prepare(
        `SELECT DISTINCT j.value AS tag FROM lectures l, json_each(l.tags_json) j
          WHERE l.owner_teacher_id = ? ORDER BY tag`,
      )
      .all(teacherId) as { tag: string }[]
  ).map((r) => r.tag);
  return { folders, tags };
}

/** メモ・フォルダ・タグを更新する */
export function updateLectureOrganize(
  db: Db,
  teacherId: number,
  id: number,
  input: { memo: string; folder: string; tags: string[] },
): boolean {
  return (
    db
      .prepare(
        `UPDATE lectures SET memo = ?, folder = ?, tags_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND owner_teacher_id = ?`,
      )
      .run(input.memo, input.folder, JSON.stringify(input.tags), id, teacherId).changes > 0
  );
}

/** アーカイブ（一覧から外し、学生の QR も使えなくする）／戻す */
export function setArchived(db: Db, teacherId: number, id: number, archived: boolean): boolean {
  return (
    db
      .prepare(
        `UPDATE lectures SET archived = ?, accept_state = CASE WHEN ? = 1 THEN 'closed' ELSE accept_state END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND owner_teacher_id = ?`,
      )
      .run(archived ? 1 : 0, archived ? 1 : 0, id, teacherId).changes > 0
  );
}

export type CreateLectureInput = {
  classroomId: number;
  name: string;
  lectureDate: string | null;
  enrolledCount: number;
  messageJa: string;
  messageFurigana?: string;
  messageEn?: string;
  groupMode: GroupMode;
  /** 使用席の選び方（省略時は全体に均等） */
  seatFill?: SeatFill;
  /** 前から何列を使わない（予備席にする）か */
  skipFrontRows?: number;
  /** 予備席はグループなしにする */
  spareNoGroup?: boolean;
};

export function createLecture(db: Db, teacherId: number, input: CreateLectureInput): number | null {
  const classroom = db
    .prepare("SELECT layout_json FROM classrooms WHERE id = ? AND owner_teacher_id = ?")
    .get(input.classroomId, teacherId) as { layout_json: string } | undefined;
  if (!classroom) return null;
  const layout = parseLayout(classroom.layout_json);
  if (!layout || layout.seats.length === 0) return null;
  const plan = planLecture(layout, input.enrolledCount, input.groupMode, input.seatFill ?? "even", {
    skipFrontRows: input.skipFrontRows ?? 0,
    spareNoGroup: input.spareNoGroup ?? false,
  });

  return db.transaction(() => {
    const lectureId = Number(
      db
        .prepare(
          `INSERT INTO lectures (owner_teacher_id, classroom_id, name, lecture_date, enrolled_count,
                                 message_ja, message_furigana, message_en, public_token, layout_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          teacherId,
          input.classroomId,
          input.name,
          input.lectureDate,
          input.enrolledCount,
          input.messageJa,
          input.messageFurigana ?? "",
          input.messageEn ?? "",
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
  message_furigana: string;
  message_en: string;
  memo: string;
  folder: string;
  tags_json: string;
  archived: number;
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
    messageFurigana: row.message_furigana,
    messageEn: row.message_en,
    memo: row.memo,
    folder: row.folder,
    tags: JSON.parse(row.tags_json) as string[],
    archived: row.archived === 1,
    acceptState: row.accept_state,
    publicToken: row.public_token,
    classroomName: row.classroom_name,
    layout,
    seats,
    groups,
  };
}

const LECTURE_SELECT = `
  SELECT l.id, l.name, l.lecture_date, l.enrolled_count, l.message_ja, l.message_furigana, l.message_en, l.memo, l.folder, l.tags_json, l.archived, l.accept_state,
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

/** 講義の席を「使用」⇔「予備」に切り替える。切り替え後の状態を返す（見つからなければ null） */
export function toggleSeatStatus(db: Db, teacherId: number, lectureId: number, seatNumber: number): "used" | "spare" | null {
  const row = db
    .prepare(
      `SELECT s.id, s.status FROM lecture_seats s JOIN lectures l ON l.id = s.lecture_id
        WHERE s.lecture_id = ? AND s.seat_number = ? AND l.owner_teacher_id = ?`,
    )
    .get(lectureId, seatNumber, teacherId) as { id: number; status: "used" | "spare" } | undefined;
  if (!row) return null;
  const next = row.status === "used" ? "spare" : "used";
  db.prepare("UPDATE lecture_seats SET status = ? WHERE id = ?").run(next, row.id);
  return next;
}

export type LectureInfoInput = {
  name: string;
  lectureDate: string | null;
  messageJa: string;
  messageFurigana: string;
  messageEn: string;
};

/** 講義名・日付・メッセージを更新する（座席・グループは変えない） */
export function updateLectureInfo(db: Db, teacherId: number, id: number, input: LectureInfoInput): boolean {
  return (
    db
      .prepare(
        `UPDATE lectures SET name = ?, lecture_date = ?, message_ja = ?, message_furigana = ?, message_en = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND owner_teacher_id = ?`,
      )
      .run(input.name, input.lectureDate, input.messageJa, input.messageFurigana, input.messageEn, id, teacherId)
      .changes > 0
  );
}

// ---------- TT・参観コード（閲覧専用） ----------

/** 見間違えやすい文字を除いた 31 文字 */
const TT_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TT_CODE_LENGTH = 8; // 約 40 ビット（入力回数はレート制限で抑える）

export function generateTtCode(): string {
  let s = "";
  for (let i = 0; i < TT_CODE_LENGTH; i++) s += TT_ALPHABET[crypto.randomInt(TT_ALPHABET.length)];
  return s;
}

/** 入力を正規化（大文字小文字・ハイフン・空白・全角を問わない）。形式が違えば null */
export function normalizeTtCode(input: string): string | null {
  const s = input.normalize("NFKC").replace(/[\s\-‐‑‒–—―ー－]/g, "").toUpperCase();
  return new RegExp(`^[${TT_ALPHABET}]{${TT_CODE_LENGTH}}$`).test(s) ? s : null;
}

/** 表示用：XXXX-XXXX */
export function formatTtCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** TT・参観コードを発行（再発行で前のコードは使えなくなる） */
export function issueTtCode(db: Db, teacherId: number, lectureId: number): string | null {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateTtCode();
    try {
      const res = db
        .prepare("UPDATE lectures SET tt_code = ? WHERE id = ? AND owner_teacher_id = ?")
        .run(code, lectureId, teacherId);
      return res.changes ? code : null;
    } catch (e) {
      // まれにほかの講義と重なったら作り直す
      if (!(e instanceof Error && /UNIQUE/.test(e.message))) throw e;
    }
  }
  return null;
}

export function revokeTtCode(db: Db, teacherId: number, lectureId: number): boolean {
  return (
    db.prepare("UPDATE lectures SET tt_code = NULL WHERE id = ? AND owner_teacher_id = ?").run(lectureId, teacherId)
      .changes > 0
  );
}

export function getTtCode(db: Db, teacherId: number, lectureId: number): string | null {
  const row = db
    .prepare("SELECT tt_code FROM lectures WHERE id = ? AND owner_teacher_id = ?")
    .get(lectureId, teacherId) as { tt_code: string | null } | undefined;
  return row?.tt_code ?? null;
}

export function getLectureByTtCode(db: Db, code: string): Lecture | null {
  return loadLecture(
    db,
    db.prepare(`${LECTURE_SELECT} WHERE l.tt_code = ? AND l.archived = 0`).get(code) as LectureRow | undefined,
  );
}
