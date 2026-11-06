"use client";

import { useActionState } from "react";
import { copyClassroomAction, type ActionState } from "@/app/teacher/seating-actions";

/** ほかの講師から受け取った共有コードで教室をコピーする */
export function CopyClassroomForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(copyClassroomAction, {});
  return (
    <form action={formAction} className="inline-form">
      <label>
        <span className="small">共有コードから教室をコピー</span>{" "}
        <input className="input input--code input--medium" name="code" placeholder="XXXX-XXXX" maxLength={20} autoComplete="off" required />
      </label>
      <button type="submit" className="button button--secondary button--small" disabled={pending}>コピー</button>
      {state.error ? <span className="field__error" role="alert">{state.error}</span> : null}
    </form>
  );
}
