/**
 * 教室レイアウト（机・備品を自由に配置する方式）と、講義の座席割り当てを決める純粋関数。
 * 旧形式（マス目方式, version 1）は読み込み時に自動で変換する。
 */
import {
  boxGap,
  CUSTOM_SEAT_MAX,
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  DESK_SPECS,
  deskBox,
  deskSeatPositions,
  FIXTURE_SPECS,
  normalizeRotation,
  type Desk,
  type DeskType,
  type Fixture,
  type FixtureType,
} from "./geometry.ts";

export const ROOM_MIN = 200;
export const ROOM_MAX = 5000;
export const SEAT_MAX = 300;
export const DESK_MAX = 300;
export const FIXTURE_MAX = 100;
/** 机どうしのすき間がこれ以下なら同じ「島」とみなす（cm） */
export const ISLAND_GAP = 25;

export type LayoutSeat = { number: number; x: number; y: number; deskId: string };

export type ClassroomLayout = {
  version: 2;
  kind: "free";
  width: number;
  height: number;
  desks: Desk[];
  fixtures: Fixture[];
  /** 机から計算した座席（番号順）。保存時に必ず再計算する */
  seats: LayoutSeat[];
};

export function emptyLayout(width = 1000, height = 800): ClassroomLayout {
  return withSeats({
    version: 2,
    kind: "free",
    width,
    height,
    desks: [],
    fixtures: [
      { id: "f1", type: "board", x: width / 2, y: 20, w: FIXTURE_SPECS.board.w, h: FIXTURE_SPECS.board.h, rotation: 0 },
    ],
    seats: [],
  });
}

/** 机の情報から座席一覧を計算し直す */
export function withSeats(layout: Omit<ClassroomLayout, "seats"> & { seats?: LayoutSeat[] }): ClassroomLayout {
  const seats: LayoutSeat[] = [];
  for (const d of layout.desks) {
    deskSeatPositions(d).forEach((p, i) => {
      seats.push({ number: d.seats[i], x: Math.round(p.x), y: Math.round(p.y), deskId: d.id });
    });
  }
  seats.sort((a, b) => a.number - b.number);
  return { ...layout, seats };
}

/**
 * 座席番号を前から順に振り直す（前の列の左から右へ）。
 * 座席の y が ROW_TOLERANCE 以内なら同じ列とみなす。
 */
export function renumberSeats(layout: ClassroomLayout, rowTolerance = 40): ClassroomLayout {
  const all = layout.desks.flatMap((d) =>
    deskSeatPositions(d).map((p, i) => ({ deskId: d.id, index: i, x: p.x, y: p.y })),
  );
  all.sort((a, b) => a.y - b.y);
  const rows: (typeof all)[] = [];
  for (const s of all) {
    const row = rows.at(-1);
    if (row && s.y - row[0].y <= rowTolerance) row.push(s);
    else rows.push([s]);
  }
  let n = 1;
  const numberOf = new Map<string, number>();
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    for (const s of row) numberOf.set(`${s.deskId}:${s.index}`, n++);
  }
  return withSeats({
    ...layout,
    desks: layout.desks.map((d) => ({ ...d, seats: d.seats.map((_, i) => numberOf.get(`${d.id}:${i}`)!) })),
  });
}

/** 次に使う座席番号 */
export function nextSeatNumber(layout: ClassroomLayout): number {
  return layout.desks.reduce((m, d) => Math.max(m, ...d.seats), 0) + 1;
}

// ---------- 旧形式（マス目）からの変換 ----------

const GRID_PITCH_X = 80;
const GRID_PITCH_Y = 95;

/** 旧形式のマス目レイアウトを、学生机を並べた自由配置に変換する（席番号は維持） */
export function gridToFree(rows: number, cols: number, seats: { number: number; row: number; col: number }[]): ClassroomLayout {
  const width = Math.max(ROOM_MIN, cols * GRID_PITCH_X + 120);
  const height = Math.max(ROOM_MIN, rows * GRID_PITCH_Y + 160);
  return withSeats({
    version: 2,
    kind: "free",
    width,
    height,
    desks: seats.map((s) => ({
      id: `d${s.number}`,
      type: "student" as const,
      x: 60 + GRID_PITCH_X / 2 + s.col * GRID_PITCH_X,
      y: 110 + s.row * GRID_PITCH_Y,
      rotation: 0,
      seats: [s.number],
    })),
    fixtures: [{ id: "f1", type: "board", x: width / 2, y: 20, w: Math.min(360, width - 40), h: 16, rotation: 0 }],
  });
}

