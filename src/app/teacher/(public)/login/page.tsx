import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentTeacher } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "講師ログイン",
};

export default async function TeacherLoginPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  if (await getCurrentTeacher()) redirect("/teacher");
  const { deleted } = await searchParams;

  return (
    <main className="page">
      <section className="card auth-card">
        <h1>講師ログイン</h1>
        {deleted ? <p className="notice" role="status">アカウントを削除しました。ご利用ありがとうございました。</p> : null}
        <LoginForm />
        <ul className="link-list">
          <li>
            <Link href="/teacher/signup">初めての方：講師アカウントを作成 →</Link>
          </li>
          <li>
            <Link href="/teacher/reset">パスワードを忘れたとき →</Link>
          </li>
          <li>
            <Link href="/tt">TT・参観コードをお持ちの方 →</Link>
          </li>
        </ul>
        <p className="muted small">
          最後のログインから2年たったアカウントは、教室・講義・抽選結果ごと自動で削除されます。メールでのお知らせはありません。
        </p>
      </section>
    </main>
  );
}
