import type { ClassroomLayout } from "@/lib/seating/layout";

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

/** マス目の座席図。上が黒板（前方） */
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
      <div className="seat-map__board">黒板・前</div>
      <div
        className="seat-map__grid"
        style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, ${size === "small" ? 48 : 60}px))` }}
        role="img"
        aria-label="座席図"
      >
        {layout.seats.map((seat) => {
          const v = byNumber.get(seat.number);
          const classes = ["seat"];
          if (v?.taken) classes.push("seat--taken");
          if (v?.spare) classes.push("seat--spare");
          if (v?.mine) classes.push("seat--mine");
          if (hasMine && !v?.mine) classes.push("seat--dim");
          return (
            <div
              key={seat.number}
              className={classes.join(" ")}
              style={{
                gridRow: seat.row + 1,
                gridColumn: seat.col + 1,
                borderTopColor: v?.color ?? undefined,
              }}
              title={v?.label ? `${seat.number}番（${v.label}）` : `${seat.number}番`}
            >
              {seat.number}
            </div>
          );
        })}
      </div>
    </div>
  );
}
