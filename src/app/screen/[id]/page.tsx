import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/seating/AutoRefresh";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { getLecture, STATE_LABEL } from "@/lib/seating/lectures";
import { studentUrl } from "@/lib/seating/url";

export const metadata: Metadata = { title: "スクリーン表示" };

/** プロジェクター用：大きな QR と抽選状況（講師のみ表示できる） */
export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();
  const url = await studentUrl(lecture.publicToken);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const drawn = listDraws(db, lecture.id).length;

  return (
    <div className="screen">
      <AutoRefresh />
      <div className="screen__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="screen__info">
        <p className="screen__title">{lecture.name}</p>
        <p className="screen__lead">
          <span>QR コードを読み取って</span>
          <span>「抽選」を押してください</span>
        </p>
        <p className={`state state--${lecture.acceptState} state--large`}>{STATE_LABEL[lecture.acceptState]}</p>
        <p className="screen__count">
          抽選済み <strong>{drawn}</strong> / {lecture.enrolledCount}
        </p>
        <p className="screen__url">{url}</p>
      </div>
    </div>
  );
}
