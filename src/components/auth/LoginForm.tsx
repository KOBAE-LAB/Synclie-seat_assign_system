"use client";

import { useActionState, useState } from "react";
import { loginAction, type FormState } from "@/app/teacher/actions";
import { PasswordInput } from "./PasswordInput";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, {});
  const [loginId, setLoginId] = useState("");

  return (
    <form action={formAction} noValidate>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <label className="field">
        <span className="field__label">ログインID</span>
        <input
          className="input"
          name="loginId"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
          required
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
        />
      </label>
      <PasswordInput label="パスワード" name="password" autoComplete="current-password" />
      <button type="submit" className="button button--block" disabled={pending}>
        {pending ? "確認しています…" : "ログイン"}
      </button>
    </form>
  );
}
