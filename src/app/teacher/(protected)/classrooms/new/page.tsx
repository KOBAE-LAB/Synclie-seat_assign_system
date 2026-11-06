import type { Metadata } from "next";
import Link from "next/link";
import { ClassroomEditor } from "@/components/seating/ClassroomEditor";
import { arrangeDesks, emptyLayout, renumberSeats, withSeats } from "@/lib/seating/layout";

export const metadata: Metadata = { title: "教室を作る" };

export default function NewClassroomPage() {
  // 初期状態：黒板と、学生机 6 列 × 8 台（2 台ごとに通路）
  const base = emptyLayout(1000, 800);
  const desks = [0, 1, 2, 3].flatMap((block) =>
    arrangeDesks({ type: "student", rows: 6, cols: 2, pitchX: 80, pitchY: 95, startX: 140 + block * 240, startY: 150 }, block * 12 + 1, `b${block}-`),
  );
  const initial = renumberSeats(withSeats({ ...base, desks }));
  return (
    <main className="page page--wide">
      <p><Link href="/teacher">← 講義一覧へ</Link></p>
      <section className="card card--accent">
        <p className="eyebrow">CLASSROOM</p>
        <h1>教室を作る</h1>
        <ClassroomEditor initialLayout={initial} />
      </section>
    </main>
  );
}
