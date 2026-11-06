import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "教員ログイン",
};

export default function TeacherLoginPage() {
  return (
    <main className="page">
      <section className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>教員ログイン</h1>
        <p className="notice">ログイン機能は準備中です。</p>
        <form aria-describedby="login-status">
          <label className="field">
            <span className="field__label">ログイン ID</span>
            <input
              className="input"
              name="loginId"
              autoComplete="username"
              minLength={3}
              maxLength={40}
              pattern="[A-Za-z0-9_\-]+"
              required
              disabled
            />
            <span className="field__hint">3〜40 文字の半角英数字・_・-</span>
          </label>
          <label className="field">
            <span className="field__label">パスワード</span>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              minLength={10}
              required
              disabled
            />
            <span className="field__hint">10 文字以上</span>
          </label>
          <button type="submit" className="button" disabled>
            ログイン
          </button>
          <p id="login-status" className="muted">
            パスワードを忘れた場合は、登録時に表示された復旧コードで再設定できます（準備中）。
          </p>
        </form>
      </section>
    </main>
  );
}
