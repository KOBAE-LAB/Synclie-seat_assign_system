import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, type Db } from "../src/lib/db/index.ts";
import {
  apportion,
  arrangeDesks,
  chooseUsedSeats,
  contentExtent,
  emptyLayout,
  findIslands,
  resizeRoom,
  groupName,
  parseLayout,
  planLecture,
  renumberSeats,
  spreadIndexes,
  validateLayout,
  withSeats,
} from "../src/lib/seating/layout.ts";
import { deskSeatPositions, normalizeRotation, rotationToFace, rotationToFaceWall, snapToWall, type Desk } from "../src/lib/seating/geometry.ts";
import {
  copyClassroomByShareCode,
  deleteClassroom,
  getShareCode,
  issueShareCode,
  listClassrooms,
  revokeShareCode,
  saveClassroom,
} from "../src/lib/seating/classrooms.ts";
import { csvCell, safeFileName, toCsv } from "../src/lib/seating/csv.ts";
import {
  createLecture,
  formatTtCode,
  getLecture,
  getLectureByToken,
  getLectureByTtCode,
  getTtCode,
  issueTtCode,
  listFoldersAndTags,
  listLectures,
  normalizeTtCode,
  parseTags,
  setArchived,
  updateLectureOrganize,
  revokeTtCode,
  setAcceptState,
  toggleSeatStatus,
} from "../src/lib/seating/lectures.ts";
import { cancelDraw, drawForDevice, listDraws, moveDraw, proxyDraw, resetDraws } from "../src/lib/seating/draws.ts";
import { addGroup, assignSeatsToGroup, deleteGroup, regroupLecture, updateGroup } from "../src/lib/seating/groups.ts";

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
  assert.equal(parseLayout({ kind: "free", width: 9000, height: 800, desks: [], fixtures: [] }), null, "部屋が大きすぎる");
  const base = { kind: "free", version: 2, width: 1000, height: 800, fixtures: [] };
  const desk = { id: "a", type: "long2", x: 100, y: 100, rotation: 0, seats: [1, 2] };
  assert.ok(parseLayout({ ...base, desks: [desk] }));
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, seats: [1] }] }), null, "長机は 2 席");
  assert.equal(parseLayout({ ...base, desks: [desk, { ...desk, id: "b" }] }), null, "席番号の重複");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, type: "sofa" }] }), null, "知らない種類");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, x: 6000 }] }), null, "上限（50 m）より外");
  assert.equal(parseLayout({ ...base, desks: [{ ...desk, id: "a b" }] }), null, "不正な ID");
  assert.equal(parseLayout({ ...base, desks: [{ id: "c", type: "custom", x: 100, y: 100, rotation: 0, seats: [1, 2, 3] }] }), null, "カスタムは大きさが必要");
  const custom = parseLayout({ ...base, desks: [{ id: "c", type: "custom", x: 100, y: 100, rotation: 7, w: 200, h: 50, seats: [1, 2, 3] }] })!;
  assert.equal(custom.seats.length, 3);
  assert.equal(custom.desks[0].rotation, 5, "回転は 5° 刻みにそろえる");
  // クライアントが送った seats は無視して机から計算する
  const forged = parseLayout({ ...base, desks: [desk], seats: [{ number: 99, x: 0, y: 0, deskId: "a" }] })!;
  assert.deepEqual(forged.seats.map((s) => s.number), [1, 2]);
});

test("机が部屋からはみ出していたら、拒否せず部屋を広げて保存する", () => {
  // 幅の入力中に一瞬 200 cm になった、などの状態
  const desks = arrangeDesks({ type: "student", rows: 6, cols: 8, pitchX: 80, pitchY: 95, startX: 100, startY: 130 }, 1, "a");
  const shrunk = { ...withSeats({ ...emptyLayout(1000, 800), desks }), width: 200, height: 200 };
  const r = validateLayout(JSON.stringify(shrunk));
  assert.ok(r.ok);
  const maxX = Math.max(...desks.map((d) => d.x));
  const maxY = Math.max(...desks.map((d) => d.y));
  assert.equal(r.layout.width, maxX, "机の中心が入るところまで広がる（余白は足さない）");
  assert.equal(r.layout.height, maxY);
  assert.equal(r.layout.seats.length, 48);
  const extent = contentExtent(r.layout);
  assert.ok(extent.width <= r.layout.width && extent.height <= r.layout.height);
  // 大きい部屋はそのまま
  assert.equal(validateLayout(JSON.stringify({ ...shrunk, width: 1500, height: 1200 })).ok && 1500, 1500);
});

