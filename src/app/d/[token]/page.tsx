import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StudentDraw } from "@/components/seating/StudentDraw";
import { getDb } from "@/lib/db";
import { getLectureByToken } from "@/lib/seating/lectures";

export const metadata: Metadata = { title: "座席抽選", referrer: "no-referrer" };

export default async function StudentDrawPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lecture = getLectureByToken(getDb(), token);
  if (!lecture) notFound();

  return (
    <main className="page page--narrow">
      <StudentDraw
        token={token}
        lectureName={lecture.name}
        message={lecture.messageJa}
        initialState={lecture.acceptState}
        layout={lecture.layout}
        seats={lecture.seats.map((s) => ({ number: s.number, color: s.groupColor, label: s.groupName }))}
      />
    </main>
  );
}
