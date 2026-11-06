"use client";

import { useActionState } from "react";
import { enterTtCodeAction, type TtState } from "@/app/tt/actions";

export function TtCodeForm() {
  const [state, formAction, pending] = useActionState<TtState, FormData>(enterTtCodeAction, {});
  return (
    <form action={formAction}>
      <label className="field">
        <span className="field__label">TT・参観コード</span>
        <input className="input input--code" name="code" autoComplete="off" autoCapitalize="characters" placeholder="XXXX-XXXX" maxLength={20} required />
        <span className="field__hint">講義の担当講師から受け取った 8 文字のコード（大文字・小文字、ハイフンは問いません）</span>
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button button--block" disabled={pending}>{pending ? "確認中…" : "見る"}</button>
    </form>
  );
}
