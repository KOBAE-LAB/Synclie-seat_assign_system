import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "利用規約",
};

export default function TermsPage() {
  return (
    <main className="page">
      <section className="card auth-card">
        <h1>利用規約</h1>
        <p className="notice">利用規約は準備中です。</p>
        <ul className="link-list">
          <li>
            <Link href="/teacher/login">講師ログインに戻る →</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
