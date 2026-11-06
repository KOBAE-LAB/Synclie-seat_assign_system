import { logoutAction } from "@/app/teacher/actions";
import { requireTeacher } from "@/lib/auth/server";

/** ログイン必須の講師ページ共通レイアウト（未ログインならログイン画面へ） */
export default async function ProtectedTeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const teacher = await requireTeacher();

  return (
    <>
      <div className="account-bar">
        <div className="account-bar__inner">
          <span>ログイン中：{teacher.loginId}</span>
          <form action={logoutAction}>
            <button type="submit" className="button button--secondary button--small">
              ログアウト
            </button>
          </form>
        </div>
      </div>
      {children}
    </>
  );
}
