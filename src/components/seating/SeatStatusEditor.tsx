"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleSeatStatusAction } from "@/app/teacher/seating-actions";
import type { ClassroomLayout } from "@/lib/seating/layout";
import { SeatMap, type SeatView } from "./SeatMap";

/** 講師の座席図。「使用／予備を切り替える」をオンにすると、席を押して切り替えられる */
export function SeatStatusEditor({
  lectureId,
  layout,
  seats,
}: {
  lectureId: number;
  layout: ClassroomLayout;
  seats: SeatView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function toggle(seatNumber: number) {
    startTransition(async () => {
      const result = await toggleSeatStatusAction(lectureId, seatNumber);
      setMessage(result ? `${seatNumber}番を${result === "used" ? "使用席" : "予備席"}にしました。` : "変更できませんでした。");
      router.refresh();
    });
  }

  return (
    <>
      <div className="stack" style={{ alignItems: "center", marginBottom: 8 }}>
        <label className="checkbox" style={{ margin: 0 }}>
          <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
          使用席／予備席を切り替える
        </label>
        {editing ? (
          <span className="small muted" role="status">
            {pending ? "変更中…" : message || "席を押すと、使用席 ⇔ 予備席が切り替わります（使用席から先に割り当てます）。"}
          </span>
        ) : null}
      </div>
      <SeatMap layout={layout} seats={seats} onSeatClick={editing ? toggle : undefined} />
    </>
  );
}
