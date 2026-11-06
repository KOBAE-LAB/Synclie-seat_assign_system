import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassroomEditor } from "@/components/seating/ClassroomEditor";
import { ConfirmButton } from "@/components/seating/ConfirmButton";
import { deleteClassroomAction } from "@/app/teacher/seating-actions";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getClassroom } from "@/lib/seating/classrooms";

export const metadata: Metadata = { title: "教室を編集" };

export default async function EditClassroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const { error } = await searchParams;
  const classroom = getClassroom(getDb(), teacher.teacherId, Number(id));
  if (!classroom) notFound();

  return (
    <main className="page page--wide">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card">
        <h1>教室を編集：{classroom.name}</h1>
        <p className="small muted">講義を作った後に教室を編集しても、作成済みの講義の座席図は変わりません。</p>
        <ClassroomEditor id={classroom.id} initialName={classroom.name} initialLayout={classroom.layout} />
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
