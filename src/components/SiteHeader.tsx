import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__title">
          <span>Synclie</span> 座席抽選
        </Link>
        <nav className="site-header__nav" aria-label="メインメニュー">
          <Link href="/teacher/login">講師ログイン</Link>
        </nav>
      </div>
    </header>
  );
}
