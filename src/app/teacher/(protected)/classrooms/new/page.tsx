import type { Metadata } from "next";
import Link from "next/link";
import { ClassroomEditor } from "@/components/seating/ClassroomEditor";
import { emptyLayout, templateCells, buildLayout } from "@/lib/seating/layout";

export const metadata: Metadata = { title: "教室を作る" };

export default function NewClassroomPage() {
  const initial = buildLayout(6, 8, templateCells(6, 8, 2));
  return (
    <main className="page page--wide">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card">
        <h1>教室を作る</h1>
        <ClassroomEditor initialLayout={initial.seats.length ? initial : emptyLayout()} />
      </section>
    </main>
  );
}
