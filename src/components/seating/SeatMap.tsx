import { DESK_SPECS, deskBox, SEAT_RADIUS, type Desk } from "@/lib/seating/geometry";
import { groupOutlines } from "@/lib/seating/group-outline";
import { frontDistance, type ClassroomLayout } from "@/lib/seating/layout";
import { contentViewBox, DeskBody, DeskFront, FixtureShape } from "./Shapes";

export type SeatView = {
  number: number;
  color?: string | null;
  /** 抽選済み（講師画面） */
  taken?: boolean;
  spare?: boolean;
  /** 自分の席（学生画面） */
  mine?: boolean;
  label?: string | null;
};

/** 教室の座席図（机・備品・座席番号）。黒板などの位置は教室エディタで置いたとおり */
export function SeatMap({
  layout,
  seats,
  size = "normal",
  takenStyle = "tint",
  onSeatClick,
  showGroups = true,
}: {
  layout: ClassroomLayout;
  seats: SeatView[];
  size?: "normal" | "small" | "screen";
  /** 抽選済みの席の見せ方：tint＝薄く塗る（講師画面）、grey＝グレーアウト（投影用） */
  takenStyle?: "tint" | "grey";
  /** 指定すると席を押せるようになる（クライアントコンポーネントからのみ） */
  onSeatClick?: (seatNumber: number) => void;
  /** グループを同じ色の太線で囲み、グループ名の札を出す */
  showGroups?: boolean;
}) {
  const byNumber = new Map(seats.map((s) => [s.number, s]));
  const hasMine = seats.some((s) => s.mine);
  const mine = seats.find((s) => s.mine);
  const mineKey = mine?.label && mine.color ? `${mine.label}\u0000${mine.color}` : null;
  const outlines = showGroups
    ? groupOutlines(
        layout.seats.map((seat) => ({ x: seat.x, y: seat.y, name: byNumber.get(seat.number)?.label, color: byNumber.get(seat.number)?.color })),
        GROUP_RADIUS,
      )
    : [];
  // 机の席がすべて同じグループなら、その机も囲みの中に入れる
  const keyOf = (n: number) => {
    const v = byNumber.get(n);
    return v?.label && v.color ? `${v.label}\u0000${v.color}` : null;
  };
  const desksByGroup = new Map<string, Desk[]>();
  for (const d of layout.desks) {
    const keys = new Set(d.seats.map(keyOf));
    const [k] = keys;
    if (keys.size === 1 && k) desksByGroup.set(k, [...(desksByGroup.get(k) ?? []), d]);
  }
  // グループ名は、グループのいちばん前（黒板側）の机の上に出す。自分の机がないグループは囲みの左上に
  const dist = frontDistance(layout);
  const labelDesk = new Map<string, Desk>();
  for (const g of outlines) {
    const own = desksByGroup.get(g.key) ?? [];
    if (own.length) {
      labelDesk.set(g.key, [...own].sort((a, b) => dist(a) - dist(b) || a.x - b.x)[0]);
    } else {
      for (const d of own) {
        const b = deskBox(d);
        g.badge = { x: Math.min(g.badge.x, b.minX), y: Math.min(g.badge.y, b.minY) };
      }
    }
  }
  const labeledDeskIds = new Set([...labelDesk.values()].map((d) => d.id));
  return (
    <div className={`seat-map seat-map--${size}`}>
      <svg viewBox={contentViewBox(layout)} className="seat-map__svg" role="img" aria-label="座席図">
        {layout.fixtures.map((f) => (
          <FixtureShape key={f.id} fixture={f} />
        ))}
        {/* グループの囲み：外側（色・太め）→ 内側（白）を重ねて、つながった形の縁取りにする */}
        {outlines.length ? (
          <g className="group-outlines" aria-hidden="true">
            {outlines.map((g) => (
              <g key={`o-${g.key}`} opacity={mineKey && g.key !== mineKey ? 0.35 : 1}>
                {g.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={GROUP_RADIUS + GROUP_LINE} fill={g.color} />
                ))}
                {g.edges.map(([a, b], i) => (
                  <line key={`e${i}`} x1={g.points[a].x} y1={g.points[a].y} x2={g.points[b].x} y2={g.points[b].y}
                    stroke={g.color} strokeWidth={(GROUP_RADIUS + GROUP_LINE) * 2} strokeLinecap="round" />
                ))}
                {(desksByGroup.get(g.key) ?? []).map((d) => (
                  <DeskBlock key={d.id} desk={d} color={g.color} pad={DESK_PAD + GROUP_LINE} />
                ))}
              </g>
            ))}
            {outlines.map((g) => (
              <g key={`i-${g.key}`}>
                {g.points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={GROUP_RADIUS} fill="#ffffff" />
                ))}
                {g.edges.map(([a, b], i) => (
                  <line key={`e${i}`} x1={g.points[a].x} y1={g.points[a].y} x2={g.points[b].x} y2={g.points[b].y}
                    stroke="#ffffff" strokeWidth={GROUP_RADIUS * 2} strokeLinecap="round" />
                ))}
                {(desksByGroup.get(g.key) ?? []).map((d) => (
                  <DeskBlock key={d.id} desk={d} color="#ffffff" pad={DESK_PAD} />
                ))}
                {/* うっすら色を付けてグループのまとまりを見せる */}
                <g opacity={0.1}>
                  {g.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={GROUP_RADIUS} fill={g.color} />
                  ))}
                  {g.edges.map(([a, b], i) => (
                    <line key={`e${i}`} x1={g.points[a].x} y1={g.points[a].y} x2={g.points[b].x} y2={g.points[b].y}
                      stroke={g.color} strokeWidth={GROUP_RADIUS * 2} strokeLinecap="round" />
                  ))}
                  {(desksByGroup.get(g.key) ?? []).map((d) => (
                    <DeskBlock key={d.id} desk={d} color={g.color} pad={DESK_PAD} />
                  ))}
                </g>
              </g>
            ))}
          </g>
        ) : null}
        {layout.desks.map((d) => (
          <g key={d.id}>
            <DeskBody desk={d} />
            {/* 名前を出す机は、向きの ▲ を名前で隠さないよう出さない */}
            {labeledDeskIds.has(d.id) ? null : <DeskFront desk={d} />}
          </g>
        ))}
        {layout.seats.map((seat) => {
          const v = byNumber.get(seat.number);
          const classes = ["seat-dot"];
          if (v?.taken) classes.push(takenStyle === "grey" ? "seat-dot--grey" : "seat-dot--taken");
          if (onSeatClick) classes.push("seat-dot--clickable");
          if (v?.spare) classes.push("seat-dot--spare");
          if (v?.mine) classes.push("seat-dot--mine");
          if (hasMine && !v?.mine) classes.push("seat-dot--dim");
          return (
            <g
              key={seat.number}
              className={classes.join(" ")}
              onClick={onSeatClick ? () => onSeatClick(seat.number) : undefined}
              role={onSeatClick ? "button" : undefined}
              tabIndex={onSeatClick ? 0 : undefined}
              onKeyDown={
                onSeatClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSeatClick(seat.number);
                      }
                    }
                  : undefined
              }
            >
              <title>{v?.label ? `${seat.number}番（${v.label}）` : `${seat.number}番`}</title>
              <circle
                cx={seat.x}
                cy={seat.y}
                r={SEAT_RADIUS}
                style={v?.color ? { stroke: v.color } : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {v?.mine ? <circle className="seat-dot__ring" cx={seat.x} cy={seat.y} r={SEAT_RADIUS + 9} /> : null}
              <text x={seat.x} y={seat.y + 6} textAnchor="middle">
                {seat.number}
              </text>
            </g>
          );
        })}
        {outlines.map((g) => {
          const opacity = mineKey && g.key !== mineKey ? 0.45 : 1;
          const desk = labelDesk.get(g.key);
          if (desk) {
            // 机の上の中央に、机に収まる大きさで（文字は回さずまっすぐ）
            const b = deskBox(desk);
            const deskW = b.maxX - b.minX;
            const deskH = b.maxY - b.minY;
            const o = DESK_SPECS[desk.type].outline(desk);
            const bodyH = o.kind === "rect" ? Math.min(o.h, deskH) : o.kind === "circle" ? o.r * 1.4 : 40;
            const h = Math.max(22, Math.min(34, bodyH - 4));
            const font = Math.round(h * 0.78);
            const w = Math.min(Math.max(h * 1.4, g.name.length * font * 0.95 + 14), deskW - 6);
            return (
              <g key={`b-${g.key}`} className="group-badge group-badge--desk" opacity={opacity} aria-hidden="true">
                <rect x={desk.x - w / 2} y={desk.y - h / 2} width={w} height={h} rx={6} fill={g.color} />
                <text x={desk.x} y={desk.y + font * 0.36} textAnchor="middle" style={{ fontSize: font }}>{g.name}</text>
              </g>
            );
          }
          const w = Math.max(34, g.name.length * 19 + 16);
          return (
            <g key={`b-${g.key}`} className="group-badge" opacity={opacity} aria-hidden="true">
              <rect x={g.badge.x - 6} y={g.badge.y - 24} width={w} height={30} rx={6} fill={g.color} />
              <text x={g.badge.x - 6 + w / 2} y={g.badge.y - 2} textAnchor="middle">{g.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** グループの囲みの内側の半径と線の太さ（cm）。隣の席（約 60 cm）の囲みと重ならない大きさ */
const GROUP_RADIUS = 24;
const GROUP_LINE = 5;
/**
 * 囲みに入れる机（席を含む）のまわりの余白（cm）。
 * 前後に並ぶ同じグループの机どうしは重なってつながり（列の間隔 約 100 cm）、
 * 通路をはさんだ隣の島（約 30 cm）とは重ならない大きさ。
 */
const DESK_PAD = 8;

/** 机と席をまとめた四角（机の向きに合わせて回す）を pad だけ広げて角丸で塗る */
function DeskBlock({ desk, color, pad }: { desk: Desk; color: string; pad: number }) {
  const spec = DESK_SPECS[desk.type];
  const o = spec.outline(desk);
  const pts =
    o.kind === "rect"
      ? [{ x: -o.w / 2, y: -o.h / 2 }, { x: o.w / 2, y: o.h / 2 }]
      : o.kind === "circle"
        ? [{ x: -o.r, y: -o.r }, { x: o.r, y: o.r }]
        : o.points;
  const seats = spec.seatOffsets(desk).flatMap((p) => [
    { x: p.x - GROUP_RADIUS, y: p.y - GROUP_RADIUS },
    { x: p.x + GROUP_RADIUS, y: p.y + GROUP_RADIUS },
  ]);
  const all = [...pts, ...seats];
  const minX = Math.min(...all.map((p) => p.x)) - pad;
  const minY = Math.min(...all.map((p) => p.y)) - pad;
  const maxX = Math.max(...all.map((p) => p.x)) + pad;
  const maxY = Math.max(...all.map((p) => p.y)) + pad;
  return (
    <rect
      transform={`translate(${desk.x} ${desk.y}) rotate(${desk.rotation})`}
      x={minX}
      y={minY}
      width={maxX - minX}
      height={maxY - minY}
      rx={Math.min(pad, 8)}
      fill={color}
    />
  );
}