test("壁ぎわの備品があっても、保存するたびに部屋が広がらない", () => {
  const room = emptyLayout(760, 800);
  const withDoor = withSeats({
    ...room,
    fixtures: [...room.fixtures, { id: "door", type: "door", x: 760, y: 700, w: 90, h: 10, rotation: 90 }],
  });
  let l = withDoor;
  for (let i = 0; i < 3; i++) l = validateLayout(JSON.stringify(l)).ok ? (validateLayout(JSON.stringify(l)) as { layout: typeof l }).layout : l;
  assert.equal(l.width, 760);
  assert.equal(l.height, 800);
});

test("部屋を小さくすると、はみ出す机・備品を新しい壁ぎわに寄せる", () => {
  const room = emptyLayout(805, 800);
  const l = withSeats({
    ...room,
    desks: [{ id: "a", type: "student", x: 780, y: 300, rotation: 0, seats: [1] }],
    fixtures: [...room.fixtures, { id: "door", type: "door", x: 805, y: 700, w: 90, h: 10, rotation: 90 }],
  });
  const { layout, moved } = resizeRoom(l, 700, 800);
  assert.equal(moved, 2);
  assert.equal(layout.width, 700);
  assert.equal(layout.fixtures.find((f) => f.id === "door")!.x, 700);
  assert.equal(layout.desks[0].x, 700);
  assert.equal(resizeRoom(l, 1000, 800).moved, 0, "広げるときは何も動かさない");
});

