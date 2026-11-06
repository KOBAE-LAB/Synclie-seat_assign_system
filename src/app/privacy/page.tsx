import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <section className="card auth-card">
        <h1>プライバシーポリシー</h1>
        <p className="notice">プライバシーポリシーは準備中です。</p>
        <ul className="link-list">
          <li>
            <Link href="/teacher/login">講師ログインに戻る →</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
