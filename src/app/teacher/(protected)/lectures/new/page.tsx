import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LectureForm } from "@/components/seating/LectureForm";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listClassrooms } from "@/lib/seating/classrooms";

export const metadata: Metadata = { title: "講義を作る" };

export default async function NewLecturePage() {
  const teacher = await requireTeacher();
  const classrooms = listClassrooms(getDb(), teacher.teacherId).filter((c) => c.seatCount > 0);
  if (!classrooms.length) redirect("/teacher/classrooms/new");
  return (
    <main className="page">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card">
        <h1>講義を作る</h1>
        <LectureForm classrooms={classrooms} />
      </section>
    </main>
  );
}