test("保存できない理由を具体的に返す", () => {
  const base = { kind: "free", version: 2, width: 1000, height: 800, fixtures: [] };
  const d = (id: string, seats: number[]) => ({ id, type: "student", x: 100, y: 100, rotation: 0, seats });
  const dup = validateLayout({ ...base, desks: [d("a", [3]), d("b", [3])] });
  assert.ok(!dup.ok && dup.error.includes("席番号 3 が重なっています"));
  const many = validateLayout({ ...base, desks: Array.from({ length: 301 }, (_, i) => d(`d${i}`, [i + 1])) });
  assert.ok(!many.ok && many.error.includes("机は 300 台まで"));
  const label = validateLayout({ ...base, desks: [], fixtures: [{ id: "f", type: "other", x: 1, y: 1, w: 10, h: 10, rotation: 0, label: "あ".repeat(31) }] });
  assert.ok(!label.ok && label.error.includes("30 文字"));
  assert.ok(!validateLayout("{").ok);
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

test("席の移動と入れ替え", () => {
  const { lectureId, token } = makeLecture(24);
  setAcceptState(db, teacherId, lectureId, "open");
  const a = drawForDevice(db, token, uuid(1));
  const b = drawForDevice(db, token, uuid(2));
  assert.ok(a.ok && b.ok);
  const free = getLecture(db, teacherId, lectureId)!.seats.find(
    (s) => s.number !== a.seatNumber && s.number !== b.seatNumber,
  )!.number;
  // 空いている席へ移動
  assert.equal(moveDraw(db, lectureId, a.drawId, free), "moved");
  assert.equal(listDraws(db, lectureId).find((d) => d.id === a.drawId)!.seatNumber, free);
  // 抽選済みの席へ移動すると入れ替え
  assert.equal(moveDraw(db, lectureId, a.drawId, b.seatNumber), "swapped");
  const rows = listDraws(db, lectureId);
  assert.equal(rows.find((d) => d.id === a.drawId)!.seatNumber, b.seatNumber);
  assert.equal(rows.find((d) => d.id === b.drawId)!.seatNumber, free);
  assert.equal(rows.length, 2);
  assert.equal(moveDraw(db, lectureId, a.drawId, b.seatNumber), "same");
  assert.equal(moveDraw(db, lectureId, a.drawId, 999), "not_found");
  // 学生から見ても新しい席になっている
  const again = drawForDevice(db, token, uuid(2));
  assert.ok(again.ok && again.seatNumber === free);
});

test("使用席・予備席の切り替えは抽選の優先順に反映される", () => {
  const { lectureId, token } = makeLecture(1);
  const lecture = getLecture(db, teacherId, lectureId)!;
  const used = lecture.seats.find((s) => s.status === "used")!.number;
  const spare = lecture.seats.find((s) => s.status === "spare")!.number;
  assert.equal(toggleSeatStatus(db, teacherId, lectureId, used), "spare");
  assert.equal(toggleSeatStatus(db, teacherId, lectureId, spare), "used");
  assert.equal(toggleSeatStatus(db, teacherId + 1, lectureId, spare), null, "他の講師は変更できない");
  setAcceptState(db, teacherId, lectureId, "open");
  const r = drawForDevice(db, token, uuid(1));
  assert.ok(r.ok && r.seatNumber === spare, "使用席にした席から割り当てる");
});

test("TT・参観コード：発行・照合・再発行・無効化", () => {
  const { lectureId } = makeLecture(10);
  assert.equal(getTtCode(db, teacherId, lectureId), null);
  const code = issueTtCode(db, teacherId, lectureId)!;
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.equal(normalizeTtCode(formatTtCode(code).toLowerCase()), code, "小文字・ハイフン付きでも照合できる");
  assert.equal(normalizeTtCode("abc"), null);
  assert.equal(getLectureByTtCode(db, code)!.id, lectureId);
  assert.equal(issueTtCode(db, teacherId + 1, lectureId), null, "他の講師は発行できない");
  const next = issueTtCode(db, teacherId, lectureId)!;
  assert.notEqual(next, code);
  assert.equal(getLectureByTtCode(db, code), null, "再発行すると前のコードは使えない");
  assert.ok(revokeTtCode(db, teacherId, lectureId));
  assert.equal(getLectureByTtCode(db, next), null);
});

test("CSV のエスケープ（Excel の数式対策・BOM・CRLF）", () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell(null), "");
  const csv = toCsv([["席", "グループ"], [1, "A"]]);
  assert.ok(csv.startsWith("﻿席,グループ\r\n1,A\r\n"));
  assert.equal(safeFileName('情報 リテラシー/第5回:"'), "情報_リテラシー_第5回_");
});

test("講義のフォルダ・タグ・メモ・検索・アーカイブ", () => {
  const a = makeLecture(10).lectureId;
  const b = makeLecture(10).lectureId;
  assert.deepEqual(parseTags("数学, 1年 、前期,#数学"), ["数学", "1年", "前期"]);
  updateLectureOrganize(db, teacherId, a, { memo: "教科書 p.20 から", folder: "2026 前期", tags: ["数学", "1年"] });
  updateLectureOrganize(db, teacherId, b, { memo: "", folder: "", tags: ["英語"] });
  assert.deepEqual(listLectures(db, teacherId, { folder: "2026 前期" }).map((l) => l.id), [a]);
  assert.deepEqual(listLectures(db, teacherId, { tag: "英語" }).map((l) => l.id), [b]);
  assert.deepEqual(listLectures(db, teacherId, { q: "p.20" }).map((l) => l.id), [a], "メモも検索する");
  assert.equal(listLectures(db, teacherId, { q: "100%" }).length, 0, "% は文字として扱う");
  assert.deepEqual(listFoldersAndTags(db, teacherId), { folders: ["2026 前期"], tags: ["1年", "数学", "英語"] });
  const lecture = getLecture(db, teacherId, a)!;
  assert.deepEqual([lecture.folder, lecture.tags, lecture.memo], ["2026 前期", ["数学", "1年"], "教科書 p.20 から"]);
  // アーカイブすると一覧から外れ、受付は終了、学生の QR は使えない
  setAcceptState(db, teacherId, a, "open");
  assert.ok(setArchived(db, teacherId, a, true));
  assert.deepEqual(listLectures(db, teacherId).map((l) => l.id), [b]);
  assert.deepEqual(listLectures(db, teacherId, { archived: true }).map((l) => l.id), [a]);
  assert.equal(getLecture(db, teacherId, a)!.acceptState, "closed");
  assert.equal(getLectureByToken(db, lecture.publicToken), null);
  assert.ok(setArchived(db, teacherId, a, false));
  assert.ok(getLectureByToken(db, lecture.publicToken));
});

