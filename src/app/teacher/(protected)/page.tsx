import type { Metadata } from "next";
import Link from "next/link";
import { CopyClassroomForm } from "@/components/seating/CopyClassroomForm";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listClassrooms } from "@/lib/seating/classrooms";
import { listFoldersAndTags, listLectures, STATE_LABEL, type LectureFilter } from "@/lib/seating/lectures";

export const metadata: Metadata = {
  title: "講義一覧",
};

type Search = { q?: string; folder?: string; tag?: string; archived?: string };

export default async function TeacherHomePage({ searchParams }: { searchParams: Promise<Search> }) {
  // レイアウトだけに頼らず、ページでもログインを確認する
  const teacher = await requireTeacher();
  const sp = await searchParams;
  const db = getDb();
  const filter: LectureFilter = {
    q: sp.q?.trim() || undefined,
    folder: sp.folder === undefined || sp.folder === "*" ? undefined : sp.folder,
    tag: sp.tag || undefined,
    archived: sp.archived === "1",
  };
  const lectures = listLectures(db, teacher.teacherId, filter);
  const { folders, tags } = listFoldersAndTags(db, teacher.teacherId);
  const classrooms = listClassrooms(db, teacher.teacherId);
  const filtering = Boolean(filter.q || filter.folder !== undefined || filter.tag || filter.archived);

  return (
    <main className="page">
      <section className="card">
        <div className="card__head">
          <h1>{filter.archived ? "アーカイブした講義" : "講義一覧"}</h1>
          {classrooms.length ? (
            <Link href="/teacher/lectures/new" className="button">＋ 講義を作る</Link>
          ) : null}
        </div>

        <form className="filter-bar" method="get">
          <input className="input input--medium" type="search" name="q" defaultValue={sp.q ?? ""} placeholder="講義名・メモで検索" aria-label="検索" />
          <select className="input input--select-small" name="folder" defaultValue={sp.folder ?? "*"} aria-label="フォルダ">
            <option value="*">すべてのフォルダ</option>
            <option value="">フォルダなし</option>
            {folders.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select className="input input--select-small" name="tag" defaultValue={sp.tag ?? ""} aria-label="タグ">
            <option value="">すべてのタグ</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
          <label className="small">
            <input type="checkbox" name="archived" value="1" defaultChecked={filter.archived} /> アーカイブ
          </label>
          <button type="submit" className="button button--secondary button--small">絞り込む</button>
          {filtering ? <Link href="/teacher" className="small">解除</Link> : null}
        </form>

        {sp.archived === "done" ? <p className="notice" role="status">講義をアーカイブしました。「アーカイブ」にチェックして絞り込むと見られます。</p> : null}

        {classrooms.length === 0 ? (
          <p className="notice">
            まず<Link href="/teacher/classrooms/new">教室を作って</Link>
            ください。教室ができたら講義を作れます。
          </p>
        ) : lectures.length === 0 ? (
          <p className="muted">{filtering ? "条件に合う講義はありません。" : "講義はまだありません。"}</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>講義</th><th>日付</th><th>教室</th><th>抽選</th><th>状態</th></tr>
            </thead>
            <tbody>
              {lectures.map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link href={`/teacher/lectures/${l.id}`}>{l.name}</Link>
                    {l.folder || l.tags.length ? (
                      <div className="tag-line tag-line--small">
                        {l.folder ? <span className="folder-chip">📁 {l.folder}</span> : null}
                        {l.tags.map((t) => <Link key={t} href={`/teacher?tag=${encodeURIComponent(t)}`} className="tag-chip">#{t}</Link>)}
                      </div>
                    ) : null}
                  </td>
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
        <CopyClassroomForm />
      </section>
    </main>
  );
}
