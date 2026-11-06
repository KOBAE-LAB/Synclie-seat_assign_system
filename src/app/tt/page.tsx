import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TT・参観コードで見る",
};

export default function TtViewerPage() {
  return (
    <main className="page">
      <section className="card auth-card">
        <h1>TT・参観コードで見る</h1>
        <p className="notice">TT（ティーム・ティーチング）・参観用の閲覧機能は準備中です。</p>
        <ul className="link-list">
          <li>
            <Link href="/teacher/login">講師ログインに戻る →</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
