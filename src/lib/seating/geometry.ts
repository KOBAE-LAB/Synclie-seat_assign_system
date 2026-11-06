/**
 * 机・備品の形と座席位置（純粋関数）。
 * 座標の単位はおおよそ cm。y が小さいほど前（黒板側）。
 * 回転 0° のとき、机の「前」は上（-y 方向）を向き、座席は机の後ろ（+y 側）にある。
 */

// tablet はテーブル付き椅子（袖付き椅子）。保存済みデータとの互換のため内部名は変えない
export type DeskType = "student" | "tablet" | "long2" | "trapezoid3" | "round4" | "custom";
export type FixtureType = "board" | "podium" | "screen" | "door" | "window" | "pillar" | "other";

export type Desk = {
  id: string;
  type: DeskType;
  x: number;
  y: number;
  /** 度（時計回り）。5° 刻み */
  rotation: number;
  /** この机の座席番号（座席の数だけ） */
  seats: number[];
  /** custom のみ：幅・奥行き */
  w?: number;
  h?: number;
};

export type Fixture = {
  id: string;
  type: FixtureType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label?: string;
};

export type Point = { x: number; y: number };

export type Outline =
  | { kind: "rect"; w: number; h: number }
  | { kind: "polygon"; points: Point[] }
  | { kind: "circle"; r: number };

export const SEAT_RADIUS = 18;
export const CUSTOM_SEAT_MAX = 12;
export const CUSTOM_SIZE_MIN = 20;
export const CUSTOM_SIZE_MAX = 600;

type DeskSpec = {
  label: string;
  /** 固定の席数（custom は可変） */
  seatCount: number | null;
  outline: (d: Desk) => Outline;
  seatOffsets: (d: Desk) => Point[];
};

// 台形（下底 120・上底 60・高さ 52）。下底どうしを合わせて 2 つ並べると六角形になる
const TRAPEZOID: Point[] = [
  { x: -60, y: 26 },
  { x: 60, y: 26 },
  { x: 30, y: -26 },
  { x: -30, y: -26 },
];

export const DESK_SPECS: Record<DeskType, DeskSpec> = {
  student: {
    label: "学生机",
    seatCount: 1,
    outline: () => ({ kind: "rect", w: 60, h: 40 }),
    seatOffsets: () => [{ x: 0, y: 42 }],
  },
  tablet: {
    label: "テーブル付き椅子",
    seatCount: 1,
    outline: () => ({ kind: "polygon", points: [{ x: -10, y: -28 }, { x: 30, y: -28 }, { x: 30, y: -6 }, { x: -10, y: -6 }] }),
    seatOffsets: () => [{ x: 0, y: 6 }],
  },
  long2: {
    label: "長机（2人）",
    seatCount: 2,
    outline: () => ({ kind: "rect", w: 120, h: 40 }),
    seatOffsets: () => [{ x: -30, y: 42 }, { x: 30, y: 42 }],
  },
  trapezoid3: {
    label: "台形（3人）",
    seatCount: 3,
    outline: () => ({ kind: "polygon", points: TRAPEZOID }),
    // 上底の外側と、左右の斜辺の外側
    seatOffsets: () => [{ x: -64, y: -11 }, { x: 0, y: -48 }, { x: 64, y: -11 }],
  },
  round4: {
    label: "丸テーブル（4人）",
    seatCount: 4,
    outline: () => ({ kind: "circle", r: 45 }),
    seatOffsets: () => [{ x: 0, y: -66 }, { x: 66, y: 0 }, { x: 0, y: 66 }, { x: -66, y: 0 }],
  },
  custom: {
    label: "カスタム",
    seatCount: null,
    outline: (d) => ({ kind: "rect", w: d.w ?? 120, h: d.h ?? 40 }),
    seatOffsets: (d) => {
      const w = d.w ?? 120;
      const h = d.h ?? 40;
      const n = d.seats.length;
      return Array.from({ length: n }, (_, i) => ({ x: -w / 2 + (w * (i + 0.5)) / n, y: h / 2 + 22 }));
    },
  },
};

export const FIXTURE_SPECS: Record<FixtureType, { label: string; w: number; h: number; fill: string }> = {
  board: { label: "黒板", w: 360, h: 16, fill: "#2f4f3a" },
  podium: { label: "教卓", w: 100, h: 50, fill: "#8d6e63" },
  screen: { label: "スクリーン", w: 220, h: 8, fill: "#9e9e9e" },
  door: { label: "ドア", w: 90, h: 10, fill: "#b35c00" },
  window: { label: "窓", w: 160, h: 8, fill: "#4fa3d1" },
  pillar: { label: "柱", w: 50, h: 50, fill: "#757575" },
  other: { label: "その他", w: 100, h: 60, fill: "#bdbdbd" },
};

