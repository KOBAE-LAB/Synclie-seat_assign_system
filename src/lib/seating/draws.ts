import crypto from "node:crypto";
import type { Db } from "../db/index.ts";

export type DrawResult = {
  drawId: number;
  seatNumber: number;
  groupName: string | null;
  groupColor: string | null;
};

export type DrawOutcome =
  | ({ ok: true; alreadyDrawn: boolean } & DrawResult)
  | { ok: false; reason: "not_found" | "not_open" | "full" };

/** 端末 ID は UUID 形式だけ受け付ける */
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDeviceId(deviceId: string): boolean {
  return DEVICE_ID_PATTERN.test(deviceId);
}

const RESULT_SELECT = `
  SELECT d.id AS drawId, s.seat_number AS seatNumber, g.name AS groupName, g.color AS groupColor
    FROM draws d
    JOIN lecture_seats s ON s.id = d.seat_id
    LEFT JOIN lecture_groups g ON g.id = s.group_id`;

export function findDeviceDraw(db: Db, lectureId: number, deviceId: string): DrawResult | null {
  return (
    (db
      .prepare(`${RESULT_SELECT} WHERE d.lecture_id = ? AND d.device_id = ? AND d.cancelled = 0`)
      .get(lectureId, deviceId) as DrawResult | undefined) ?? null
  );
}

/** 空いている席から 1 つランダムに選ぶ。使用席を優先し、埋まったら予備席を使う */
function pickFreeSeat(db: Db, lectureId: number): number | null {
  const free = db
    .prepare(
      `SELECT s.id, s.status FROM lecture_seats s
        WHERE s.lecture_id = ?
          AND NOT EXISTS (SELECT 1 FROM draws d WHERE d.seat_id = s.id AND d.cancelled = 0)`,
    )
    .all(lectureId) as { id: number; status: "used" | "spare" }[];
  const used = free.filter((s) => s.status === "used");
  const pool = used.length ? used : free;
  if (!pool.length) return null;
  return pool[crypto.randomInt(pool.length)].id;
}

function insertDraw(db: Db, lectureId: number, deviceId: string | null): DrawResult | null {
  const seatId = pickFreeSeat(db, lectureId);
  if (seatId === null) return null;
  const drawId = Number(
    db
      .prepare("INSERT INTO draws (lecture_id, seat_id, device_id, drawn_by) VALUES (?, ?, ?, ?)")
      .run(lectureId, seatId, deviceId, deviceId ? "student" : "proxy").lastInsertRowid,
  );
  return db.prepare(`${RESULT_SELECT} WHERE d.id = ?`).get(drawId) as DrawResult;
}

/**
 * 学生の抽選。同じ端末ならすでに引いた席を返す。
 * better-sqlite3 は同期的に実行され、IMMEDIATE トランザクションで書き込みを直列化するため、
 * 同時に押されても席が重なることはない（DB の UNIQUE インデックスでも保証している）。
 */
export function drawForDevice(db: Db, publicToken: string, deviceId: string): DrawOutcome {
  return db.transaction((): DrawOutcome => {
    const lecture = db
      .prepare("SELECT id, accept_state FROM lectures WHERE public_token = ? AND archived = 0")
      .get(publicToken) as { id: number; accept_state: string } | undefined;
    if (!lecture) return { ok: false, reason: "not_found" };
    const existing = findDeviceDraw(db, lecture.id, deviceId);
    if (existing) return { ok: true, alreadyDrawn: true, ...existing };
    if (lecture.accept_state !== "open") return { ok: false, reason: "not_open" };
    const result = insertDraw(db, lecture.id, deviceId);
    if (!result) return { ok: false, reason: "full" };
    return { ok: true, alreadyDrawn: false, ...result };
  }).immediate();
}

/** 講師による代理抽選（端末 ID なし。受付状態に関係なく行える） */
export function proxyDraw(db: Db, lectureId: number): DrawResult | null {
  return db.transaction(() => insertDraw(db, lectureId, null)).immediate();
}

export function cancelDraw(db: Db, lectureId: number, drawId: number): boolean {
  return (
    db
      .prepare(
        `UPDATE draws SET cancelled = 1, cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND lecture_id = ? AND cancelled = 0`,
      )
      .run(drawId, lectureId).changes > 0
  );
}

/** すべての抽選を取り消す（履歴は残す） */
export function resetDraws(db: Db, lectureId: number): number {
  return db
    .prepare(
      `UPDATE draws SET cancelled = 1, cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE lecture_id = ? AND cancelled = 0`,
    )
    .run(lectureId).changes;
}

export type DrawRow = {
  id: number;
  seatNumber: number;
  groupName: string | null;
  drawnBy: "student" | "proxy";
  createdAt: string;
  deviceTag: string | null;
};

/** 講師画面用の抽選一覧（端末 ID はそのまま出さず、短い識別子にする） */
export function listDraws(db: Db, lectureId: number): DrawRow[] {
  return (
    db
      .prepare(
        `SELECT d.id, s.seat_number AS seatNumber, g.name AS groupName, d.drawn_by AS drawnBy,
                d.created_at AS createdAt, d.device_id AS deviceId
           FROM draws d JOIN lecture_seats s ON s.id = d.seat_id
           LEFT JOIN lecture_groups g ON g.id = s.group_id
          WHERE d.lecture_id = ? AND d.cancelled = 0
          ORDER BY s.seat_number`,
      )
      .all(lectureId) as (Omit<DrawRow, "deviceTag"> & { deviceId: string | null })[]
  ).map(({ deviceId, ...r }) => ({ ...r, deviceTag: deviceId ? deviceId.slice(0, 4).toUpperCase() : null }));
}
