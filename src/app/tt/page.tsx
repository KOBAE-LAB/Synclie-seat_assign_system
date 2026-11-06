import type { Metadata } from "next";
import Link from "next/link";
import { TtCodeForm } from "@/components/seating/TtCodeForm";

export const metadata: Metadata = {
  title: "TT・参観コードで見る",
};

export default async function TtViewerPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return (
    <main className="page">
      <section className="card auth-card">
        <p className="eyebrow">OBSERVER</p>
        <h1>TT・参観コードで見る</h1>
        <p className="muted">
          TT（ティーム・ティーチング）の講師や参観者の方は、担当講師から受け取ったコードで、抽選の状況と座席図を閲覧できます（操作はできません）。
        </p>
        {expired ? <p className="notice">コードが無効になったか、閲覧の期限（12 時間）が切れました。もう一度入力してください。</p> : null}
        <TtCodeForm />
        <ul className="link-list">
          <li>
            <Link href="/teacher/login">講師ログインに戻る →</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
