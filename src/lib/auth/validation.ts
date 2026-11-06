export const LOGIN_ID_MIN = 3;
export const LOGIN_ID_MAX = 40;
export const PASSWORD_MIN = 10;
/** scrypt に渡す長さの上限（極端に長い入力を拒否する） */
export const PASSWORD_MAX = 256;

const LOGIN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 問題があればエラーメッセージ、なければ null */
export function validateLoginId(loginId: string): string | null {
  if (loginId.length < LOGIN_ID_MIN || loginId.length > LOGIN_ID_MAX) {
    return `ログイン ID は ${LOGIN_ID_MIN}〜${LOGIN_ID_MAX} 文字で入力してください。`;
  }
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return "ログイン ID に使えるのは半角英数字・_（アンダースコア）・-（ハイフン）のみです。";
  }
  return null;
}

export function validatePassword(password: string, loginId?: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `パスワードは ${PASSWORD_MIN} 文字以上にしてください。`;
  }
  if (password.length > PASSWORD_MAX) {
    return `パスワードは ${PASSWORD_MAX} 文字以内にしてください。`;
  }
  if (loginId && password.toLowerCase() === loginId.toLowerCase()) {
    return "パスワードにログイン ID と同じ文字列は使えません。";
  }
  return null;
}
