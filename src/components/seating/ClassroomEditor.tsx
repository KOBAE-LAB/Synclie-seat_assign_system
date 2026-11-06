"use client";

import { useActionState, useCallback, useMemo, useRef, useState } from "react";
import { saveClassroomAction, type ActionState } from "@/app/teacher/seating-actions";
import {
  CUSTOM_SEAT_MAX,
  CUSTOM_SIZE_MAX,
  CUSTOM_SIZE_MIN,
  DESK_SPECS,
  deskSeatCount,
  FIXTURE_SPECS,
  normalizeRotation,
  rotationToFace,
  rotationToFaceWall,
  SEAT_RADIUS,
  type Desk,
  type DeskType,
  type Fixture,
  type FixtureType,
} from "@/lib/seating/geometry";
import {
  arrangeDesks,
  emptyLayout,
  findIslands,
  nextSeatNumber,
  renumberSeats,
  ROOM_MAX,
  ROOM_MIN,
  contentExtent,
  SEAT_MAX,
  withSeats,
  type ClassroomLayout,
} from "@/lib/seating/layout";
import { DeskBody, DeskFront, FixtureShape } from "./Shapes";

type Selection = { kind: "desk" | "fixture"; id: string } | null;
type Room = Omit<ClassroomLayout, "seats">;

const SNAP = 5;
const HISTORY_MAX = 50;
const DESK_TYPES = Object.keys(DESK_SPECS) as DeskType[];
const FIXTURE_TYPES = Object.keys(FIXTURE_SPECS) as FixtureType[];

/** 机の種類ごとの「並べて配置」の既定の間隔 */
const DEFAULT_PITCH: Record<DeskType, [number, number]> = {
  student: [80, 95],
  tablet: [70, 75],
  long2: [150, 100],
  trapezoid3: [180, 150],
  round4: [190, 190],
  custom: [160, 100],
};

