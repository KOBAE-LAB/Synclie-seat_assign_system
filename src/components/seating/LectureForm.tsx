"use client";

import { useActionState, useState } from "react";
import { createLectureAction, type ActionState } from "@/app/teacher/seating-actions";

export function LectureForm({
  classrooms,
}: {
  classrooms: { id: number; name: string; seatCount: number }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createLectureAction, {});
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? 0);
  const [mode, setMode] = useState("island");
  const [fill, setFill] = useState<"even" | "front">("even");
  const seatCount = classrooms.find((c) => c.id === classroomId)?.seatCount ?? 0;
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

  return (
    <form action={formAction}>
      <label className="field">
        <span className="field__label">講義名</span>
        <input className="input" name="name" maxLength={100} required placeholder="例：情報リテラシー 第5回" />
      </label>
      <label className="field">
        <span className="field__label">日付</span>
        <input className="input input--medium" type="date" name="lectureDate" defaultValue={today} />
      </label>
      <label className="field">
        <span className="field__label">教室</span>
        <select className="input" name="classroomId" value={classroomId} onChange={(e) => setClassroomId(Number(e.target.value))}>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>{c.name}（{c.seatCount} 席）</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">受講者数</span>
        <input className="input input--narrow" type="number" name="enrolledCount" min={1} max={150} required defaultValue={Math.min(seatCount, 40) || 1} />
        <span className="field__hint">
          この教室は {seatCount} 席です。受講者数ぶんの席を「使用席」にし、残りは予備席になります（使用席が埋まると予備席から割り当てます）。
        </span>
      </label>

      <fieldset className="editor-panel">
        <legend>使用席の選び方</legend>
        <label className="radio">
          <input type="radio" name="seatFill" value="even" checked={fill === "even"} onChange={() => setFill("even")} />
          全体に均等に（島ごとに散らす）
        </label>
        <label className="radio">
          <input type="radio" name="seatFill" value="front" checked={fill === "front"} onChange={() => setFill("front")} />
          前から詰める（黒板に近い席から）
        </label>
      </fieldset>

      <fieldset className="editor-panel">
        <legend>グループ</legend>
        <label className="radio">
          <input type="radio" name="groupMode" value="island" checked={mode === "island"} onChange={() => setMode("island")} />
          島ごとに 1 グループ
        </label>
        <label className="radio">
          <input type="radio" name="groupMode" value="count" checked={mode === "count"} onChange={() => setMode("count")} />
          席番号順に{" "}
          <input className="input input--narrow" type="number" name="groupCount" min={1} max={50} defaultValue={6} disabled={mode !== "count"} />{" "}
          グループに分ける
        </label>
        <label className="radio">
          <input type="radio" name="groupMode" value="none" checked={mode === "none"} onChange={() => setMode("none")} />
          グループなし
        </label>
      </fieldset>

      <label className="field">
        <span className="field__label">学生へのメッセージ（任意）</span>
        <textarea className="input" name="messageJa" rows={3} maxLength={500} placeholder="例：荷物は足元に置いてください。" />
      </label>

      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button" disabled={pending}>{pending ? "作成中…" : "講義を作る"}</button>
    </form>
  );
}
