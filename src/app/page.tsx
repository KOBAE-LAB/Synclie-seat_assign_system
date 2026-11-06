import Link from "next/link";

/** トップページ（コンセプトデザイン・ノートのトップと同じ構成） */
export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">授業の座席・グループ抽選</p>
        <h1>
          QR を読んで、
          <br />
          座席とグループを
          <br />
          <em>すばやく決めよう。</em>
        </h1>
        <p className="intro">
          講師がスクリーンに映す QR コードを読み取って「抽選」を押すだけ。
          <br />
          名前などの個人情報は集めません。
        </p>
        <div className="home-guide">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/idea.png" alt="ひらめいたTechるくん" width={130} height={145} />
          <p>
            席が決まったら、
            <br />
            グループで学び合おう！
            <small>ガイド：Techるくん</small>
          </p>
        </div>
      </section>

      <section className="card card--accent home-card">
        <p className="eyebrow">TEACHER STUDIO</p>
        <h2>講師の方</h2>
        <p className="muted">教室の配置づくり、講義の作成、抽選の受付と結果の管理ができます。</p>
        <div className="stack">
          <Link href="/teacher/login" className="button">ログイン</Link>
          <Link href="/teacher/signup" className="button button--secondary">アカウントを作成</Link>
        </div>
        <p className="small muted" style={{ marginTop: 24 }}>
          学生の方は、講師が表示する QR コードから参加してください。
          <br />
          TT・参観の方は <Link href="/tt">こちら</Link>。
        </p>
      </section>

      <ol className="journey" aria-label="使い方の流れ">
        <li><b>01</b>教室をつくる</li>
        <li><b>02</b>講義をつくる</li>
        <li><b>03</b>QR を映す</li>
        <li><b>04</b>学生が抽選</li>
        <li><b>05</b>結果を出力</li>
      </ol>
    </main>
  );
}
