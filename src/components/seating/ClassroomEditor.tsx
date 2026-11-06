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

type Kind = "desk" | "fixture";
/** 選択中の机・備品（"desk:ID" / "fixture:ID"） */
type Selection = ReadonlySet<string>;
const selKey = (kind: Kind, id: string) => `${kind}:${id}`;
const EMPTY: Selection = new Set();
type Room = Omit<ClassroomLayout, "seats">;

const SNAP = 5;
const SEAT_NUMBER_MAX = 9999;
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
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const [multiMode, setMultiMode] = useState(false);
  /** 「クリックで番号を振る」中なら、次に振る番号 */
  const [numbering, setNumbering] = useState<number | null>(null);
  const [numberingStart, setNumberingStart] = useState("1");
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [customSeats, setCustomSeats] = useState(3);
  const [customW, setCustomW] = useState(150);
  const [customH, setCustomH] = useState(45);
  const [arrange, setArrange] = useState({ type: "student" as DeskType, rows: 6, cols: 8, pitchX: 80, pitchY: 95, startX: 100, startY: 130 });
  const svgRef = useRef<SVGSVGElement>(null);
  /** ドラッグ中の情報：開始位置と、動かす机・備品の開始座標 */
  const dragRef = useRef<{
    startX: number;
    startY: number;
    items: { kind: Kind; id: string; x: number; y: number }[];
    moved: boolean;
    /** 選択済みの 1 つを押しただけ（動かさず離した）なら、それだけを選び直す */
    pendingSingle: { kind: Kind; id: string } | null;
  } | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; additive: boolean } | null>(null);

  const layout = useMemo(() => withSeats(room), [room]);
  const islands = useMemo(() => findIslands(layout).length, [layout]);
  const isSelected = (kind: Kind, id: string) => selection.has(selKey(kind, id));
  const selectedDesks = room.desks.filter((d) => isSelected("desk", d.id));
  const selectedFixtures = room.fixtures.filter((f) => isSelected("fixture", f.id));
  const selectedCount = selectedDesks.length + selectedFixtures.length;
  // 1 つだけ選んでいるときは、その机・備品の詳しい設定を出す
  const selectedDesk = selectedCount === 1 ? selectedDesks[0] : undefined;
  const selectedFixture = selectedCount === 1 ? selectedFixtures[0] : undefined;
  const selectOnly = (kind: Kind, id: string) => setSelection(new Set([selKey(kind, id)]));
  const clearSelection = () => setSelection(EMPTY);
  const selectAll = () =>
    setSelection(new Set([...room.desks.map((d) => selKey("desk", d.id)), ...room.fixtures.map((f) => selKey("fixture", f.id))]));
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
    selectOnly("desk", deskId);
  }

  function addHexagon() {
    const ids = [newId("d"), newId("d")];
    update((r) => {
      const first = nextSeatNumber(withSeats(r));
      const { x, y } = placeAt(r);
      const a: Desk = { id: ids[0], type: "trapezoid3", x, y: y - 26, rotation: 0, seats: [first, first + 1, first + 2] };
      const b: Desk = { id: ids[1], type: "trapezoid3", x, y: y + 26, rotation: 180, seats: [first + 3, first + 4, first + 5] };
      return { ...r, desks: [...r.desks, a, b] };
    });
    // 2 つまとめて選んでおき、そのまま一緒に動かせるようにする
    setSelection(new Set(ids.map((i) => selKey("desk", i))));
  }

  function addFixture(type: FixtureType) {
    const fixtureId = newId("f");
    update((r) => {
      const spec = FIXTURE_SPECS[type];
      const pos = type === "board" ? { x: snap(r.width / 2), y: 20 } : placeAt(r);
      return { ...r, fixtures: [...r.fixtures, { id: fixtureId, type, ...pos, w: spec.w, h: spec.h, rotation: 0 }] };
    });
    selectOnly("fixture", fixtureId);
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

  /**
   * 席番号を手で変える。その番号をほかの席が使っていれば、その席と番号を入れ替える（番号が重ならない）。
   * 戻り値は入れ替えた相手の席番号（なければ null）
   */
  function setSeatNumber(deskId: string, index: number, n: number) {
    if (!Number.isInteger(n) || n < 1 || n > SEAT_NUMBER_MAX) {
      setNotice(`席番号は 1〜${SEAT_NUMBER_MAX} の整数にしてください。`);
      return;
    }
    const desk = room.desks.find((d) => d.id === deskId);
    const old = desk?.seats[index];
    if (old === undefined || old === n) return;
    const holder = room.desks.find((d) => d.seats.includes(n));
    update((r) => ({
      ...r,
      desks: r.desks.map((d) => {
        if (d.id !== deskId && !d.seats.includes(n)) return d;
        return {
          ...d,
          seats: d.seats.map((v, i) => (d.id === deskId && i === index ? n : v === n ? old : v)),
        };
      }),
    }));
    setNotice(holder ? `${n}番を使っていた席と入れ替えました（その席は ${old}番になりました）。` : "");
  }

  /** 「クリックで番号を振る」で席を押したとき */
  function numberSeat(deskId: string, seatNumber: number) {
    if (numbering === null) return;
    const desk = room.desks.find((d) => d.id === deskId);
    const index = desk ? desk.seats.indexOf(seatNumber) : -1;
    if (index < 0) return;
    if (numbering > SEAT_NUMBER_MAX) {
      setNotice(`席番号は ${SEAT_NUMBER_MAX} までです。`);
      return;
    }
    setSeatNumber(deskId, index, numbering);
    setNumbering(numbering + 1);
  }

  function startNumbering() {
    const n = toInt(numberingStart, 1);
    if (n < 1 || n > SEAT_NUMBER_MAX) {
      setNotice(`開始番号は 1〜${SEAT_NUMBER_MAX} にしてください。`);
      return;
    }
    clearSelection();
    setNotice("");
    setNumbering(n);
  }

  function removeSelected() {
    if (!selectedCount) return;
    update((r) => ({
      ...r,
      desks: r.desks.filter((d) => !selection.has(selKey("desk", d.id))),
      fixtures: r.fixtures.filter((f) => !selection.has(selKey("fixture", f.id))),
    }));
    clearSelection();
  }

  /** 選択中のものをまとめて複製（右下にずらし、席番号は新しく振る）。複製したものを選択する */
  function duplicateSelected() {
    if (!selectedCount) return;
    const deskCopies = selectedDesks.map((d) => ({ from: d, id: newId("d") }));
    const fixtureCopies = selectedFixtures.map((f) => ({ from: f, id: newId("f") }));
    update((r) => {
      let n = nextSeatNumber(withSeats(r));
      const desks = deskCopies.map(({ from, id }) => ({
        ...from,
        id,
        x: clamp(from.x + 40, 0, r.width),
        y: clamp(from.y + 40, 0, r.height),
        seats: from.seats.map(() => n++),
      }));
      const fixtures = fixtureCopies.map(({ from, id }) => ({
        ...from,
        id,
        x: clamp(from.x + 40, 0, r.width),
        y: clamp(from.y + 40, 0, r.height),
      }));
      return { ...r, desks: [...r.desks, ...desks], fixtures: [...r.fixtures, ...fixtures] };
    });
    setSelection(
      new Set([...deskCopies.map((c) => selKey("desk", c.id)), ...fixtureCopies.map((c) => selKey("fixture", c.id))]),
    );
  }

  /** 選択中のものを、それぞれその場で回す（delta）か、角度をそろえる（to） */
  function rotateSelected(delta: number, to?: number) {
    if (!selectedCount) return;
    const turn = (rot: number) => normalizeRotation(to ?? rot + delta);
    update((r) => ({
      ...r,
      desks: r.desks.map((d) => (selection.has(selKey("desk", d.id)) ? { ...d, rotation: turn(d.rotation) } : d)),
      fixtures: r.fixtures.map((f) => (selection.has(selKey("fixture", f.id)) ? { ...f, rotation: turn(f.rotation) } : f)),
    }));
  }

  /**
   * 机を黒板に向ける。onlySelected = true なら選択中の机だけ。
   * fan = false：黒板に正対（平行）、fan = true：黒板の中心に向ける（扇形）
   */
  function faceBoard(onlySelected: boolean, fan = false) {
    if (!faceTarget) return;
    update((r) => ({
      ...r,
      desks: r.desks.map((d) => {
        if ((onlySelected && !selection.has(selKey("desk", d.id))) || d.type === "round4") return d;
        return { ...d, rotation: fan ? rotationToFace(d, faceTarget) : rotationToFaceWall(d, faceTarget) };
      }),
    }));
  }

  /** 選択中のものをまとめて動かす。はみ出さないよう、全体が部屋に収まる範囲で動かす */
  function moveSelected(dx: number, dy: number) {
    if (!selectedCount) return;
    const items = [...selectedDesks, ...selectedFixtures];
    const ddx = clamp(dx, -Math.min(...items.map((i) => i.x)), room.width - Math.max(...items.map((i) => i.x)));
    const ddy = clamp(dy, -Math.min(...items.map((i) => i.y)), room.height - Math.max(...items.map((i) => i.y)));
    if (!ddx && !ddy) return;
    update((r) => ({
      ...r,
      desks: r.desks.map((d) => (selection.has(selKey("desk", d.id)) ? { ...d, x: d.x + ddx, y: d.y + ddy } : d)),
      fixtures: r.fixtures.map((f) => (selection.has(selKey("fixture", f.id)) ? { ...f, x: f.x + ddx, y: f.y + ddy } : f)),
    }));
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
    clearSelection();
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

  function onItemPointerDown(e: React.PointerEvent, kind: Kind, item: { id: string }) {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.focus();
    const key = selKey(kind, item.id);
    const toggle = multiMode || e.shiftKey || e.metaKey || e.ctrlKey;
    let next: Set<string>;
    let pendingSingle: { kind: Kind; id: string } | null = null;
    if (toggle) {
      next = new Set(selection);
      if (next.has(key)) next.delete(key);
      else next.add(key);
    } else if (selection.has(key)) {
      // 選択済みのものを押した：そのままグループで動かせるようにし、動かさなければそれだけを選び直す
      next = new Set(selection);
      if (selection.size > 1) pendingSingle = { kind, id: item.id };
    } else {
      next = new Set([key]);
    }
    setSelection(next);
    if (!next.has(key)) return; // 選択から外しただけ
    const p = svgPoint(e);
    const items = [
      ...room.desks.filter((d) => next.has(selKey("desk", d.id))).map((d) => ({ kind: "desk" as const, id: d.id, x: d.x, y: d.y })),
      ...room.fixtures
        .filter((f) => next.has(selKey("fixture", f.id)))
        .map((f) => ({ kind: "fixture" as const, id: f.id, x: f.x, y: f.y })),
    ];
    dragRef.current = { startX: p.x, startY: p.y, items, moved: false, pendingSingle };
    svgRef.current?.setPointerCapture(e.pointerId);
  }

  /** 何もないところを押した：範囲選択を始める（Shift などを押していれば今の選択に足す） */
  function onBackgroundPointerDown(e: React.PointerEvent) {
    const p = svgPoint(e);
    const additive = multiMode || e.shiftKey || e.metaKey || e.ctrlKey;
    if (!additive) clearSelection();
    marqueeRef.current = { x0: p.x, y0: p.y, additive };
    setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    svgRef.current?.setPointerCapture(e.pointerId);
    svgRef.current?.focus();
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = svgPoint(e);
    const m = marqueeRef.current;
    if (m) {
      setMarquee({ x0: m.x0, y0: m.y0, x1: p.x, y1: p.y });
      return;
    }
    const drag = dragRef.current;
    if (!drag || !drag.items.length) return;
    // 全体が部屋に収まる範囲で、5 cm 刻みに動かす
    const minX = Math.min(...drag.items.map((i) => i.x));
    const maxX = Math.max(...drag.items.map((i) => i.x));
    const minY = Math.min(...drag.items.map((i) => i.y));
    const maxY = Math.max(...drag.items.map((i) => i.y));
    const dx = clamp(snap(p.x - drag.startX), -minX, room.width - maxX);
    const dy = clamp(snap(p.y - drag.startY), -minY, room.height - maxY);
    if (!drag.moved && !dx && !dy) return;
    const at = new Map(drag.items.map((i) => [selKey(i.kind, i.id), i]));
    const apply = (r: Room): Room => ({
      ...r,
      desks: r.desks.map((d) => {
        const s0 = at.get(selKey("desk", d.id));
        return s0 ? { ...d, x: s0.x + dx, y: s0.y + dy } : d;
      }),
      fixtures: r.fixtures.map((f) => {
        const s0 = at.get(selKey("fixture", f.id));
        return s0 ? { ...f, x: s0.x + dx, y: s0.y + dy } : f;
      }),
    });
    // ドラッグ開始時に 1 回だけ履歴に積み、移動中は履歴を増やさない
    if (!drag.moved) {
      drag.moved = true;
      update(apply);
    } else {
      setRoomState(apply);
    }
  }

  function onPointerUp() {
    const m = marqueeRef.current;
    if (m && marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      // 小さすぎる範囲は「何もないところを押した」だけとみなす
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        const inside = (o: { x: number; y: number }) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
        const next = new Set(m.additive ? selection : []);
        room.desks.filter(inside).forEach((d) => next.add(selKey("desk", d.id)));
        room.fixtures.filter(inside).forEach((f) => next.add(selKey("fixture", f.id)));
        setSelection(next);
      }
    }
    marqueeRef.current = null;
    setMarquee(null);
    const drag = dragRef.current;
    if (drag && !drag.moved && drag.pendingSingle) selectOnly(drag.pendingSingle.kind, drag.pendingSingle.id);
    dragRef.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 25 : SNAP;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === "Escape" && numbering !== null) {
      e.preventDefault();
      setNumbering(null);
      return;
    }
    if (!selectedCount) return;
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveSelected(-step, 0),
      ArrowRight: () => moveSelected(step, 0),
      ArrowUp: () => moveSelected(0, -step),
      ArrowDown: () => moveSelected(0, step),
      Delete: removeSelected,
      Backspace: removeSelected,
      r: () => rotateSelected(5),
      R: () => rotateSelected(-5),
      Escape: () => {
        clearSelection();
        setNumbering(null);
      },
    };
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
              onChange={(e) => setArrange((a) => ({ ...a, rows: clamp(toInt(e.target.value, 1), 1, 30) }))} /> 台</label>
            <label>横 <input className="input input--narrow" type="number" min={1} max={30} value={arrange.cols}
              onChange={(e) => setArrange((a) => ({ ...a, cols: clamp(toInt(e.target.value, 1), 1, 30) }))} /> 列</label>
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
            <button type="button" className="button button--secondary button--small" onClick={selectAll} disabled={!room.desks.length && !room.fixtures.length}>
              すべて選択
            </button>
            <button type="button" className="button button--secondary button--small" onClick={clearSelection} disabled={!selectedCount}>
              選択を解除
            </button>
            <button type="button" className={multiMode ? "button button--small" : "button button--secondary button--small"}
              aria-pressed={multiMode} onClick={() => setMultiMode((v) => !v)}
              title="オンにすると、押すたびに選択に追加・解除できます（タブレット向け）">
              複数選択{multiMode ? "：オン" : ""}
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => faceBoard(false)} disabled={!faceTarget || !room.desks.length}
              title={faceTarget ? "" : "黒板・スクリーン・教卓のどれかを置いてください"}>
              すべての机を黒板に向ける
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => faceBoard(false, true)} disabled={!faceTarget || !room.desks.length}
              title="黒板の中心に向けて、扇形に並べます">
              扇形に黒板の中心へ向ける
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => update((r) => renumberSeats(withSeats(r)))} disabled={!room.desks.length}>
              席番号を前から振り直す
            </button>
            {numbering === null ? (
              <span className="numbering-start">
                <button type="button" className="button button--secondary button--small" onClick={startNumbering} disabled={!room.desks.length}
                  title="席を押した順に番号を振ります">
                  クリックで番号を振る
                </button>
                <label className="small">
                  開始
                  <input className="input input--tiny" type="number" min={1} max={SEAT_NUMBER_MAX} value={numberingStart}
                    onChange={(e) => setNumberingStart(e.target.value)} aria-label="番号を振るときの開始番号" />
                </label>
              </span>
            ) : (
              <button type="button" className="button button--small" onClick={() => setNumbering(null)}>
                番号を振るのを終える
              </button>
            )}
            <button type="button" className="button button--secondary button--small"
              onClick={() => { if (window.confirm("机と備品をすべて消しますか？")) { update((r) => ({ ...r, desks: [], fixtures: [] })); clearSelection(); } }}>
              すべて消す
            </button>
            <span className="editor__summary">
              {selectedCount ? <span className="editor__selected">{selectedCount} 個を選択中・</span> : null}
              席 <strong>{layout.seats.length}</strong>・机 {room.desks.length}・島 {islands}
            </span>
          </div>

          {numbering !== null ? (
            <p className="numbering-banner" role="status">
              席を押した順に番号を振ります。次は <strong>{numbering}番</strong>。すでに使われている番号は、その席と入れ替わります。終わったら「番号を振るのを終える」か Esc。
            </p>
          ) : null}
          <svg
            ref={svgRef}
            className="editor__svg"
            viewBox={`-20 -20 ${room.width + 40} ${room.height + 40}`}
            tabIndex={0}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onBackgroundPointerDown}
            onKeyDown={onKeyDown}
            aria-label="教室の配置。机や備品を押して選び、ドラッグで動かせます。矢印キーで移動、R で回転、Delete で削除。"
          >
            <rect className="room" x={0} y={0} width={room.width} height={room.height} />
            <g className="room-grid">{gridLines}</g>
            {room.fixtures.map((f) => (
              <g key={f.id} className="draggable" onPointerDown={(e) => onItemPointerDown(e, "fixture", f)}>
                <FixtureShape fixture={f} selected={isSelected("fixture", f.id)} />
              </g>
            ))}
            {room.desks.map((d) => {
              const selected = isSelected("desk", d.id);
              return (
                <g key={d.id} className="draggable" onPointerDown={(e) => onItemPointerDown(e, "desk", d)}>
                  <DeskBody desk={d} selected={selected} />
                  <DeskFront desk={d} />
                </g>
              );
            })}
            {layout.seats.map((s) => (
              <g key={s.number} className={numbering !== null ? "seat-dot seat-dot--edit seat-dot--numbering" : "seat-dot seat-dot--edit"}
                onPointerDown={(e) => {
                  if (numbering !== null) {
                    e.stopPropagation();
                    e.preventDefault();
                    numberSeat(s.deskId, s.number);
                    return;
                  }
                  const d = room.desks.find((x) => x.id === s.deskId);
                  if (d) onItemPointerDown(e, "desk", d);
                }}>
                <circle cx={s.x} cy={s.y} r={SEAT_RADIUS} vectorEffect="non-scaling-stroke" />
                <text x={s.x} y={s.y + 6} textAnchor="middle">{s.number}</text>
              </g>
            ))}
            {marquee ? (
              <rect
                className="marquee"
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
          <p className="small muted">
            上が前（黒板側）です。机の小さな三角が机の向きです。押して選び、ドラッグで移動。
            <strong>複数選択</strong>：何もないところからドラッグで囲む、Shift・Ctrl/⌘ を押しながら押す、または「複数選択」をオン。選んだものはまとめて動かせます。
            Ctrl/⌘+A＝すべて選択、矢印キー＝移動（Shift で大きく）、R＝回転、Delete＝削除、Ctrl/⌘+D＝複製、Ctrl/⌘+Z＝元に戻す、Esc＝選択を解除。
          </p>
        </div>

        <aside className="editor__props" aria-label="選んだものの設定">
          {selectedDesk ? (
            <>
              <h3>{DESK_SPECS[selectedDesk.type].label}</h3>
              <SeatNumberFields desk={selectedDesk} onChange={(index, n) => setSeatNumber(selectedDesk.id, index, n)} />
              <RotationControl value={selectedDesk.rotation} onChange={(rotation) => patchDesk(selectedDesk.id, { rotation })} />
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(true)} disabled={!faceTarget || selectedDesk.type === "round4"}>
                黒板の方を向く
              </button>
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(true, true)} disabled={!faceTarget || selectedDesk.type === "round4"}>
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
          ) : selectedCount > 1 ? (
            <>
              <h3>{selectedCount} 個を選択中</h3>
              <p className="small">
                机 {selectedDesks.length}（{selectedDesks.reduce((n, d) => n + d.seats.length, 0)} 席）・備品 {selectedFixtures.length}
              </p>
              <p className="small muted">どれかをドラッグすると、まとめて動きます。矢印キーでも動かせます。</p>
              <div className="rotation">
                <span className="field__label">それぞれを回転</span>
                <div className="stack">
                  <button type="button" className="button button--secondary button--small" onClick={() => rotateSelected(-5)} aria-label="選択中のものを左に5度回す">⟲ 5°</button>
                  <button type="button" className="button button--secondary button--small" onClick={() => rotateSelected(5)} aria-label="選択中のものを右に5度回す">⟳ 5°</button>
                </div>
                <div className="stack">
                  {[0, 90, 180, 270].map((deg) => (
                    <button key={deg} type="button" className="button button--secondary button--small" onClick={() => rotateSelected(0, deg)}>{deg}°</button>
                  ))}
                </div>
              </div>
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(true)} disabled={!faceTarget || !selectedDesks.length}>
                選んだ机を黒板に向ける
              </button>
              <button type="button" className="button button--secondary button--small button--block" onClick={() => faceBoard(true, true)} disabled={!faceTarget || !selectedDesks.length}>
                選んだ机を黒板の中心に向ける
              </button>
              <ItemButtons onDuplicate={duplicateSelected} onDelete={removeSelected} />
            </>
          ) : (
            <p className="small muted">
              机や備品を押すと、ここで回転・向き・大きさを変えられます。何もないところからドラッグで囲むと、複数をまとめて選べます。
            </p>
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

/** 選んだ机の席番号を手で変える欄（欄を離れたとき・Enter で確定） */
function SeatNumberFields({ desk, onChange }: { desk: Desk; onChange: (index: number, n: number) => void }) {
  return (
    <div className="seat-number-fields">
      <span className="field__label">席番号</span>
      <div className="stack">
        {desk.seats.map((n, i) => (
          <input
            // 番号が外から変わったら欄を作り直して表示を合わせる
            key={`${desk.id}-${i}-${n}`}
            className="input input--tiny"
            type="number"
            min={1}
            max={SEAT_NUMBER_MAX}
            defaultValue={n}
            aria-label={desk.seats.length > 1 ? `${i + 1}つ目の席の番号` : "席番号"}
            onBlur={(e) => {
              const v = Math.round(Number(e.target.value));
              if (v !== n) onChange(i, v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        ))}
      </div>
      <span className="field__hint">ほかの席が使っている番号にすると、その席と入れ替わります。</span>
    </div>
  );
}
