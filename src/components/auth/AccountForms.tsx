"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  deleteAccountAction,
  reissueRecoveryCodeAction,
  type AccountState,
} from "@/app/teacher/account-actions";
import { PasswordInput } from "./PasswordInput";
import { RecoveryCodePanel } from "./RecoveryCodePanel";

function Result({ state }: { state: AccountState }) {
  if (state.error) return <p className="form-error" role="alert">{state.error}</p>;
  if (state.done) return <p className="notice" role="status">{state.done}</p>;
  return null;
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePasswordAction, {});
  return (
    <form action={action} key={state.done ? "done" : "form"}>
      <PasswordInput label="今のパスワード" name="currentPassword" autoComplete="current-password" />
      <PasswordInput label="新しいパスワード" name="newPassword" autoComplete="new-password" minLength={10} hint="10 文字以上" />
      <PasswordInput label="新しいパスワード（確認）" name="newPasswordConfirm" autoComplete="new-password" minLength={10} />
      <Result state={state} />
      <button type="submit" className="button" disabled={pending}>{pending ? "変更中…" : "パスワードを変更"}</button>
    </form>
  );
}

export function ReissueRecoveryCodeForm({ loginId }: { loginId: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(reissueRecoveryCodeAction, {});
  if (state.recoveryCode) return <RecoveryCodePanel loginId={loginId} recoveryCode={state.recoveryCode} context="reissue" />;
  return (
    <form action={action}>
      <PasswordInput label="パスワード" name="password" autoComplete="current-password" />
      <Result state={state} />
      <button type="submit" className="button button--secondary" disabled={pending}>{pending ? "発行中…" : "復元コードを新しく発行"}</button>
    </form>
  );
}

export function DeleteAccountForm({ loginId }: { loginId: string }) {
  const [state, action, pending] = useActionState<AccountState, FormData>(deleteAccountAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("アカウントを削除します。教室・講義・抽選結果もすべて消え、元に戻せません。よろしいですか？")) e.preventDefault();
      }}
    >
      <label className="field">
        <span className="field__label">確認のため、ログイン ID「{loginId}」を入力</span>
        <input className="input" name="confirmLoginId" autoComplete="off" required />
      </label>
      <PasswordInput label="パスワード" name="password" autoComplete="current-password" />
      <Result state={state} />
      <button type="submit" className="button" disabled={pending}>{pending ? "削除中…" : "アカウントを削除する"}</button>
    </form>
  );
}
