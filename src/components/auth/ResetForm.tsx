"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { resetAction, type FormState } from "@/app/teacher/actions";
import { confirmError, PASSWORD_MAX, PASSWORD_MIN, passwordError } from "@/lib/auth/validation";
import { PasswordInput } from "./PasswordInput";
import { RecoveryCodePanel } from "./RecoveryCodePanel";

export function ResetForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(resetAction, {});
  const [loginId, setLoginId] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  if (state.recoveryCode && state.loginId) {
    return <RecoveryCodePanel loginId={state.loginId} recoveryCode={state.recoveryCode} context="reset" />;
  }

  const passwordMessage = password ? passwordError(password) : null;
  const confirmMessage = confirm ? confirmError(password, confirm) : null;

  return (
    <section className="card auth-card">
      <h1>パスワードを再設定</h1>
      <p className="muted">
        アカウント作成時（または前回の再設定時）に表示された復元コードを使います。復元コードは1回しか使えません。再設定すると新しい復元コードが表示されます。
      </p>
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
        <label className="field">
          <span className="field__label">復元コード</span>
          <input
            className="input input--code"
            name="recoveryCode"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            required
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            aria-describedby="reset-code-hint"
          />
          <span id="reset-code-hint" className="field__hint">
            大文字・小文字やハイフンの有無は区別しません
          </span>
        </label>
        <PasswordInput
          label="新しいパスワード"
          name="password"
          autoComplete="new-password"
          hint={`${PASSWORD_MIN}文字以上`}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={setPassword}
          error={passwordMessage}
        />
        <PasswordInput
          label="新しいパスワード（確認）"
          name="passwordConfirm"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          onChange={setConfirm}
          error={confirmMessage}
        />
        <button
          type="submit"
          className="button button--block"
          disabled={pending || !loginId || !recoveryCode || !!passwordError(password) || !!confirmError(password, confirm)}
        >
          {pending ? "確認しています…" : "パスワードを再設定"}
        </button>
      </form>
      <ul className="link-list">
        <li>
          <Link href="/teacher/login">ログイン画面に戻る →</Link>
        </li>
      </ul>
    </section>
  );
}
