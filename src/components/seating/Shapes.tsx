import {
  DESK_SPECS,
  deskBox,
  FIXTURE_SPECS,
  fixtureBox,
  mergeBoxes,
  type Desk,
  type Fixture,
} from "@/lib/seating/geometry";
import type { ClassroomLayout } from "@/lib/seating/layout";

/** 机の天板（座席は含まない） */
export function DeskBody({ desk, selected = false }: { desk: Desk; selected?: boolean }) {
  const o = DESK_SPECS[desk.type].outline(desk);
  const common = {
    className: selected ? "desk desk--selected" : "desk",
    vectorEffect: "non-scaling-stroke" as const,
  };
  const transform = `translate(${desk.x} ${desk.y}) rotate(${desk.rotation})`;
  if (o.kind === "rect") return <rect {...common} transform={transform} x={-o.w / 2} y={-o.h / 2} width={o.w} height={o.h} />;
  if (o.kind === "circle") return <circle {...common} transform={transform} r={o.r} />;
  return <polygon {...common} transform={transform} points={o.points.map((p) => `${p.x},${p.y}`).join(" ")} />;
}

/** 前を示す小さな三角（机が向いている方向） */
export function DeskFront({ desk }: { desk: Desk }) {
  if (desk.type === "round4") return null;
  return (
    <polygon
      className="desk-front"
      transform={`translate(${desk.x} ${desk.y}) rotate(${desk.rotation})`}
      points="-6,-2 6,-2 0,-10"
    />
  );
}

export function FixtureShape({ fixture, selected = false }: { fixture: Fixture; selected?: boolean }) {
  const spec = FIXTURE_SPECS[fixture.type];
  const label = fixture.label ?? spec.label;
  // 細長い備品はラベルを外側に出す
  const thin = Math.min(fixture.w, fixture.h) < 30;
  return (
    <g transform={`translate(${fixture.x} ${fixture.y}) rotate(${fixture.rotation})`}>
      <rect
        className={selected ? "fixture fixture--selected" : "fixture"}
        x={-fixture.w / 2}
        y={-fixture.h / 2}
        width={fixture.w}
        height={fixture.h}
        fill={spec.fill}
        vectorEffect="non-scaling-stroke"
      />
      <text
        className={thin ? "fixture-label fixture-label--outside" : "fixture-label"}
        x={0}
        y={thin ? fixture.h / 2 + 16 : 5}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

/** 表示範囲：教室の外枠と中身（机・備品）全体に余白を付けた矩形 */
export function contentViewBox(layout: ClassroomLayout, pad = 30): string {
  // 教室の外枠（壁）も入れる。壁の外に出た表示名なども切れないよう余白を付ける
  const box = mergeBoxes([
    { minX: 0, minY: 0, maxX: layout.width, maxY: layout.height },
    ...layout.desks.map(deskBox),
    ...layout.fixtures.map(fixtureBox),
  ])!;
  const minX = Math.floor(box.minX - pad);
  const minY = Math.floor(box.minY - pad);
  return `${minX} ${minY} ${Math.ceil(box.maxX - box.minX + pad * 2)} ${Math.ceil(box.maxY - box.minY + pad * 2)}`;
}
