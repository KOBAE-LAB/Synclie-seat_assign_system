import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db/index.ts";
import {
  apportion,
  arrangeDesks,
  chooseUsedSeats,
  emptyLayout,
  findIslands,
  groupName,
  parseLayout,
  planLecture,
  renumberSeats,
  spreadIndexes,
  withSeats,
} from "../src/lib/seating/layout.ts";
import { deskSeatPositions, normalizeRotation, rotationToFace, rotationToFaceWall, type Desk } from "../src/lib/seating/geometry.ts";
import { saveClassroom, deleteClassroom, listClassrooms } from "../src/lib/seating/classrooms.ts";
import { createLecture, getLecture, getLectureByToken, setAcceptState } from "../src/lib/seating/lectures.ts";
import { cancelDraw, drawForDevice, listDraws, proxyDraw, resetDraws } from "../src/lib/seating/draws.ts";

/** 旧形式（マス目）の JSON：cols 列のうち 4 列目ごとが通路 */
function oldGridJson(rows: number, cols: number) {
  const seats = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((c + 1) % 4 !== 0) seats.push({ number: 0, row: r, col: c });
  return { version: 1, kind: "grid", rows, cols, seats, desks: [], fixtures: [] };
}

// 旧形式から変換：3 列ずつ 2 島 × 4 行 = 24 席
const layout = parseLayout(oldGridJson(4, 7))!;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("旧形式（マス目）のレイアウトは学生机の配置に変換され、席番号は前列左から", () => {
  assert.equal(layout.kind, "free");
  assert.equal(layout.seats.length, 24);
  assert.equal(layout.desks.length, 24);
  assert.ok(layout.desks.every((d) => d.type === "student"));
  assert.deepEqual(layout.seats.map((s) => s.number), Array.from({ length: 24 }, (_, i) => i + 1));
  // 1〜6 番が最前列で、左から右
  const front = layout.seats.slice(0, 6);
  assert.ok(front.every((s) => s.y === front[0].y));
  assert.ok(front.every((s, i) => i === 0 || s.x > front[i - 1].x));
  assert.ok(layout.fixtures.some((f) => f.type === "board"));
});

test("parseLayout は不正な入力を拒否し、座席は机から計算し直す", () => {
  assert.equal(parseLayout("not json"), null);
  assert.equal(parseLayout({ kind: "free", width: 10, height: 800, desks: [], fixtures: [] }), null);
  const base = { kind: "free", version: 2, width: 1000, height: 800, fixtures: [] };
  const desk = { id: "a", type: "long2", x: 100, y: 100, rotation: 0, seats: [1, 2] };
  assert.ok(parseLayout({ ...base, desks: [desk] }));
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, seats: [1] }] }), null, "長机は 2 席");
  assert.equal(parseLayout({ ...base, desks: [desk, { ...desk, id: "b" }] }), null, "席番号の重複");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, type: "sofa" }] }), null, "知らない種類");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, x: 5000 }] }), null, "部屋の外");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, id: "a b" }] }), null, "不正な ID");
  assert.equal(parseLayout({ ...base, desks: [{ id: "c", type: "custom", x: 100, y: 100, rotation: 0, seats: [1, 2, 3] }] }), null, "カスタムは大きさが必要");
  const custom = parseLayout({ ...base, desks: [{ id: "c", type: "custom", x: 100, y: 100, rotation: 7, w: 200, h: 50, seats: [1, 2, 3] }] })!;
  assert.equal(custom.seats.length, 3);
  assert.equal(custom.desks[0].rotation, 5, "回転は 5° 刻みにそろえる");
  // クライアントが送った seats は無視して机から計算する
  const forged = parseLayout({ ...base, desks: [desk], seats: [{ number: 99, x: 0, y: 0, deskId: "a" }] })!;
  assert.deepEqual(forged.seats.map((s) => s.number), [1, 2]);
});

test("机の種類ごとの席数と、回転による座席位置", () => {
  const counts = { student: 1, tablet: 1, long2: 2, trapezoid3: 3, round4: 4 } as const;
  for (const [type, n] of Object.entries(counts)) {
    const d: Desk = { id: "x", type: type as Desk["type"], x: 0, y: 0, rotation: 0, seats: Array.from({ length: n }, (_, i) => i + 1) };
    assert.equal(deskSeatPositions(d).length, n, type);
  }
  // 学生机：回転 0° なら座席は後ろ（+y）、180° なら前（-y）
  const d: Desk = { id: "x", type: "student", x: 100, y: 100, rotation: 0, seats: [1] };
  assert.ok(deskSeatPositions(d)[0].y > 100);
  assert.ok(deskSeatPositions({ ...d, rotation: 180 })[0].y < 100);
  assert.equal(normalizeRotation(-5), 355);
  assert.equal(normalizeRotation(362), 0);
});

