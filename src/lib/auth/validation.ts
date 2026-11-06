/** 講師アカウントの入力ルール（画面とサーバーで共通） */

export const LOGIN_ID_MIN = 3;
export const LOGIN_ID_MAX = 40;
export const PASSWORD_MIN = 10;
/** 極端に長い入力でハッシュ計算を重くさせないための上限 */
export const PASSWORD_MAX = 200;

export const LOGIN_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** ログイン ID の形式エラー（問題なければ null） */
export function loginIdError(loginId: string): string | null {
  if (loginId.length === 0) return "ログインIDを入力してください。";
  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return "ログインIDに使えるのは半角英数字と _（アンダーバー）、-（ハイフン）だけです。";
  }
  if (loginId.length < LOGIN_ID_MIN || loginId.length > LOGIN_ID_MAX) {
    return `ログインIDは${LOGIN_ID_MIN}〜${LOGIN_ID_MAX}文字にしてください。`;
  }
  return null;
}

/** パスワードの形式エラー（問題なければ null） */
export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください。`;
  if (password.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内にしてください。`;
  return null;
}

export function confirmError(password: string, confirm: string): string | null {
  return password === confirm ? null : "確認用のパスワードが一致しません。";
}