const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
let idCounter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function toInt(v: string, fallback: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
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
  const [room, setRoomState] = useState<Room>(() => {
    const { seats: _seats, ...rest } = initialLayout ?? emptyLayout();
    void _seats;
    return rest;
  });
  const [history, setHistory] = useState<Room[]>([]);
  const [notice, setNotice] = useState("");
  const [roomDraft, setRoomDraft] = useState<{ width: string; height: string } | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [customSeats, setCustomSeats] = useState(3);
  const [customW, setCustomW] = useState(150);
  const [customH, setCustomH] = useState(45);
  const [arrange, setArrange] = useState({ type: "student" as DeskType, rows: 6, cols: 8, pitchX: 80, pitchY: 95, startX: 100, startY: 130 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ kind: "desk" | "fixture"; id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const layout = useMemo(() => withSeats(room), [room]);
  const islands = useMemo(() => findIslands(layout).length, [layout]);
  const selectedDesk = selection?.kind === "desk" ? room.desks.find((d) => d.id === selection.id) : undefined;
  const selectedFixture = selection?.kind === "fixture" ? room.fixtures.find((f) => f.id === selection.id) : undefined;
  const faceTarget =
    room.fixtures.find((f) => f.type === "board") ??
    room.fixtures.find((f) => f.type === "screen") ??
    room.fixtures.find((f) => f.type === "podium");

  /** 履歴に積んで更新（元に戻せる） */
  const update = useCallback((fn: (r: Room) => Room) => {
    setRoomState((prev) => {
      const next = fn(prev);
      if (next !== prev) setHistory((h) => [...h.slice(-HISTORY_MAX + 1), prev]);
      return next;
    });
  }, []);

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setRoomState(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  function placeAt(r: Room): { x: number; y: number } {
    const n = r.desks.length + r.fixtures.length;
    return { x: snap(clamp(r.width / 2 + (n % 5) * 20, 0, r.width)), y: snap(clamp(r.height / 2 + (n % 5) * 20, 0, r.height)) };
  }

  function addDesk(type: DeskType) {
    const deskId = newId("d");
    update((r) => {
      const first = nextSeatNumber(withSeats(r));
      const count = deskSeatCount(type, customSeats);
      const desk: Desk = { id: deskId, type, ...placeAt(r), rotation: 0, seats: Array.from({ length: count }, (_, i) => first + i) };
      if (type === "custom") {
        desk.w = customW;
        desk.h = customH;
      }
      return { ...r, desks: [...r.desks, desk] };
    });
    setSelection({ kind: "desk", id: deskId });
  }

  function addHexagon() {
    update((r) => {
      const first = nextSeatNumber(withSeats(r));
      const { x, y } = placeAt(r);
      const a: Desk = { id: newId("d"), type: "trapezoid3", x, y: y - 26, rotation: 0, seats: [first, first + 1, first + 2] };
      const b: Desk = { id: newId("d"), type: "trapezoid3", x, y: y + 26, rotation: 180, seats: [first + 3, first + 4, first + 5] };
      return { ...r, desks: [...r.desks, a, b] };
    });
  }

  function addFixture(type: FixtureType) {
    const fixtureId = newId("f");
    update((r) => {
      const spec = FIXTURE_SPECS[type];
      const pos = type === "board" ? { x: snap(r.width / 2), y: 20 } : placeAt(r);
      return { ...r, fixtures: [...r.fixtures, { id: fixtureId, type, ...pos, w: spec.w, h: spec.h, rotation: 0 }] };
    });
    setSelection({ kind: "fixture", id: fixtureId });
  }

  function patchDesk(deskId: string, patch: Partial<Desk>) {
    update((r) => ({ ...r, desks: r.desks.map((d) => (d.id === deskId ? { ...d, ...patch } : d)) }));
  }
  function patchFixture(fixtureId: string, patch: Partial<Fixture>) {
    update((r) => ({ ...r, fixtures: r.fixtures.map((f) => (f.id === fixtureId ? { ...f, ...patch } : f)) }));
  }

  function setCustomSeatCount(desk: Desk, count: number) {
    const n = clamp(count, 1, CUSTOM_SEAT_MAX);
    if (n === desk.seats.length) return;
    update((r) => {
      let next = nextSeatNumber(withSeats(r));
      const seats = n < desk.seats.length ? desk.seats.slice(0, n) : [...desk.seats, ...Array.from({ length: n - desk.seats.length }, () => next++)];
      return { ...r, desks: r.desks.map((d) => (d.id === desk.id ? { ...d, seats } : d)) };
    });
  }

  function removeSelected() {
    if (!selection) return;
    update((r) =>
      selection.kind === "desk"
        ? { ...r, desks: r.desks.filter((d) => d.id !== selection.id) }
        : { ...r, fixtures: r.fixtures.filter((f) => f.id !== selection.id) },
    );
    setSelection(null);
  }

  function duplicateSelected() {
    if (!selection) return;
    const copyId = newId(selection.kind === "desk" ? "d" : "f");
    update((r) => {
      if (selection.kind === "desk") {
        const d = r.desks.find((x) => x.id === selection.id);
        if (!d) return r;
        let n = nextSeatNumber(withSeats(r));
        const copy: Desk = { ...d, id: copyId, x: clamp(d.x + 40, 0, r.width), y: clamp(d.y + 40, 0, r.height), seats: d.seats.map(() => n++) };
        return { ...r, desks: [...r.desks, copy] };
      }
      const f = r.fixtures.find((x) => x.id === selection.id);
      if (!f) return r;
      return { ...r, fixtures: [...r.fixtures, { ...f, id: copyId, x: clamp(f.x + 40, 0, r.width), y: clamp(f.y + 40, 0, r.height) }] };
    });
    setSelection({ kind: selection.kind, id: copyId });
  }

  function rotateSelected(delta: number) {
    if (selectedDesk) patchDesk(selectedDesk.id, { rotation: normalizeRotation(selectedDesk.rotation + delta) });
    if (selectedFixture) patchFixture(selectedFixture.id, { rotation: normalizeRotation(selectedFixture.rotation + delta) });
  }

  /** fan = false：黒板に正対（平行）、fan = true：黒板の中心に向ける（扇形） */
  function faceBoard(only?: Desk, fan = false) {
    if (!faceTarget) return;
    update((r) => ({
      ...r,
      desks: r.desks.map((d) => {
        if ((only && d.id !== only.id) || d.type === "round4") return d;
        return { ...d, rotation: fan ? rotationToFace(d, faceTarget) : rotationToFaceWall(d, faceTarget) };
      }),
    }));
  }

  function moveSelected(dx: number, dy: number) {
    if (selectedDesk) patchDesk(selectedDesk.id, { x: clamp(selectedDesk.x + dx, 0, room.width), y: clamp(selectedDesk.y + dy, 0, room.height) });
    if (selectedFixture) patchFixture(selectedFixture.id, { x: clamp(selectedFixture.x + dx, 0, room.width), y: clamp(selectedFixture.y + dy, 0, room.height) });
  }

  function runArrange(replace: boolean) {
    const base = replace ? { ...room, desks: [] } : room;
    const desks = arrangeDesks(
      { ...arrange, customSeats, customW, customH },
      nextSeatNumber(withSeats(base)),
      newId("a"),
    ).filter((d) => d.x <= ROOM_MAX && d.y <= ROOM_MAX);
    const total = withSeats(base).seats.length + desks.reduce((n, d) => n + d.seats.length, 0);
    if (total > SEAT_MAX) {
      setNotice(`席が ${total} 席になるため並べられません（${SEAT_MAX} 席まで）。縦・横の数を減らしてください。`);
      return;
    }
    setNotice("");
    const fitted = fitRoom({ ...base, desks: [...base.desks, ...desks] });
    update(() => fitted);
    setSelection(null);
  }

  /** 机・備品が部屋からはみ出したら、部屋を広げて収める */
  function fitRoom(r: Room): Room {
    const need = contentExtent(r);
    if (need.width <= r.width && need.height <= r.height) return r;
    setNotice(`机が部屋に収まるよう、部屋を ${Math.max(r.width, need.width)} × ${Math.max(r.height, need.height)} cm に広げました。`);
    return { ...r, width: Math.min(ROOM_MAX, Math.max(r.width, need.width)), height: Math.min(ROOM_MAX, Math.max(r.height, need.height)) };
  }

  /** 部屋の大きさの入力を確定する（入力中は反映せず、欄を離れたときに反映。中身より小さくはしない） */
  function commitRoomSize(key: "width" | "height", text: string) {
    const need = contentExtent(room)[key];
    const n = clamp(toInt(text, room[key]), Math.max(ROOM_MIN, need), ROOM_MAX);
    if (n !== room[key]) update((r) => ({ ...r, [key]: n }));
    if (toInt(text, n) < need) setNotice(`机や備品が収まるよう、${key === "width" ? "幅" : "奥行き"}は ${need} cm 以上にしました。`);
  }

  // ---- ドラッグ ----
  function svgPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  function onItemPointerDown(e: React.PointerEvent, kind: "desk" | "fixture", item: { id: string; x: number; y: number }) {
    e.stopPropagation();
    e.preventDefault();
    setSelection({ kind, id: item.id });
    const p = svgPoint(e);
    dragRef.current = { kind, id: item.id, dx: p.x - item.x, dy: p.y - item.y, moved: false };
    svgRef.current?.setPointerCapture(e.pointerId);
    svgRef.current?.focus();
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(e);
    const x = snap(clamp(p.x - drag.dx, 0, room.width));
    const y = snap(clamp(p.y - drag.dy, 0, room.height));
    // ドラッグ開始時に 1 回だけ履歴に積み、移動中は履歴を増やさない
    const apply = (r: Room): Room =>
      drag.kind === "desk"
        ? { ...r, desks: r.desks.map((d) => (d.id === drag.id ? { ...d, x, y } : d)) }
        : { ...r, fixtures: r.fixtures.map((f) => (f.id === drag.id ? { ...f, x, y } : f)) };
    if (!drag.moved) {
      drag.moved = true;
      update(apply);
    } else {
      setRoomState(apply);
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 25 : SNAP;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (!selection) return;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveSelected(-step, 0),
      ArrowRight: () => moveSelected(step, 0),
      ArrowUp: () => moveSelected(0, -step),
      ArrowDown: () => moveSelected(0, step),
      Delete: removeSelected,
      Backspace: removeSelected,
      r: () => rotateSelected(5),
      R: () => rotateSelected(-5),
      Escape: () => setSelection(null),
    };
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }

  const gridLines = [];
  for (let x = 50; x < room.width; x += 50) gridLines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={room.height} />);
  for (let y = 50; y < room.height; y += 50) gridLines.push(<line key={`y${y}`} x1={0} y1={y} x2={room.width} y2={y} />);

  return (
    <form action={formAction} className="editor" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />

      <div className="editor__top">
        <label className="field">
          <span className="field__label">教室名</span>
          <input className="input" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <div className="editor__room">
          <label>
            部屋の幅{" "}
            <input className="input input--narrow" type="number" min={ROOM_MIN} max={ROOM_MAX} step={50}
              value={roomDraft?.width ?? String(room.width)}
              onChange={(e) => setRoomDraft({ width: e.target.value, height: roomDraft?.height ?? String(room.height) })}
              onBlur={(e) => { commitRoomSize("width", e.target.value); setRoomDraft(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /> cm
          </label>
          <label>
            奥行き{" "}
            <input className="input input--narrow" type="number" min={ROOM_MIN} max={ROOM_MAX} step={50}
              value={roomDraft?.height ?? String(room.height)}
              onChange={(e) => setRoomDraft({ width: roomDraft?.width ?? String(room.width), height: e.target.value })}
              onBlur={(e) => { commitRoomSize("height", e.target.value); setRoomDraft(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} /> cm
          </label>
        </div>
      </div>

      <div className="editor__body">
        <aside className="editor__palette" aria-label="追加する">
          <h3>机を置く</h3>
          <div className="palette-grid">
            {DESK_TYPES.map((t) => (
              <button key={t} type="button" className="palette-button" onClick={() => addDesk(t)}>
                {DESK_SPECS[t].label}
              </button>
            ))}
            <button type="button" className="palette-button" onClick={addHexagon}>
              六角形（台形×2）
            </button>
          </div>
          <details className="palette-details">
            <summary>カスタム机の設定</summary>
            <label>席数 <input className="input input--narrow" type="number" min={1} max={CUSTOM_SEAT_MAX} value={customSeats}
              onChange={(e) => setCustomSeats(clamp(toInt(e.target.value, 3), 1, CUSTOM_SEAT_MAX))} /></label>
            <label>幅 <input className="input input--narrow" type="number" min={CUSTOM_SIZE_MIN} max={CUSTOM_SIZE_MAX} step={5} value={customW}
              onChange={(e) => setCustomW(clamp(toInt(e.target.value, 150), CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX))} /> cm</label>
            <label>奥行き <input className="input input--narrow" type="number" min={CUSTOM_SIZE_MIN} max={CUSTOM_SIZE_MAX} step={5} value={customH}
              onChange={(e) => setCustomH(clamp(toInt(e.target.value, 45), CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX))} /> cm</label>
          </details>

          <h3>備品を置く</h3>
          <div className="palette-grid">
            {FIXTURE_TYPES.map((t) => (
              <button key={t} type="button" className="palette-button palette-button--fixture" onClick={() => addFixture(t)}>
                {FIXTURE_SPECS[t].label}
              </button>
            ))}
          </div>

          <h3>まとめて並べる</h3>
          <div className="arrange">
            <label>種類
              <select className="input" value={arrange.type}
                onChange={(e) => {
                  const type = e.target.value as DeskType;
                  const [pitchX, pitchY] = DEFAULT_PITCH[type];
                  setArrange((a) => ({ ...a, type, pitchX, pitchY }));
                }}>
                {DESK_TYPES.map((t) => <option key={t} value={t}>{DESK_SPECS[t].label}</option>)}
              </select>
            </label>
            <label>縦 <input className="input input--narrow" type="number" min={1} max={30} value={arrange.rows}
              onChange={(e) => setArrange((a) => ({ ...a, rows: clamp(toInt(e.target.value, 1), 1, 30) }))} /> 列</label>
            <label>横 <input className="input input--narrow" type="number" min={1} max={30} value={arrange.cols}
              onChange={(e) => setArrange((a) => ({ ...a, cols: clamp(toInt(e.target.value, 1), 1, 30) }))} /> 台</label>
            <label>左右の間隔 <input className="input input--narrow" type="number" min={20} max={1000} step={5} value={arrange.pitchX}
              onChange={(e) => setArrange((a) => ({ ...a, pitchX: clamp(toInt(e.target.value, 80), 20, 1000) }))} /> cm</label>
            <label>前後の間隔 <input className="input input--narrow" type="number" min={20} max={1000} step={5} value={arrange.pitchY}
              onChange={(e) => setArrange((a) => ({ ...a, pitchY: clamp(toInt(e.target.value, 95), 20, 1000) }))} /> cm</label>
            <label>左上の位置 x <input className="input input--narrow" type="number" min={0} max={room.width} step={5} value={arrange.startX}
              onChange={(e) => setArrange((a) => ({ ...a, startX: clamp(toInt(e.target.value, 100), 0, room.width) }))} /></label>
            <label>y <input className="input input--narrow" type="number" min={0} max={room.height} step={5} value={arrange.startY}
              onChange={(e) => setArrange((a) => ({ ...a, startY: clamp(toInt(e.target.value, 130), 0, room.height) }))} /></label>
            <div className="stack">
              <button type="button" className="button button--secondary button--small" onClick={() => runArrange(true)}>机を置き換える</button>
              <button type="button" className="button button--secondary button--small" onClick={() => runArrange(false)}>追加する</button>
            </div>
            <p className="small muted">通路を作るときは、間隔を変えて何回かに分けて「追加する」と便利です。</p>
          </div>
        </aside>

        <div className="editor__canvas-wrap">
          <div className="editor__toolbar">
            <button type="button" className="button button--secondary button--small" onClick={undo} disabled={!history.length}>元に戻す</button>
            <button type="button" className="button button--secondary button--small" onClick={() => faceBoard()} disabled={!faceTarget || !room.desks.length}
              title={faceTarget ? "" : "黒板・スクリーン・教卓のどれかを置いてください"}>
              すべての机を黒板に向ける
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => faceBoard(undefined, true)} disabled={!faceTarget || !room.desks.length}
              title="黒板の中心に向けて、扇形に並べます">
              扇形に黒板の中心へ向ける
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => update((r) => renumberSeats(withSeats(r)))} disabled={!room.desks.length}>
              席番号を前から振り直す
            </button>
            <button type="button" className="button button--secondary button--small"
              onClick={() => { if (window.confirm("机と備品をすべて消しますか？")) { update((r) => ({ ...r, desks: [], fixtures: [] })); setSelection(null); } }}>
              すべて消す
            </button>
            <span className="editor__summary">席 <strong>{layout.seats.length}</strong>・机 {room.desks.length}・島 {islands}</span>
          </div>

          <svg
            ref={svgRef}
            className="editor__svg"
            viewBox={`-20 -20 ${room.width + 40} ${room.height + 40}`}
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={() => setSelection(null)}
            onKeyDown={onKeyDown}
            aria-label="教室の配置。机や備品を押して選び、ドラッグで動かせます。矢印キーで移動、R で回転、Delete で削除。"
          >
            <rect className="room" x={0} y={0} width={room.width} height={room.height} />
            <g className="room-grid">{gridLines}</g>
            {room.fixtures.map((f) => (
              <g key={f.id} className="draggable" onPointerDown={(e) => onItemPointerDown(e, "fixture", f)}>
                <FixtureShape fixture={f} selected={selection?.kind === "fixture" && selection.id === f.id} />
              </g>
            ))}
            {room.desks.map((d) => {
              const selected = selection?.kind === "desk" && selection.id === d.id;
              return (
                <g key={d.id} className="draggable" onPointerDown={(e) => onItemPointerDown(e, "desk", d)}>
                  <DeskBody desk={d} selected={selected} />
                  <DeskFront desk={d} />
                </g>
              );
            })}
            {layout.seats.map((s) => (
              <g key={s.number} className="seat-dot seat-dot--edit"
                onPointerDown={(e) => {
                  const d = room.desks.find((x) => x.id === s.deskId);
                  if (d) onItemPointerDown(e, "desk", d);
                }}>
                <circle cx={s.x} cy={s.y} r={SEAT_RADIUS} vectorEffect="non-scaling-stroke" />
                <text x={s.x} y={s.y + 6} textAnchor="middle">{s.number}</text>
              </g>
            ))}
          </svg>
          <p className="small muted">
            上が前（黒板側）です。机の小さな三角が机の向きです。押して選び、ドラッグで移動。選んだ状態で 矢印キー＝移動（Shift で大きく）、R＝回転、Delete＝削除、Ctrl/⌘+D＝複製、Ctrl/⌘+Z＝元に戻す。
          </p>
        </div>

        <aside className="editor__props" aria-label="選んだものの設定">
          {selectedDesk ? (
            <>
              <h3>{DESK_SPECS[selectedDesk.type].label}</h3>
              <p className="small">席番号：{selectedDesk.seats.join("・")}</p>
              <RotationControl value={selectedDesk.rotation} onChange={(rotation) => patchDesk(selectedDesk.id, { rotation })} />
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(selectedDesk)} disabled={!faceTarget || selectedDesk.type === "round4"}>
                黒板の方を向く
              </button>
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(selectedDesk, true)} disabled={!faceTarget || selectedDesk.type === "round4"}>
                黒板の中心に向ける
              </button>
              {selectedDesk.type === "custom" ? (
                <div className="props-fields">
                  <label>席数 <input className="input input--narrow" type="number" min={1} max={CUSTOM_SEAT_MAX} value={selectedDesk.seats.length}
                    onChange={(e) => setCustomSeatCount(selectedDesk, toInt(e.target.value, selectedDesk.seats.length))} /></label>
                  <label>幅 <input className="input input--narrow" type="number" min={CUSTOM_SIZE_MIN} max={CUSTOM_SIZE_MAX} step={5} value={selectedDesk.w ?? 120}
                    onChange={(e) => patchDesk(selectedDesk.id, { w: clamp(toInt(e.target.value, 120), CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX) })} /> cm</label>
                  <label>奥行き <input className="input input--narrow" type="number" min={CUSTOM_SIZE_MIN} max={CUSTOM_SIZE_MAX} step={5} value={selectedDesk.h ?? 40}
                    onChange={(e) => patchDesk(selectedDesk.id, { h: clamp(toInt(e.target.value, 40), CUSTOM_SIZE_MIN, CUSTOM_SIZE_MAX) })} /> cm</label>
                </div>
              ) : null}
              <ItemButtons onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </>
          ) : selectedFixture ? (
            <>
              <h3>{FIXTURE_SPECS[selectedFixture.type].label}</h3>
              <RotationControl value={selectedFixture.rotation} onChange={(rotation) => patchFixture(selectedFixture.id, { rotation })} />
              <div className="props-fields">
                <label>幅 <input className="input input--narrow" type="number" min={4} max={ROOM_MAX} step={5} value={selectedFixture.w}
                  onChange={(e) => patchFixture(selectedFixture.id, { w: clamp(toInt(e.target.value, selectedFixture.w), 4, ROOM_MAX) })} /> cm</label>
                <label>奥行き <input className="input input--narrow" type="number" min={4} max={ROOM_MAX} step={5} value={selectedFixture.h}
                  onChange={(e) => patchFixture(selectedFixture.id, { h: clamp(toInt(e.target.value, selectedFixture.h), 4, ROOM_MAX) })} /> cm</label>
                <label>表示名 <input className="input" maxLength={30} value={selectedFixture.label ?? ""} placeholder={FIXTURE_SPECS[selectedFixture.type].label}
                  onChange={(e) => patchFixture(selectedFixture.id, { label: e.target.value || undefined })} /></label>
              </div>
              <ItemButtons onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </>
          ) : (
            <p className="small muted">机や備品を押すと、ここで回転・向き・大きさを変えられます。</p>
          )}
        </aside>
      </div>

      {notice ? <p className="notice" role="status">{notice}</p> : null}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="stack" style={{ marginTop: 16 }}>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "保存中…" : "保存する"}
        </button>
      </div>
    </form>
  );
}

function RotationControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="rotation">
      <span className="field__label">回転</span>
      <div className="stack">
        <button type="button" className="button button--secondary button--small" onClick={() => onChange(normalizeRotation(value - 5))} aria-label="左に5度回す">⟲ 5°</button>
        <input className="input input--narrow" type="number" step={5} value={value} aria-label="回転角（度）"
          onChange={(e) => onChange(normalizeRotation(toInt(e.target.value, value)))} />
        <button type="button" className="button button--secondary button--small" onClick={() => onChange(normalizeRotation(value + 5))} aria-label="右に5度回す">⟳ 5°</button>
      </div>
      <div className="stack">
        {[0, 90, 180, 270].map((deg) => (
          <button key={deg} type="button" className="button button--secondary button--small" onClick={() => onChange(deg)}>{deg}°</button>
        ))}
      </div>
    </div>
  );
}

function ItemButtons({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="stack" style={{ marginTop: 12 }}>
      <button type="button" className="button button--secondary button--small" onClick={onDuplicate}>複製</button>
      <button type="button" className="button button--secondary button--small" onClick={onDelete}>削除</button>
    </div>
  );
}