test("教室の共有コードでほかの講師がコピーできる", () => {
  const { classroomId } = makeLecture(10);
  const other = Number(
    db.prepare("INSERT INTO teachers (login_id, password_hash, recovery_code_hash) VALUES ('teacher2', 'h', 'r')").run()
      .lastInsertRowid,
  );
  assert.equal(copyClassroomByShareCode(db, other, "AAAA-AAAA"), null);
  const code = issueShareCode(db, teacherId, classroomId)!;
  assert.equal(issueShareCode(db, other, classroomId), null, "持ち主以外は発行できない");
  const copied = copyClassroomByShareCode(db, other, code.toLowerCase())!;
  const mine = listClassrooms(db, other);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].id, copied);
  assert.equal(mine[0].name, "301（コピー）");
  assert.equal(mine[0].seatCount, 24);
  assert.ok(revokeShareCode(db, teacherId, classroomId));
  assert.equal(copyClassroomByShareCode(db, other, code), null, "無効化したら使えない");
  assert.equal(getShareCode(db, teacherId, classroomId), null);
});

test("講義のグループ：追加・名前と色・席の割り当て・削除・作り直し", () => {
  const { lectureId, token } = makeLecture(10);
  const before = getLecture(db, teacherId, lectureId)!;
  assert.equal(before.groups.length, 4);
  // 追加：空いている名前と色
  const added = addGroup(db, teacherId, lectureId)!;
  let lecture = getLecture(db, teacherId, lectureId)!;
  const g = lecture.groups.find((x) => x.id === added)!;
  assert.equal(g.name, "E");
  assert.ok(!before.groups.some((x) => x.color === g.color), "色が重ならない");
  assert.equal(addGroup(db, teacherId + 1, lectureId), null, "他の講師は追加できない");
  // 名前・色の変更
  assert.deepEqual(updateGroup(db, teacherId, lectureId, added, { name: "  ゼミ班 ", color: "#123abc" }), { ok: true });
  assert.ok(!updateGroup(db, teacherId, lectureId, added, { name: "", color: "#123abc" }).ok);
  assert.ok(!updateGroup(db, teacherId, lectureId, added, { name: "x", color: "red" }).ok);
  // 席の割り当て
  assert.equal(assignSeatsToGroup(db, teacherId, lectureId, [1, 2, 3], added), 3);
  lecture = getLecture(db, teacherId, lectureId)!;
  assert.deepEqual(lecture.seats.filter((s) => s.groupId === added).map((s) => s.number), [1, 2, 3]);
  assert.equal(lecture.seats.find((s) => s.number === 1)!.groupName, "ゼミ班");
  // 抽選済みの学生の結果にも新しいグループが出る
  setAcceptState(db, teacherId, lectureId, "open");
  const r = drawForDevice(db, token, uuid(1));
  assert.ok(r.ok);
  assignSeatsToGroup(db, teacherId, lectureId, [r.seatNumber], added);
  const again = drawForDevice(db, token, uuid(1));
  assert.ok(again.ok && again.groupName === "ゼミ班");
  // ほかの講義のグループには入れられない
  const other = makeLecture(5).lectureId;
  const otherGroup = getLecture(db, teacherId, other)!.groups[0].id;
  assert.equal(assignSeatsToGroup(db, teacherId, lectureId, [4], otherGroup), 0);
  // グループなしに戻す
  assert.equal(assignSeatsToGroup(db, teacherId, lectureId, [1], null), 1);
  // 削除：席はグループなしになる
  assert.ok(deleteGroup(db, teacherId, lectureId, added));
  lecture = getLecture(db, teacherId, lectureId)!;
  assert.ok(!lecture.groups.some((x) => x.id === added));
  assert.equal(lecture.seats.find((s) => s.number === 2)!.groupId, null);
  // 作り直し：島ごと（2 島）、使用席・予備席はそのまま
  const usedBefore = lecture.seats.filter((s) => s.status === "used").map((s) => s.number);
  assert.deepEqual(regroupLecture(db, teacherId, lectureId, { kind: "island" }), { ok: true });
  lecture = getLecture(db, teacherId, lectureId)!;
  assert.equal(lecture.groups.length, 2);
  assert.ok(lecture.seats.every((s) => s.groupId !== null));
  assert.deepEqual(lecture.seats.filter((s) => s.status === "used").map((s) => s.number), usedBefore);
  regroupLecture(db, teacherId, lectureId, { kind: "none" });
  assert.equal(getLecture(db, teacherId, lectureId)!.groups.length, 0);
});

