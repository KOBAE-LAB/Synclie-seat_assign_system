import type { Metadata } from "next";
import Link from "next/link";
import { ChangePasswordForm, DeleteAccountForm, ReissueRecoveryCodeForm } from "@/components/auth/AccountForms";
import { requireTeacher } from "@/lib/auth/server";

export const metadata: Metadata = { title: "アカウント設定" };

export default async function AccountPage() {
  const teacher = await requireTeacher();
  return (
    <main className="page">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card auth-card">
        <p className="eyebrow">ACCOUNT</p>
        <h1>アカウント設定</h1>
        <p className="muted">ログイン ID：{teacher.loginId}</p>
        <p className="small muted">最後のログインから 2 年たったアカウントは、教室・講義・抽選結果ごと自動で削除されます。</p>
      </section>

      <section className="card auth-card">
        <h2>パスワードを変更</h2>
        <ChangePasswordForm />
      </section>

      <section className="card auth-card">
        <h2>復元コードを新しく発行</h2>
        <p className="small muted">復元コードをなくしたときに使います。発行すると前の復元コードは使えなくなります。</p>
        <ReissueRecoveryCodeForm loginId={teacher.loginId} />
      </section>

      <section className="card auth-card">
        <h2>アカウントを削除</h2>
        <p className="small muted">教室・講義・抽選結果もすべて削除され、元に戻せません。</p>
        <DeleteAccountForm loginId={teacher.loginId} />
      </section>
    </main>
  );
}