// ---------- 検証 ----------

const DESK_TYPES = Object.keys(DESK_SPECS) as DeskType[];
const FIXTURE_TYPES = Object.keys(FIXTURE_SPECS) as FixtureType[];

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}
function isNum(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
function isId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);
}

function parseGrid(o: Record<string, unknown>): ClassroomLayout | null {
  if (!isInt(o.rows, 1, 30) || !isInt(o.cols, 1, 30) || !Array.isArray(o.seats)) return null;
  const rows = o.rows;
  const cols = o.cols;
  const cells: { row: number; col: number }[] = [];
  for (const s of o.seats) {
    if (!s || typeof s !== "object") return null;
    const { row, col } = s as Record<string, unknown>;
    if (!isInt(row, 0, rows - 1) || !isInt(col, 0, cols - 1)) return null;
    cells.push({ row, col });
  }
  // 旧形式は前列左から順に番号を振っていた
  const unique = [...new Map(cells.map((c) => [c.row * cols + c.col, c])).entries()].sort((a, b) => a[0] - b[0]);
  return gridToFree(rows, cols, unique.map(([, c], i) => ({ number: i + 1, ...c })));
}

function parseDesk(v: unknown, room: { width: number; height: number }): Desk | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isId(o.id) || !DESK_TYPES.includes(o.type as DeskType)) return null;
  if (!isNum(o.x, 0, room.width) || !isNum(o.y, 0, room.height) || !isNum(o.rotation, -3600, 3600)) return null;
  if (!Array.isArray(o.seats) || !o.seats.every((n) => isInt(n, 1, 9999))) return null;
  const type = o.type as DeskType;
  const desk: Desk = { id: o.id, type, x: Math.round(o.x), y: Math.round(o.y), rotation: normalizeRotation(o.rotation), seats: o.seats as number[] };
  const fixed = DESK_SPECS[type].seatCount;
  if (fixed !== null) {
    if (desk.seats.length !== fixed) return null;
  } else {
    if (desk.seats.length < 1 || desk.seats.length > CUSTOM_SEAT_MAX) return null;
    if (!isNum(o.w, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX) || !isNum(o.h, CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX)) return null;
    desk.w = Math.round(o.w);
    desk.h = Math.round(o.h);
  }
  return desk;
}

function parseFixture(v: unknown, room: { width: number; height: number }): Fixture | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isId(o.id) || !FIXTURE_TYPES.includes(o.type as FixtureType)) return null;
  if (!isNum(o.x, 0, room.width) || !isNum(o.y, 0, room.height) || !isNum(o.rotation, -3600, 3600)) return null;
  if (!isNum(o.w, 4, ROOM_MAX) || !isNum(o.h, 4, ROOM_MAX)) return null;
  if (o.label !== undefined && (typeof o.label !== "string" || o.label.length > 30)) return null;
  const f: Fixture = {
    id: o.id,
    type: o.type as FixtureType,
    x: Math.round(o.x),
    y: Math.round(o.y),
    w: Math.round(o.w),
    h: Math.round(o.h),
    rotation: normalizeRotation(o.rotation),
  };
  if (typeof o.label === "string" && o.label.trim()) f.label = o.label.trim();
  return f;
}

export type LayoutCheck = { ok: true; layout: ClassroomLayout } | { ok: false; error: string };

/** 机・備品は部屋の外（最大 ROOM_MAX まで）に出ていても受け付け、部屋を広げて収める */
const ANY_POSITION = { width: ROOM_MAX, height: ROOM_MAX };

/**
 * 外部から来た JSON を検証してレイアウトにする（旧形式は変換する）。
 * だめなときは講師に見せる理由を返す。
 */
