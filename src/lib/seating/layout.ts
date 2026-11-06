/**
 * 教室レイアウト（簡易版：マス目方式）と、講義の座席割り当てを決める純粋関数。
 * 前方（row = 0 側）に黒板がある前提。席番号は前列の左から右へ、後ろへ向かって振る。
 */

export const GRID_MIN = 1;
export const GRID_MAX = 30;
export const SEAT_MAX = 300;

export type GridSeat = { number: number; row: number; col: number };

export type ClassroomLayout = {
  version: 1;
  kind: "grid";
  rows: number;
  cols: number;
  seats: GridSeat[];
  desks: unknown[];
  fixtures: { type: "board"; position: "front" }[];
};

export function emptyLayout(rows = 6, cols = 8): ClassroomLayout {
  return { version: 1, kind: "grid", rows, cols, seats: [], desks: [], fixtures: [{ type: "board", position: "front" }] };
}

/** 選択されたマスから席番号付きのレイアウトを作る（番号は前列左から） */
export function buildLayout(rows: number, cols: number, cells: { row: number; col: number }[]): ClassroomLayout {
  const key = (r: number, c: number) => r * cols + c;
  const unique = new Map<number, { row: number; col: number }>();
  for (const cell of cells) {
    if (cell.row < 0 || cell.row >= rows || cell.col < 0 || cell.col >= cols) continue;
    unique.set(key(cell.row, cell.col), cell);
  }
  const sorted = [...unique.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  return {
    ...emptyLayout(rows, cols),
    seats: sorted.map((c, i) => ({ number: i + 1, row: c.row, col: c.col })),
  };
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/** 外部から来た JSON を検証してレイアウトにする。不正なら null */
export function parseLayout(input: unknown): ClassroomLayout | null {
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!isInt(o.rows, GRID_MIN, GRID_MAX) || !isInt(o.cols, GRID_MIN, GRID_MAX)) return null;
  if (!Array.isArray(o.seats) || o.seats.length > SEAT_MAX) return null;
  const rows = o.rows;
  const cols = o.cols;
  const cells: { row: number; col: number }[] = [];
  for (const s of o.seats) {
    if (!s || typeof s !== "object") return null;
    const { row, col } = s as Record<string, unknown>;
    if (!isInt(row, 0, rows - 1) || !isInt(col, 0, cols - 1)) return null;
    cells.push({ row, col });
  }
  return buildLayout(rows, cols, cells);
}

/** 上下左右でつながった席のかたまり（島）ごとに席番号をまとめる。島は最小の席番号順 */
export function findIslands(layout: ClassroomLayout): number[][] {
  const byPos = new Map<string, GridSeat>();
  for (const s of layout.seats) byPos.set(`${s.row},${s.col}`, s);
  const seen = new Set<number>();
  const islands: number[][] = [];
  for (const start of [...layout.seats].sort((a, b) => a.number - b.number)) {
    if (seen.has(start.number)) continue;
    const island: number[] = [];
    const stack = [start];
    seen.add(start.number);
    while (stack.length) {
      const s = stack.pop()!;
      island.push(s.number);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = byPos.get(`${s.row + dr},${s.col + dc}`);
        if (n && !seen.has(n.number)) {
          seen.add(n.number);
          stack.push(n);
        }
      }
    }
    islands.push(island.sort((a, b) => a - b));
  }
  return islands;
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
export function chooseUsedSeats(layout: ClassroomLayout, enrolled: number): Set<number> {
  const islands = findIslands(layout);
  const counts = apportion(Math.min(enrolled, layout.seats.length), islands.map((i) => i.length));
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
export function planLecture(layout: ClassroomLayout, enrolled: number, mode: GroupMode): SeatPlan {
  const used = chooseUsedSeats(layout, enrolled);
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
    seats: numbers.map((n) => ({
      number: n,
      status: used.has(n) ? "used" : "spare",
      groupIndex: groupOf.has(n) ? groupOf.get(n)! : null,
    })),
  };
}

/**
 * よく使う形のひな形。islandWidth 列ごと・islandHeight 行ごとに通路（空きマス）を入れる。
 * 0 を指定した方向には通路を入れない。
 */
export function templateCells(
  rows: number,
  cols: number,
  islandWidth: number,
  islandHeight = 0,
): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = [];
  for (let r = 0; r < rows; r++) {
    if (islandHeight > 0 && (r + 1) % (islandHeight + 1) === 0) continue;
    for (let c = 0; c < cols; c++) {
      if (islandWidth > 0 && (c + 1) % (islandWidth + 1) === 0) continue;
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}
