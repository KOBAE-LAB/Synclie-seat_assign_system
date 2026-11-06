import type { Metadata } from "next";
import { requireTeacher } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "講義一覧",
};

export default async function TeacherHomePage() {
  // レイアウトだけに頼らず、ページでもログインを確認する
  await requireTeacher();

  return (
    <main className="page">
      <section className="card">
        <h1>講義一覧</h1>
        <p className="notice">講義の作成・抽選の受付管理は準備中です。</p>
      </section>
    </main>
  );
}
