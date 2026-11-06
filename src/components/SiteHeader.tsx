import Link from "next/link";

/** コンセプトデザイン・ノートと同じ構成のヘッダー：KOBAE LAB ロゴ ｜ Synclie と副題 ｜ 右にリンク */
export function SiteHeader() {
  return (
    <header className="site-header no-print">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo" aria-label="ホーム">
          {/* eslint-disable-next-line @next/next/no-img-element -- 透過 PNG をそのまま使う */}
          <img src="/brand/logo-dark.png" alt="KOBAE LAB Technology Education Nagasaki Univ." width={900} height={153} />
        </Link>
        <div className="site-header__title">
          <strong>Synclie</strong>
          <span>- 座席・グループ抽選</span>
        </div>
        <nav className="site-header__nav" aria-label="メインメニュー">
          <Link href="/teacher">講師Studio</Link>
        </nav>
      </div>
    </header>
  );
}