export function deskSeatCount(type: DeskType, customCount = 2): number {
  return DESK_SPECS[type].seatCount ?? customCount;
}

/** 角度を 0〜355 の 5° 刻みにそろえる */
export function normalizeRotation(deg: number): number {
  const r = Math.round(deg / 5) * 5;
  return ((r % 360) + 360) % 360;
}

/** 局所座標の点を、位置 (x, y)・回転 rotation の物体の座標系から部屋の座標へ */
export function toRoom(p: Point, at: { x: number; y: number; rotation: number }): Point {
  const t = (at.rotation * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return { x: at.x + p.x * cos - p.y * sin, y: at.y + p.x * sin + p.y * cos };
}

/** 机の座席の部屋座標（desk.seats と同じ順） */
export function deskSeatPositions(desk: Desk): Point[] {
  return DESK_SPECS[desk.type].seatOffsets(desk).map((p) => toRoom(p, desk));
}

function outlinePoints(o: Outline): Point[] {
  if (o.kind === "rect") {
    return [
      { x: -o.w / 2, y: -o.h / 2 },
      { x: o.w / 2, y: -o.h / 2 },
      { x: o.w / 2, y: o.h / 2 },
      { x: -o.w / 2, y: o.h / 2 },
    ];
  }
  if (o.kind === "polygon") return o.points;
  return Array.from({ length: 16 }, (_, i) => ({
    x: o.r * Math.cos((i * Math.PI) / 8),
    y: o.r * Math.sin((i * Math.PI) / 8),
  }));
}

export type Box = { minX: number; minY: number; maxX: number; maxY: number };

function boxOf(points: Point[], pad = 0): Box {
  return {
    minX: Math.min(...points.map((p) => p.x)) - pad,
    minY: Math.min(...points.map((p) => p.y)) - pad,
    maxX: Math.max(...points.map((p) => p.x)) + pad,
    maxY: Math.max(...points.map((p) => p.y)) + pad,
  };
}

export function mergeBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/** 机（座席を含む）の外接矩形 */
export function deskBox(desk: Desk): Box {
  const body = outlinePoints(DESK_SPECS[desk.type].outline(desk)).map((p) => toRoom(p, desk));
  const seatBoxes = deskSeatPositions(desk).map((p) => boxOf([p], SEAT_RADIUS));
  return mergeBoxes([boxOf(body), ...seatBoxes])!;
}

export function fixtureBox(f: Fixture): Box {
  const pts = outlinePoints({ kind: "rect", w: f.w, h: f.h }).map((p) => toRoom(p, f));
  return boxOf(pts);
}

/** 2 つの矩形のすき間（重なっていれば 0） */
export function boxGap(a: Box, b: Box): number {
  const dx = Math.max(0, Math.max(a.minX, b.minX) - Math.min(a.maxX, b.maxX));
  const dy = Math.max(0, Math.max(a.minY, b.minY) - Math.min(a.maxY, b.maxY));
  return Math.hypot(dx, dy);
}

/** 机の前（回転 0° で上）が target を向く回転角（5° 刻み） */
export function rotationToFace(from: Point, target: Point): number {
  const deg = (Math.atan2(target.x - from.x, -(target.y - from.y)) * 180) / Math.PI;
  return normalizeRotation(deg);
}

/**
 * 黒板（壁に沿った細長い備品）に正対する回転角。
 * 黒板の面に垂直な向きのうち、机から黒板へ向かう側を選ぶ（黒板が横の壁にあっても使える）。
 */
export function rotationToFaceWall(from: Point, wall: { x: number; y: number; rotation: number }): number {
  const t = (wall.rotation * Math.PI) / 180;
  // 回転 0° の黒板の法線は (0, 1)（部屋の内側＝下向き）
  const nx = -Math.sin(t);
  const ny = Math.cos(t);
  const toward = (wall.x - from.x) * nx + (wall.y - from.y) * ny;
  const fx = toward >= 0 ? nx : -nx;
  const fy = toward >= 0 ? ny : -ny;
  return normalizeRotation((Math.atan2(fx, -fy) * 180) / Math.PI);
}