test("黒板の方を向く回転角", () => {
  assert.equal(rotationToFace({ x: 100, y: 500 }, { x: 100, y: 0 }), 0, "真上");
  assert.equal(rotationToFace({ x: 0, y: 100 }, { x: 500, y: 100 }), 90, "右");
  assert.equal(rotationToFace({ x: 100, y: 0 }, { x: 100, y: 500 }), 180, "真下");
  assert.equal(rotationToFace({ x: 0, y: 100 }, { x: 100, y: 0 }), 45, "右上");
  // 正対：前の壁の黒板なら、斜め前にいても 0°
  assert.equal(rotationToFaceWall({ x: 100, y: 130 }, { x: 500, y: 20, rotation: 0 }), 0);
  // 左の壁（縦向き＝回転 90°）の黒板なら左（270°）を向く
  assert.equal(rotationToFaceWall({ x: 500, y: 300 }, { x: 20, y: 400, rotation: 90 }), 270);
  // 後ろの壁の黒板なら 180°
  assert.equal(rotationToFaceWall({ x: 500, y: 300 }, { x: 500, y: 780, rotation: 0 }), 180);
});

test("六角形（台形×2）は 1 つの島、離れた机は別の島", () => {
  const room = emptyLayout(1000, 800);
  const hex = withSeats({
    ...room,
    desks: [
      { id: "a", type: "trapezoid3", x: 300, y: 300, rotation: 0, seats: [1, 2, 3] },
      { id: "b", type: "trapezoid3", x: 300, y: 352, rotation: 180, seats: [4, 5, 6] },
      { id: "c", type: "round4", x: 700, y: 300, rotation: 0, seats: [7, 8, 9, 10] },
    ],
  });
  assert.deepEqual(findIslands(hex), [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10]]);
});

test("まとめて並べる・席番号の振り直し", () => {
  const desks = arrangeDesks({ type: "long2", rows: 2, cols: 3, pitchX: 150, pitchY: 100, startX: 100, startY: 100 }, 1, "t");
  assert.equal(desks.length, 6);
  assert.deepEqual(desks.flatMap((d) => d.seats), Array.from({ length: 12 }, (_, i) => i + 1));
  // 番号をばらばらにしてから振り直すと、前列の左から 1, 2, 3...
  const shuffled = withSeats({ ...emptyLayout(), desks: desks.map((d, i) => ({ ...d, seats: d.seats.map((n) => n + 100 * (6 - i)) })) });
  const renumbered = renumberSeats(shuffled);
  assert.deepEqual(renumbered.seats.map((s) => s.number), Array.from({ length: 12 }, (_, i) => i + 1));
  const front = renumbered.seats.slice(0, 6);
  assert.ok(front.every((s, i) => i === 0 || s.x > front[i - 1].x));
});

test("均等配分の補助関数", () => {
  assert.deepEqual(spreadIndexes(10, 5), [1, 3, 5, 7, 9]);
  assert.deepEqual(spreadIndexes(3, 5), [0, 1, 2]);
  assert.deepEqual(apportion(7, [12, 12]), [4, 3]);
  assert.equal(apportion(10, [1, 2, 3]).reduce((a, b) => a + b), 6); // 席数を超えない
  assert.deepEqual([0, 25, 26, 27].map(groupName), ["A", "Z", "AA", "AB"]);
});

test("受講者数に合わせて島ごとに均等に使用席を選ぶ", () => {
  const used = chooseUsedSeats(layout, 10);
  assert.equal(used.size, 10);
  const islands = findIslands(layout);
  assert.deepEqual(islands.map((i) => i.filter((n) => used.has(n)).length), [5, 5]);
  assert.equal(chooseUsedSeats(layout, 100).size, 24);
});

test("グループ分け：島ごと・N 個・なし", () => {
  const byIsland = planLecture(layout, 24, { kind: "island" });
  assert.equal(byIsland.groups.length, 2);
  assert.ok(byIsland.seats.every((s) => s.groupIndex !== null));

  const byCount = planLecture(layout, 10, { kind: "count", count: 3 });
  assert.equal(byCount.groups.length, 3);
  const usedPerGroup = [0, 1, 2].map(
    (g) => byCount.seats.filter((s) => s.status === "used" && s.groupIndex === g).length,
  );
  assert.deepEqual(usedPerGroup.sort(), [3, 3, 4]);
  assert.ok(byCount.seats.every((s) => s.groupIndex !== null)); // 予備席もどこかのグループ

  const none = planLecture(layout, 10, { kind: "none" });
  assert.equal(none.groups.length, 0);
  assert.ok(none.seats.every((s) => s.groupIndex === null));
});

let db: Db;
let teacherId: number;

beforeEach(() => {
  db = openDatabase(":memory:");
  teacherId = Number(
    db
      .prepare("INSERT INTO teachers (login_id, password_hash, recovery_code_hash) VALUES ('teacher1', 'h', 'r')")
      .run().lastInsertRowid,
  );
});
afterEach(() => db.close());

