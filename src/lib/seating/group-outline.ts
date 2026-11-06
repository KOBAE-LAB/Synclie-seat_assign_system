/**
 * グループの囲み線の形を決める（純粋関数）。
 * 同じグループの席を最短でつなぐ線（最小全域木）を引き、席の丸とその線を太く描いて重ねることで、
 * L 字などの形にも沿った囲みにする。隣のグループの席はつながないので、囲みが重なりにくい。
 */

export type Pt = { x: number; y: number };

/** 点どうしを最短でつなぐ辺（プリム法）。点が 1 つなら辺なし */
export function minimumSpanningEdges(points: Pt[]): [number, number][] {
  const n = points.length;
  if (n < 2) return [];
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const from = new Array(n).fill(-1);
  const edges: [number, number][] = [];
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) edges.push([from[u], u]);
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = Math.hypot(points[u].x - points[v].x, points[u].y - points[v].y);
      if (d < best[v]) {
        best[v] = d;
        from[v] = u;
      }
    }
  }
  return edges;
}

export type GroupOutline = {
  key: string;
  name: string;
  color: string;
  points: Pt[];
  edges: [number, number][];
  /** グループ名の札を置く位置（いちばん前・左の席の左上） */
  badge: Pt;
};

/** 席の位置とグループ（名前・色）から、グループごとの囲みを作る */
export function groupOutlines(
  seats: { x: number; y: number; name: string | null | undefined; color: string | null | undefined }[],
  radius: number,
): GroupOutline[] {
  const groups = new Map<string, { name: string; color: string; points: Pt[] }>();
  for (const s of seats) {
    if (!s.name || !s.color) continue;
    const key = `${s.name}\u0000${s.color}`;
    const g = groups.get(key) ?? { name: s.name, color: s.color, points: [] };
    g.points.push({ x: s.x, y: s.y });
    groups.set(key, g);
  }
  return [...groups.entries()].map(([key, g]) => {
    const minY = Math.min(...g.points.map((p) => p.y));
    const minX = Math.min(...g.points.map((p) => p.x));
    return {
      key,
      name: g.name,
      color: g.color,
      points: g.points,
      edges: minimumSpanningEdges(g.points),
      badge: { x: minX - radius, y: minY - radius },
    };
  });
}
