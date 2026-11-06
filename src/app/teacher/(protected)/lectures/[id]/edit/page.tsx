import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LectureInfoForm } from "@/components/seating/LectureInfoForm";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isTranslationAvailable } from "@/lib/i18n/translate";
import { getLecture, listFoldersAndTags } from "@/lib/seating/lectures";

export const metadata: Metadata = { title: "講義の設定" };

export default async function EditLecturePage({ params }: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();
  const { folders } = listFoldersAndTags(db, teacher.teacherId);
  return (
    <main className="page">
      <p><Link href={`/teacher/lectures/${lecture.id}`}>← 講義に戻る</Link></p>
      <section className="card card--accent">
        <p className="eyebrow">LECTURE SETTINGS</p>
        <h1>講義の設定</h1>
        <p className="small muted">学生の画面では「日本語／ふりがな／English」を切り替えて表示できます。座席・グループは講義の作成時に決まります。</p>
        <LectureInfoForm
          lectureId={lecture.id}
          translationAvailable={isTranslationAvailable()}
          folders={folders}
          initial={{
            name: lecture.name,
            lectureDate: lecture.lectureDate ?? "",
            messageJa: lecture.messageJa,
            messageFurigana: lecture.messageFurigana,
            messageEn: lecture.messageEn,
            memo: lecture.memo,
            folder: lecture.folder,
            tags: lecture.tags,
          }}
        />
      </section>
    </main>
  );
}
