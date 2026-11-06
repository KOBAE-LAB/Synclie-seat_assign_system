import { SEAT_RADIUS } from "@/lib/seating/geometry";
import type { ClassroomLayout } from "@/lib/seating/layout";
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
}: {
  layout: ClassroomLayout;
  seats: SeatView[];
  size?: "normal" | "small";
}) {
  const byNumber = new Map(seats.map((s) => [s.number, s]));
  const hasMine = seats.some((s) => s.mine);
  return (
    <div className={`seat-map seat-map--${size}`}>
      <svg viewBox={contentViewBox(layout)} className="seat-map__svg" role="img" aria-label="座席図">
        {layout.fixtures.map((f) => (
          <FixtureShape key={f.id} fixture={f} />
        ))}
        {layout.desks.map((d) => (
          <g key={d.id}>
            <DeskBody desk={d} />
            <DeskFront desk={d} />
          </g>
        ))}
        {layout.seats.map((seat) => {
          const v = byNumber.get(seat.number);
          const classes = ["seat-dot"];
          if (v?.taken) classes.push("seat-dot--taken");
          if (v?.spare) classes.push("seat-dot--spare");
          if (v?.mine) classes.push("seat-dot--mine");
          if (hasMine && !v?.mine) classes.push("seat-dot--dim");
          return (
            <g key={seat.number} className={classes.join(" ")}>
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
      </svg>
    </div>
  );
}
