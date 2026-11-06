"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { changePassword, deleteAccount, reissueRecoveryCode } from "@/lib/auth/account";
import { RATE_LIMIT_MESSAGE, rateLimits } from "@/lib/auth/rate-limit";
import { clientIp, endSession, isSameOrigin, requireTeacher } from "@/lib/auth/server";
import { confirmError } from "@/lib/auth/validation";

export type AccountState = { error?: string; done?: string; recoveryCode?: string };

const BAD_ORIGIN = "ページを再読み込みしてから、もう一度お試しください。";

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** CSRF・ログイン・試行回数をまとめて確認 */
async function guard() {
  if (!(await isSameOrigin())) return { error: BAD_ORIGIN } as const;
  const teacher = await requireTeacher();
  if (!rateLimits.auth.consume(await clientIp())) return { error: RATE_LIMIT_MESSAGE } as const;
  return { teacher } as const;
}

export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const next = field(formData, "newPassword");
  const confirm = confirmError(next, field(formData, "newPasswordConfirm"));
  if (confirm) return { error: confirm };
  const r = await changePassword(getDb(), g.teacher.teacherId, field(formData, "currentPassword"), next, g.teacher.sessionId);
  return r.ok ? { done: "パスワードを変更しました。ほかの端末ではログアウトされました。" } : { error: r.message };
}

export async function reissueRecoveryCodeAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  const r = await reissueRecoveryCode(getDb(), g.teacher.teacherId, field(formData, "password"));
  return r.ok ? { recoveryCode: r.recoveryCode } : { error: r.message };
}

export async function deleteAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const g = await guard();
  if ("error" in g) return { error: g.error };
  if (field(formData, "confirmLoginId").trim().toLowerCase() !== g.teacher.loginId.toLowerCase()) {
    return { error: "確認のためのログイン ID が違います。" };
  }
  const r = await deleteAccount(getDb(), g.teacher.teacherId, field(formData, "password"));
  if (!r.ok) return { error: r.message };
  await endSession();
  redirect("/teacher/login?deleted=1");
}