export function validateLayout(input: unknown): LayoutCheck {
  const bad = (error: string): LayoutCheck => ({ ok: false, error });
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return bad("レイアウトのデータを読み取れませんでした。ページを再読み込みしてください。");
    }
  }
  if (!input || typeof input !== "object") return bad("レイアウトのデータがありません。");
  const o = input as Record<string, unknown>;
  if (o.kind === "grid" || (o.rows !== undefined && o.cols !== undefined)) {
    const grid = parseGrid(o);
    return grid ? { ok: true, layout: grid } : bad("古い形式のレイアウトを読み取れませんでした。");
  }
  if (o.kind !== "free") return bad("レイアウトの形式が正しくありません。");
  if (!isNum(o.width, 1, ROOM_MAX) || !isNum(o.height, 1, ROOM_MAX)) {
    return bad(`部屋の幅・奥行きは ${ROOM_MAX} cm 以内にしてください。`);
  }
  if (!Array.isArray(o.desks) || o.desks.length > DESK_MAX) return bad(`机は ${DESK_MAX} 台までです。`);
  if (!Array.isArray(o.fixtures) || o.fixtures.length > FIXTURE_MAX) return bad(`備品は ${FIXTURE_MAX} 個までです。`);
  const desks: Desk[] = [];
  for (const d of o.desks) {
    const desk = parseDesk(d, ANY_POSITION);
    if (!desk) return bad("机のデータに不正なものがあります（位置・種類・席数など）。ページを再読み込みしてください。");
    desks.push(desk);
  }
  const fixtures: Fixture[] = [];
  for (const f of o.fixtures) {
    const fixture = parseFixture(f, ANY_POSITION);
    if (!fixture) return bad("備品のデータに不正なものがあります（位置・大きさ・表示名は 30 文字まで など）。");
    fixtures.push(fixture);
  }
  const ids = [...desks.map((d) => d.id), ...fixtures.map((f) => f.id)];
  if (new Set(ids).size !== ids.length) return bad("同じ ID の机・備品があります。ページを再読み込みしてください。");
  const numbers = desks.flatMap((d) => d.seats);
  if (numbers.length > SEAT_MAX) return bad(`席は ${SEAT_MAX} 席までです（今 ${numbers.length} 席）。`);
  const dup = numbers.find((n, i) => numbers.indexOf(n) !== i);
  if (dup !== undefined) return bad(`席番号 ${dup} が重なっています。「席番号を前から振り直す」を押してください。`);

  // はみ出した机・備品が収まるよう部屋を広げる（ROOM_MIN 以上・ROOM_MAX 以下）
  const need = contentExtent({ desks, fixtures });
  const width = Math.round(Math.min(ROOM_MAX, Math.max(o.width, need.width)));
  const height = Math.round(Math.min(ROOM_MAX, Math.max(o.height, need.height)));
  return { ok: true, layout: withSeats({ version: 2, kind: "free", width, height, desks, fixtures }) };
}

/** validateLayout の結果だけ欲しいとき（不正なら null） */
export function parseLayout(input: unknown): ClassroomLayout | null {
  const r = validateLayout(input);
  return r.ok ? r.layout : null;
}

/**
 * 部屋の中身（机・備品）の中心がすべて入る最小の幅・奥行き（ROOM_MIN 以上）。
 * 壁に沿って置いた備品（ドア・窓など）は中心が壁の上にあるので、余白は足さない
 * （余白を足すと、保存するたびに部屋が少しずつ広がってしまう）。
 */
export function contentExtent(layout: Pick<ClassroomLayout, "desks" | "fixtures">): { width: number; height: number } {
  const items = [...layout.desks, ...layout.fixtures];
  return {
    width: Math.ceil(Math.max(ROOM_MIN, ...items.map((i) => i.x))),
    height: Math.ceil(Math.max(ROOM_MIN, ...items.map((i) => i.y))),
  };
}

/** 部屋を width × height にする。はみ出す机・備品は新しい壁ぎわに寄せる。寄せた数も返す */
export function resizeRoom<T extends Pick<ClassroomLayout, "desks" | "fixtures" | "width" | "height">>(
  layout: T,
  width: number,
  height: number,
): { layout: T; moved: number } {
  let moved = 0;
  const fit = <I extends { x: number; y: number }>(i: I): I => {
    if (i.x <= width && i.y <= height) return i;
    moved++;
    return { ...i, x: Math.min(i.x, width), y: Math.min(i.y, height) };
  };
  return { layout: { ...layout, width, height, desks: layout.desks.map(fit), fixtures: layout.fixtures.map(fit) }, moved };
}

