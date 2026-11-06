import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/seating/AutoRefresh";
import { SeatMap } from "@/components/seating/SeatMap";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { getLecture, STATE_LABEL } from "@/lib/seating/lectures";
import { studentUrl } from "@/lib/seating/url";

export const metadata: Metadata = { title: "スクリーン表示" };

/** プロジェクター用：QR・抽選状況と、埋まった席をグレーアウトした座席図（講師のみ表示できる） */
export default async function ScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();
  const url = await studentUrl(lecture.publicToken);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const taken = new Set(listDraws(db, lecture.id).map((d) => d.seatNumber));
  const remaining = lecture.seats.filter((s) => !taken.has(s.number)).length;

  return (
    <div className="screen">
      <AutoRefresh />
      <div className="screen__side">
        <p className="screen__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/neutral.png" alt="" width={44} height={44} />
          SYNCLIE ・ 座席・グループ抽選
        </p>
        <p className="screen__title">{lecture.name}</p>
        <div className="screen__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="screen__lead">
          <span>QR コードを読み取って</span>
          <span>「抽選」を押してください</span>
        </p>
        <p className={`state state--${lecture.acceptState} state--large`}>{STATE_LABEL[lecture.acceptState]}</p>
        <p className="screen__count">
          抽選済み <strong>{taken.size}</strong> / {lecture.enrolledCount}
          <span className="screen__remaining">空席 {remaining}</span>
        </p>
        <p className="screen__url">{url}</p>
      </div>
      <div className="screen__map">
        <SeatMap
          layout={lecture.layout}
          size="screen"
          takenStyle="grey"
          seats={lecture.seats.map((s) => ({
            number: s.number,
            color: s.groupColor,
            taken: taken.has(s.number),
            spare: s.status === "spare",
            label: s.groupName,
          }))}
        />
        <p className="screen__legend">
          <span className="screen__legend-item"><span className="legend-dot legend-dot--free" />空席</span>
          <span className="screen__legend-item"><span className="legend-dot legend-dot--grey" />埋まった席</span>
          {lecture.groups.map((g) => (
            <span key={g.id} className="screen__legend-item">
              <span className="legend-dot" style={{ borderColor: g.color }} />
              {g.name}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
