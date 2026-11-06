"use client";

import { useActionState, useMemo, useState } from "react";
import { saveClassroomAction, type ActionState } from "@/app/teacher/seating-actions";
import { buildLayout, findIslands, GRID_MAX, templateCells, type ClassroomLayout } from "@/lib/seating/layout";

const key = (r: number, c: number) => `${r},${c}`;

function clamp(n: number) {
  return Math.max(1, Math.min(GRID_MAX, Math.floor(n) || 1));
}

export function ClassroomEditor({
  id,
  initialName = "",
  initialLayout,
}: {
  id?: number;
  initialName?: string;
  initialLayout?: ClassroomLayout;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveClassroomAction, {});
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState(initialLayout?.rows ?? 6);
  const [cols, setCols] = useState(initialLayout?.cols ?? 8);
  const [cells, setCells] = useState<Set<string>>(
    () => new Set((initialLayout?.seats ?? []).map((s) => key(s.row, s.col))),
  );
  const [islandWidth, setIslandWidth] = useState(2);
  const [islandHeight, setIslandHeight] = useState(0);

  const layout = useMemo(() => {
    const list = [...cells].map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    });
    return buildLayout(rows, cols, list);
  }, [cells, rows, cols]);
  const numberAt = useMemo(() => new Map(layout.seats.map((s) => [key(s.row, s.col), s.number])), [layout]);
  const islandCount = useMemo(() => findIslands(layout).length, [layout]);

  function toggle(r: number, c: number) {
    setCells((prev) => {
      const next = new Set(prev);
      const k = key(r, c);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function applyTemplate() {
    setCells(new Set(templateCells(rows, cols, islandWidth, islandHeight).map((c) => key(c.row, c.col))));
  }

  return (
    <form action={formAction}>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />

      <label className="field">
        <span className="field__label">教室名</span>
        <input className="input" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
      </label>

      <fieldset className="editor-panel">
        <legend>マス目の大きさ</legend>
        <div className="stack">
          <label>
            横（列）{" "}
            <input className="input input--narrow" type="number" min={1} max={GRID_MAX} value={cols}
              onChange={(e) => setCols(clamp(Number(e.target.value)))} />
          </label>
          <label>
            縦（行）{" "}
            <input className="input input--narrow" type="number" min={1} max={GRID_MAX} value={rows}
              onChange={(e) => setRows(clamp(Number(e.target.value)))} />
          </label>
        </div>
      </fieldset>

      <fieldset className="editor-panel">
        <legend>ひな形で一気に並べる</legend>
        <div className="stack">
          <label>
            横に{" "}
            <input className="input input--narrow" type="number" min={0} max={GRID_MAX} value={islandWidth}
              onChange={(e) => setIslandWidth(Math.max(0, Number(e.target.value) || 0))} />{" "}
            席ごとに通路
          </label>
          <label>
            縦に{" "}
            <input className="input input--narrow" type="number" min={0} max={GRID_MAX} value={islandHeight}
              onChange={(e) => setIslandHeight(Math.max(0, Number(e.target.value) || 0))} />{" "}
            席ごとに通路
          </label>
          <button type="button" className="button button--secondary" onClick={applyTemplate}>
            この形で並べる
          </button>
          <button type="button" className="button button--secondary" onClick={() => setCells(new Set())}>
            すべて消す
          </button>
        </div>
        <p className="small muted">0 にするとその方向の通路は入りません。上下左右でつながった席のかたまりが 1 つの「島」になります。</p>
      </fieldset>

      <p>
        マスを押すと席を置く／外すができます。<strong>席 {layout.seats.length}</strong>・島 {islandCount}
      </p>

      <div className="seat-map">
        <div className="seat-map__board">黒板・前</div>
        <div className="seat-map__grid seat-map__grid--editor" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 56px))` }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const n = numberAt.get(key(r, c));
            return (
              <button
                type="button"
                key={key(r, c)}
                className={n ? "seat seat--edit" : "seat seat--empty"}
                onClick={() => toggle(r, c)}
                aria-label={n ? `${n}番の席（押すと外す）` : `${r + 1}行${c + 1}列（押すと席を置く）`}
              >
                {n ?? ""}
              </button>
            );
          })}
        </div>
      </div>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="stack" style={{ marginTop: 16 }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "保存中…" : "保存する"}
        </button>
      </div>
    </form>
  );
}