/** 机どうしのすき間が ISLAND_GAP 以下ならつなげた、席番号のかたまり（島）。島は最小の席番号順 */
export function findIslands(layout: ClassroomLayout): number[][] {
  const desks = layout.desks.filter((d) => d.seats.length);
  const boxes = desks.map(deskBox);
  const parent = desks.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < desks.length; i++) {
    for (let j = i + 1; j < desks.length; j++) {
      if (boxGap(boxes[i], boxes[j]) <= ISLAND_GAP) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  desks.forEach((d, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), ...d.seats]);
  });
  return [...groups.values()].map((g) => g.sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}

// ---------- 机を並べて配置 ----------

export type ArrangeOptions = {
  type: DeskType;
  rows: number;
  cols: number;
  /** 机の中心どうしの間隔 */
  pitchX: number;
  pitchY: number;
  /** 左上の机の中心 */
  startX: number;
  startY: number;
  /** custom のときの席数・大きさ */
  customSeats?: number;
  customW?: number;
  customH?: number;
};

/** 机を rows × cols に並べる（席番号は firstNumber から） */
export function arrangeDesks(opts: ArrangeOptions, firstNumber: number, idPrefix: string): Desk[] {
  const desks: Desk[] = [];
  let n = firstNumber;
  const count = DESK_SPECS[opts.type].seatCount ?? Math.max(1, Math.min(CUSTOM_SEAT_MAX, opts.customSeats ?? 2));
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      const desk: Desk = {
        id: `${idPrefix}${r}-${c}`,
        type: opts.type,
        x: Math.round(opts.startX + c * opts.pitchX),
        y: Math.round(opts.startY + r * opts.pitchY),
        rotation: 0,
        seats: Array.from({ length: count }, () => n++),
      };
      if (opts.type === "custom") {
        desk.w = opts.customW ?? 120;
        desk.h = opts.customH ?? 40;
      }
      desks.push(desk);
    }
  }
  return desks;
}

/** n 個から k 個を均等な間隔で選ぶ（インデックスを返す） */
export function spreadIndexes(n: number, k: number): number[] {
  if (k >= n) return Array.from({ length: n }, (_, i) => i);
  if (k <= 0) return [];
  return Array.from({ length: k }, (_, i) => Math.floor(((i + 0.5) * n) / k));
}

/** 合計 total を重み weights に比例して整数配分する（最大剰余法） */
export function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  total = Math.min(total, sum); // 合計を超えては配れない
  const raw = weights.map((w) => (total * w) / sum);
  const result = raw.map(Math.floor);
  let rest = total - result.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    if (result[i] < weights[i]) {
      result[i]++;
      rest--;
    }
  }
  return result;
}

/**
 * 受講者数に合わせて「使用」する席を島ごとに均等に選ぶ。残りは予備席。
 * 戻り値は使用する席番号の集合。
 */
/** 使用席の選び方：even＝島ごとに全体へ均等に散らす、front＝黒板に近い席から詰める */
export type SeatFill = "even" | "front";

/**
 * 前方（黒板側）からの距離。黒板があれば黒板の面からの距離、なければ y（上が前）。
 * 黒板が横や後ろの壁にあっても、黒板に近いほど小さい。
 */
export function frontDistance(layout: ClassroomLayout): (p: { x: number; y: number }) => number {
  const board =
    layout.fixtures.find((f) => f.type === "board") ?? layout.fixtures.find((f) => f.type === "screen");
  if (!board) return (p) => p.y;
  const t = (board.rotation * Math.PI) / 180;
  // 黒板の面に垂直な向き（回転 0° のとき下向き）
  const nx = -Math.sin(t);
  const ny = Math.cos(t);
  return (p) => Math.abs((p.x - board.x) * nx + (p.y - board.y) * ny);
}

/**
 * 受講者数に合わせて「使用」する席を選ぶ。残りは予備席。戻り値は使用する席番号の集合。
 * - even：島ごとに、席数に比例して均等に散らす
 * - front：黒板に近い席から順に（同じ距離なら席番号の小さい順）
 */
