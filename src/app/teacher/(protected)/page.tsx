import type { Metadata } from "next";
import Link from "next/link";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listClassrooms } from "@/lib/seating/classrooms";
import { listLectures, STATE_LABEL } from "@/lib/seating/lectures";

export const metadata: Metadata = {
  title: "講義一覧",
};

export default async function TeacherHomePage() {
  // レイアウトだけに頼らず、ページでもログインを確認する
  const teacher = await requireTeacher();
  const db = getDb();
  const lectures = listLectures(db, teacher.teacherId);
  const classrooms = listClassrooms(db, teacher.teacherId);

  return (
    <main className="page">
      <section className="card">
        <div className="card__head">
          <h1>講義一覧</h1>
          {classrooms.length ? (
            <Link href="/teacher/lectures/new" className="button">＋ 講義を作る</Link>
          ) : null}
        </div>
        {classrooms.length === 0 ? (
          <p className="notice">
            まず<Link href="/teacher/classrooms/new">教室を作って</Link>
            ください。教室ができたら講義を作れます。
          </p>
        ) : lectures.length === 0 ? (
          <p className="muted">講義はまだありません。</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>講義</th><th>日付</th><th>教室</th><th>抽選</th><th>状態</th></tr>
            </thead>
            <tbody>
              {lectures.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/teacher/lectures/${l.id}`}>{l.name}</Link></td>
                  <td>{l.lectureDate ?? "—"}</td>
                  <td>{l.classroomName}</td>
                  <td>{l.drawnCount} / {l.enrolledCount}</td>
                  <td><span className={`state state--${l.acceptState}`}>{STATE_LABEL[l.acceptState]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2>教室</h2>
          <Link href="/teacher/classrooms/new" className="button button--secondary">＋ 教室を作る</Link>
        </div>
        {classrooms.length === 0 ? (
          <p className="muted">教室はまだありません。</p>
        ) : (
          <ul className="link-list">
            {classrooms.map((c) => (
              <li key={c.id}>
                <Link href={`/teacher/classrooms/${c.id}`}>{c.name}</Link>{" "}
                <span className="small muted">（{c.seatCount} 席）</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