function makeLecture(enrolled: number) {
  const classroomId = saveClassroom(db, teacherId, { name: "301", layout })!;
  const lectureId = createLecture(db, teacherId, {
    classroomId,
    name: "情報リテラシー",
    lectureDate: "2026-11-10",
    enrolledCount: enrolled,
    messageJa: "前の席から詰めてください",
    groupMode: { kind: "count", count: 4 },
  })!;
  return { classroomId, lectureId, token: getLecture(db, teacherId, lectureId)!.publicToken };
}

test("講義を作ると座席・グループが作られる", () => {
  const { lectureId } = makeLecture(10);
  const lecture = getLecture(db, teacherId, lectureId)!;
  assert.equal(lecture.seats.length, 24);
  assert.equal(lecture.seats.filter((s) => s.status === "used").length, 10);
  assert.equal(lecture.groups.length, 4);
  assert.equal(lecture.acceptState, "before");
  // 他の講師からは見えない
  assert.equal(getLecture(db, teacherId + 1, lectureId), null);
});

test("受付前・受付終了では抽選できない", () => {
  const { lectureId, token } = makeLecture(10);
  assert.deepEqual(drawForDevice(db, token, uuid(1)), { ok: false, reason: "not_open" });
  setAcceptState(db, teacherId, lectureId, "closed");
  assert.deepEqual(drawForDevice(db, token, uuid(1)), { ok: false, reason: "not_open" });
  assert.deepEqual(drawForDevice(db, "nope", uuid(1)), { ok: false, reason: "not_found" });
});

test("抽選：同じ端末は同じ席、席は重ならず、使用席から先に埋まる", () => {
  const { lectureId, token } = makeLecture(10);
  setAcceptState(db, teacherId, lectureId, "open");
  const first = drawForDevice(db, token, uuid(1));
  assert.ok(first.ok && !first.alreadyDrawn);
  const again = drawForDevice(db, token, uuid(1));
  assert.ok(again.ok && again.alreadyDrawn && again.seatNumber === first.seatNumber);

  const lecture = getLecture(db, teacherId, lectureId)!;
  const usedNumbers = new Set(lecture.seats.filter((s) => s.status === "used").map((s) => s.number));
  const seen = new Set<number>([first.ok ? first.seatNumber : -1]);
  for (let i = 2; i <= 10; i++) {
    const r = drawForDevice(db, token, uuid(i));
    assert.ok(r.ok);
    assert.ok(usedNumbers.has(r.seatNumber), "使用席から割り当てる");
    assert.ok(!seen.has(r.seatNumber), "席が重ならない");
    seen.add(r.seatNumber);
  }
  // 使用席が埋まったら予備席
  const extra = drawForDevice(db, token, uuid(11));
  assert.ok(extra.ok && !usedNumbers.has(extra.seatNumber));
});

test("満席になったら full、取消すると空いた席を引ける", () => {
  const { lectureId, token } = makeLecture(24);
  setAcceptState(db, teacherId, lectureId, "open");
  for (let i = 1; i <= 24; i++) assert.ok(drawForDevice(db, token, uuid(i)).ok);
  assert.deepEqual(drawForDevice(db, token, uuid(99)), { ok: false, reason: "full" });
  assert.equal(proxyDraw(db, lectureId), null);

  const target = listDraws(db, lectureId)[0];
  assert.ok(cancelDraw(db, lectureId, target.id));
  const r = drawForDevice(db, token, uuid(99));
  assert.ok(r.ok && r.seatNumber === target.seatNumber);
});

test("代理抽選・リセット", () => {
  const { lectureId, token } = makeLecture(10);
  const p = proxyDraw(db, lectureId);
  assert.ok(p);
  assert.equal(listDraws(db, lectureId)[0].drawnBy, "proxy");
  setAcceptState(db, teacherId, lectureId, "open");
  drawForDevice(db, token, uuid(1));
  assert.equal(resetDraws(db, lectureId), 2);
  assert.equal(listDraws(db, lectureId).length, 0);
  // リセット後は同じ端末でも引き直せる
  assert.ok(drawForDevice(db, token, uuid(1)).ok);
});

test("講義作成後に教室を編集しても講義の座席図は変わらない", () => {
  const { classroomId, lectureId, token } = makeLecture(10);
  saveClassroom(db, teacherId, { id: classroomId, name: "301", layout: parseLayout(oldGridJson(1, 1))! });
  assert.equal(getLectureByToken(db, token)!.layout.seats.length, 24);
  assert.equal(listClassrooms(db, teacherId)[0].seatCount, 1);
  assert.equal(deleteClassroom(db, teacherId, classroomId), "in_use");
  assert.equal(getLecture(db, teacherId, lectureId)!.seats.length, 24);
});