export function chooseUsedSeats(layout: ClassroomLayout, enrolled: number, fill: SeatFill = "even"): Set<number> {
  const k = Math.max(0, Math.min(enrolled, layout.seats.length));
  if (fill === "front") {
    const dist = frontDistance(layout);
    // 同じ列（距離の差が 20 cm 以内）は席番号順にそろえる
    const ordered = [...layout.seats].sort((a, b) => {
      const d = dist(a) - dist(b);
      return Math.abs(d) > 20 ? d : a.number - b.number;
    });
    return new Set(ordered.slice(0, k).map((s) => s.number));
  }
  const islands = findIslands(layout);
  const counts = apportion(k, islands.map((i) => i.length));
  const used = new Set<number>();
  islands.forEach((island, idx) => {
    for (const i of spreadIndexes(island.length, counts[idx])) used.add(island[i]);
  });
  return used;
}

export type GroupMode = { kind: "none" } | { kind: "island" } | { kind: "count"; count: number };

export const GROUP_COLORS = [
  "#800b16", "#0041c2", "#1b7f3b", "#b35c00", "#6a3d9a", "#00838f", "#8d6e00", "#c2185b",
  "#455a64", "#5d4037",
];

export function groupName(index: number): string {
  // A, B, ..., Z, AA, AB, ...
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export type SeatPlan = {
  groups: { name: string; color: string; order: number }[];
  /** 席番号 → { status, groupIndex(なしは null) } */
  seats: { number: number; status: "used" | "spare"; groupIndex: number | null }[];
};

/** 講義の座席・グループ構成を決める */
export type GroupAssignment = {
  groups: { name: string; color: string; order: number }[];
  /** 席番号 → グループの番号（groups の添字） */
  groupOf: Map<number, number>;
};

/** 使用席 used をもとに、グループの分け方 mode でグループを決める（講義作成時・作り直し時に共通） */
export function assignGroups(layout: ClassroomLayout, used: ReadonlySet<number>, mode: GroupMode): GroupAssignment {
  const numbers = layout.seats.map((s) => s.number).sort((a, b) => a - b);
  const groupOf = new Map<number, number>();
  let groupCount = 0;

  if (mode.kind === "island") {
    const islands = findIslands(layout);
    groupCount = islands.length;
    islands.forEach((island, gi) => island.forEach((n) => groupOf.set(n, gi)));
  } else if (mode.kind === "count") {
    const usedSorted = numbers.filter((n) => used.has(n));
    groupCount = Math.max(1, Math.min(mode.count, Math.max(usedSorted.length, 1)));
    const sizes = apportion(usedSorted.length, Array(groupCount).fill(usedSorted.length));
    let i = 0;
    sizes.forEach((size, gi) => {
      for (let k = 0; k < size; k++) groupOf.set(usedSorted[i++], gi);
    });
    // 予備席は番号の近い使用席と同じグループにする
    for (const n of numbers) {
      if (groupOf.has(n)) continue;
      let best: number | undefined;
      for (const u of usedSorted) if (best === undefined || Math.abs(u - n) < Math.abs(best - n)) best = u;
      groupOf.set(n, best === undefined ? 0 : groupOf.get(best)!);
    }
  }

  return {
    groups: Array.from({ length: groupCount }, (_, i) => ({
      name: groupName(i),
      color: GROUP_COLORS[i % GROUP_COLORS.length],
      order: i,
    })),
    groupOf,
  };
}

/** 講義の座席・グループ構成を決める */
export function planLecture(
  layout: ClassroomLayout,
  enrolled: number,
  mode: GroupMode,
  fill: SeatFill = "even",
): SeatPlan {
  const used = chooseUsedSeats(layout, enrolled, fill);
  const numbers = layout.seats.map((s) => s.number).sort((a, b) => a - b);
  const { groups, groupOf } = assignGroups(layout, used, mode);
  return {
    groups,
    seats: numbers.map((n) => ({
      number: n,
      status: used.has(n) ? "used" : "spare",
      groupIndex: groupOf.has(n) ? groupOf.get(n)! : null,
    })),
  };
}

