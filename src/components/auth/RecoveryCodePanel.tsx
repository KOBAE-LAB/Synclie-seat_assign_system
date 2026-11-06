"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  loginId: string;
  recoveryCode: string;
  /** アカウント作成直後か、パスワード再設定後か */
  context: "signup" | "reset";
};

/** 復元コードを 1 回だけ表示する画面（再表示はできない） */
export function RecoveryCodePanel({ loginId, recoveryCode, context }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="card auth-card" aria-labelledby="recovery-title">
      <h1 id="recovery-title">復元コードを控えてください</h1>
      <p>
        {context === "signup"
          ? "講師アカウントを作成しました。"
          : "パスワードを再設定しました。前の復元コードはもう使えません。"}
        パスワードを忘れたときは、ログインIDとこの復元コードで再設定します。
      </p>
      <p className="muted">ログインID：{loginId}</p>

      <p className="recovery-code" aria-label="復元コード">
        {recoveryCode}
      </p>

      <div className="stack">
        <button type="button" className="button button--secondary" onClick={copy}>
          コピー
        </button>
        <span role="status" className="muted copy-status">
          {copyStatus === "copied" && "コピーしました。"}
          {copyStatus === "failed" && "コピーできませんでした。手で書き写してください。"}
        </span>
      </div>

      <p className="notice">
        復元コードは<strong>この画面でしか表示されません</strong>。あとから確認する方法はありません。メモ帳やパスワード管理アプリなど、なくさない場所に控えてください。使うと新しい復元コードに切り替わります。
      </p>

      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>復元コードを控えました</span>
      </label>

      <button
        type="button"
        className="button button--block"
        disabled={!saved}
        onClick={() => {
          router.replace("/teacher");
          router.refresh();
        }}
      >
        講義一覧へ進む
      </button>
    </section>
  );
}