test("ドア・窓は壁の近くで壁の線に吸い付き、壁に沿う向きになる", () => {
  const room = { width: 800, height: 1000 };
  assert.deepEqual(snapToWall(780, 500, room), { x: 800, y: 500, rotation: 90 }, "右の壁");
  assert.deepEqual(snapToWall(15, 300, room), { x: 0, y: 300, rotation: 90 }, "左の壁");
  assert.deepEqual(snapToWall(400, 990, room), { x: 400, y: 1000, rotation: 0 }, "後ろの壁");
  assert.deepEqual(snapToWall(400, 30, room), { x: 400, y: 0, rotation: 0 }, "前の壁");
  assert.equal(snapToWall(400, 500, room), null, "壁から遠いと吸い付かない");
  // 壁の上（埋め込み）にある備品は、部屋の大きさを広げない
  const l = withSeats({ ...emptyLayout(800, 1000), fixtures: [{ id: "d", type: "door", x: 800, y: 500, w: 90, h: 10, rotation: 90 }] });
  const r = validateLayout(JSON.stringify(l));
  assert.ok(r.ok && r.layout.width === 800 && r.layout.height === 1000);
});

test("使用席の選び方：前から詰める", () => {
  // 黒板が前（上）：前の列から
  const used = chooseUsedSeats(layout, 8, "front");
  assert.equal(used.size, 8);
  const front = [...layout.seats].sort((a, b) => a.y - b.y).slice(0, 6).map((s) => s.number);
  for (const n of front) assert.ok(used.has(n), `${n} は最前列なので使用席`);
  const maxUsedY = Math.max(...layout.seats.filter((s) => used.has(s.number)).map((s) => s.y));
  const minSpareY = Math.min(...layout.seats.filter((s) => !used.has(s.number)).map((s) => s.y));
  assert.ok(maxUsedY <= minSpareY, "使用席は予備席より前");
  // 黒板が後ろの壁にあれば、後ろから
  const back = { ...layout, fixtures: [{ id: "b", type: "board" as const, x: 300, y: layout.height, w: 300, h: 16, rotation: 0 }] };
  const usedBack = chooseUsedSeats(back, 6, "front");
  const maxY = Math.max(...layout.seats.map((s) => s.y));
  assert.ok(layout.seats.filter((s) => usedBack.has(s.number)).every((s) => s.y === maxY), "最後列が使用席");
  // 均等（既定）は島ごとに散らす
  const even = chooseUsedSeats(layout, 8);
  assert.deepEqual(findIslands(layout).map((i) => i.filter((n) => even.has(n)).length), [4, 4]);
  // 講義作成で使える
  const classroomId = saveClassroom(db, teacherId, { name: "前詰め", layout })!;
  const id = createLecture(db, teacherId, {
    classroomId, name: "前詰め", lectureDate: null, enrolledCount: 6, messageJa: "", groupMode: { kind: "none" }, seatFill: "front",
  })!;
  const seats = getLecture(db, teacherId, id)!.seats.filter((s) => s.status === "used").map((s) => s.number).sort((a, b) => a - b);
  assert.deepEqual(seats, front.sort((a, b) => a - b));
});
