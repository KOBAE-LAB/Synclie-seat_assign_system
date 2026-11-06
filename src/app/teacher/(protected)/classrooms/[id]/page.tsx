import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassroomEditor } from "@/components/seating/ClassroomEditor";
import { ConfirmButton } from "@/components/seating/ConfirmButton";
import { deleteClassroomAction, issueShareCodeAction, revokeShareCodeAction } from "@/app/teacher/seating-actions";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getClassroom, getShareCode } from "@/lib/seating/classrooms";
import { formatTtCode } from "@/lib/seating/lectures";

export const metadata: Metadata = { title: "教室を編集" };

export default async function EditClassroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; copied?: string; share?: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const { error, copied } = await searchParams;
  const db = getDb();
  const classroom = getClassroom(db, teacher.teacherId, Number(id));
  if (!classroom) notFound();
  const shareCode = getShareCode(db, teacher.teacherId, classroom.id);

  return (
    <main className="page page--wide">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card">
        <h1>教室を編集：{classroom.name}</h1>
        {copied ? <p className="notice" role="status">共有コードから教室をコピーしました。必要に応じて名前や配置を直して保存してください。</p> : null}
        <p className="small muted">講義を作った後に教室を編集しても、作成済みの講義の座席図は変わりません。</p>
        <ClassroomEditor id={classroom.id} initialName={classroom.name} initialLayout={classroom.layout} />
      </section>
      <section className="card" id="share">
        <h2>ほかの講師と共有</h2>
        <p className="small muted">
          共有コードを渡すと、ほかの講師が講義一覧の「共有コードから教室をコピー」で、この教室の配置を自分の教室としてコピーできます（あなたの教室や講義は変更されません）。
        </p>
        {shareCode ? (
          <>
            <p className="tt-code">{formatTtCode(shareCode)}</p>
            <div className="stack">
              <form action={issueShareCodeAction.bind(null, classroom.id)}>
                <ConfirmButton message="共有コードを再発行します。今のコードは使えなくなります。よろしいですか？">再発行</ConfirmButton>
              </form>
              <form action={revokeShareCodeAction.bind(null, classroom.id)}>
                <ConfirmButton message="共有コードを無効にしますか？">無効にする</ConfirmButton>
              </form>
            </div>
          </>
        ) : (
          <form action={issueShareCodeAction.bind(null, classroom.id)}>
            <button type="submit" className="button button--secondary">共有コードを発行する</button>
          </form>
        )}
      </section>
      <section className="card">
        <h2>教室を削除</h2>
        {error === "in_use" ? (
          <p className="form-error" role="alert">この教室を使っている講義があるため削除できません。</p>
        ) : null}
        <form action={deleteClassroomAction.bind(null, classroom.id)}>
          <ConfirmButton message={`「${classroom.name}」を削除しますか？`}>削除する</ConfirmButton>
        </form>
      </section>
    </main>
  );
}
