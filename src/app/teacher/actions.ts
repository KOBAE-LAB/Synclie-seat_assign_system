"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { RATE_LIMIT_MESSAGE, rateLimits } from "@/lib/auth/rate-limit";
import { clientIp, endSession, isSameOrigin, startSession } from "@/lib/auth/server";
import { createTeacher, isLoginIdTaken, login, resetPassword, type AuthFailure } from "@/lib/auth/teachers";
import { confirmError, loginIdError, passwordError } from "@/lib/auth/validation";

export type FormState = {
  error?: string;
  /** 入力し直しを減らすため、送信したログイン ID を返す */
  loginId?: string;
  /** アカウント作成・再設定の成功時だけ、1 回限り表示する復元コード */
  recoveryCode?: string;
};

const BAD_ORIGIN_MESSAGE = "ページを再読み込みしてから、もう一度お試しください。";
const LOCKED_MESSAGE = "続けて5回間違えたため、15分間ログインできません。";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function failureMessage(failure: AuthFailure, what: "パスワード" | "復元コード"): string {
  if (failure.reason === "locked") return LOCKED_MESSAGE;
  return `ログインIDか${what}が違います。（あと${failure.remaining}回間違えると、15分間ログインできなくなります。）`;
}

/** 共通の前チェック（CSRF・IP レート制限） */
async function guard(limit: keyof typeof rateLimits): Promise<string | null> {
  if (!(await isSameOrigin())) return BAD_ORIGIN_MESSAGE;
  if (!rateLimits[limit].consume(await clientIp())) return RATE_LIMIT_MESSAGE;
  return null;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = field(formData, "loginId").trim();
  const password = field(formData, "password");
  const blocked = await guard("auth");
  if (blocked) return { error: blocked, loginId };
  if (!loginId || !password) return { error: "ログインIDとパスワードを入力してください。", loginId };

  const result = await login(getDb(), loginId, password);
  if (!result.ok) return { error: failureMessage(result, "パスワード"), loginId };

  await startSession(result.teacherId);
  redirect("/teacher");
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = field(formData, "loginId").trim();
  const password = field(formData, "password");
  const confirm = field(formData, "passwordConfirm");
  const blocked = await guard("signup");
  if (blocked) return { error: blocked, loginId };

  const inputError = loginIdError(loginId) ?? passwordError(password) ?? confirmError(password, confirm);
  if (inputError) return { error: inputError, loginId };

  const result = await createTeacher(getDb(), loginId, password);
  if (!result.ok) return { error: result.message, loginId };

  await startSession(result.teacherId);
  return { loginId: result.loginId, recoveryCode: result.recoveryCode };
}

export async function resetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = field(formData, "loginId").trim();
  const recoveryCode = field(formData, "recoveryCode");
  const password = field(formData, "password");
  const confirm = field(formData, "passwordConfirm");
  const blocked = await guard("auth");
  if (blocked) return { error: blocked, loginId };
  if (!loginId || !recoveryCode.trim()) return { error: "ログインIDと復元コードを入力してください。", loginId };

  const inputError = passwordError(password) ?? confirmError(password, confirm);
  if (inputError) return { error: inputError, loginId };

  const result = await resetPassword(getDb(), loginId, recoveryCode, password);
  if (!result.ok) {
    return { error: result.reason === "invalid_input" ? result.message : failureMessage(result, "復元コード"), loginId };
  }

  await startSession(result.teacherId);
  return { loginId: result.loginId, recoveryCode: result.recoveryCode };
}

export async function logoutAction(): Promise<void> {
  if (await isSameOrigin()) await endSession();
  redirect("/teacher/login");
}

export type LoginIdCheck = { status: "available" | "taken" | "invalid" | "unknown"; message: string };

/** アカウント作成画面のライブチェック用 */
export async function checkLoginIdAction(loginId: string): Promise<LoginIdCheck> {
  if (typeof loginId !== "string") return { status: "invalid", message: "ログインIDを入力してください。" };
  const formatError = loginIdError(loginId);
  if (formatError) return { status: "invalid", message: formatError };
  if (!(await isSameOrigin()) || !rateLimits.loginIdCheck.consume(await clientIp())) {
    return { status: "unknown", message: "" };
  }
  return isLoginIdTaken(getDb(), loginId)
    ? { status: "taken", message: "このログインIDはすでに使われています。" }
    : { status: "available", message: "このログインIDは使えます。" };
}
