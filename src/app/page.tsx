import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>Synclie 座席抽選</h1>
        <p>
          講義ごとの QR コードを読み取って「抽選」を押すと、座席番号とグループが決まります。
          学生の個人情報は収集しません。
        </p>
        <p className="notice">
          このページは準備中です。学生の方は、講師が表示する QR コードから参加してください。
        </p>
      </section>

      <section className="card">
        <h2>講師の方へ</h2>
        <p className="muted">教室レイアウトの作成、講義の作成、抽選の受付管理は講師ログイン後に行います。</p>
        <div className="stack">
          <Link href="/teacher/login" className="button">
            講師ログイン
          </Link>
        </div>
      </section>
    </main>
  );
}
