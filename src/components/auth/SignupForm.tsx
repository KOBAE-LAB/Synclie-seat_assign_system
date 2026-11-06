"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { checkLoginIdAction, signupAction, type FormState, type LoginIdCheck } from "@/app/teacher/actions";
import {
  confirmError,
  LOGIN_ID_MAX,
  LOGIN_ID_MIN,
  loginIdError,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordError,
} from "@/lib/auth/validation";
import { PasswordInput } from "./PasswordInput";
import { RecoveryCodePanel } from "./RecoveryCodePanel";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signupAction, {});
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [check, setCheck] = useState<(LoginIdCheck & { loginId: string }) | null>(null);

  const formatError = loginId ? loginIdError(loginId) : null;

  // 入力が止まってから空き状況を確認する
  useEffect(() => {
    if (!loginId || loginIdError(loginId)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await checkLoginIdAction(loginId);
        if (!cancelled) setCheck({ ...result, loginId });
      } catch {
        // 確認できなくても送信時にサーバーで判定する
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loginId]);

  if (state.recoveryCode && state.loginId) {
    return <RecoveryCodePanel loginId={state.loginId} recoveryCode={state.recoveryCode} context="signup" />;
  }

  const current = check && check.loginId === loginId ? check : null;
  const loginIdMessage = formatError ?? (current?.status === "taken" ? current.message : null);
  const passwordMessage = password ? passwordError(password) : null;
  const confirmMessage = confirm ? confirmError(password, confirm) : null;
  const canSubmit =
    !pending &&
    !loginIdError(loginId) &&
    current?.status !== "taken" &&
    !passwordError(password) &&
    !confirmError(password, confirm);

  return (
    <section className="card auth-card">
      <h1>講師アカウントを作成</h1>
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
            maxLength={LOGIN_ID_MAX}
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value.trim())}
            aria-invalid={loginIdMessage ? true : undefined}
            aria-describedby="signup-login-id-hint signup-login-id-status"
          />
          <span id="signup-login-id-hint" className="field__hint">
            {LOGIN_ID_MIN}〜{LOGIN_ID_MAX}文字の半角英数字と _（アンダーバー）、-（ハイフン）
          </span>
          <span
            id="signup-login-id-status"
            className={loginIdMessage ? "field__error" : "field__ok"}
            aria-live="polite"
          >
            {loginIdMessage ?? (current?.status === "available" ? current.message : "")}
          </span>
        </label>

        <PasswordInput
          label="パスワード"
          name="password"
          autoComplete="new-password"
          hint={`${PASSWORD_MIN}文字以上`}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={setPassword}
          error={passwordMessage}
        />
        <PasswordInput
          label="パスワード（確認）"
          name="passwordConfirm"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          onChange={setConfirm}
          error={confirmMessage}
        />

        <p className="muted small">
          メールアドレスは登録しません。パスワードを忘れたときは、作成後に表示される復元コードで再設定します。
        </p>
        <p className="muted small">
          アカウントを作成すると、<Link href="/terms">利用規約</Link>と
          <Link href="/privacy">プライバシーポリシー</Link>に同意したものとみなします。
        </p>

        <button type="submit" className="button button--block" disabled={!canSubmit}>
          {pending ? "作成しています…" : "アカウントを作成"}
        </button>
      </form>
      <ul className="link-list">
        <li>
          <Link href="/teacher/login">アカウントをお持ちの方：ログイン →</Link>
        </li>
      </ul>
    </section>
  );
}
