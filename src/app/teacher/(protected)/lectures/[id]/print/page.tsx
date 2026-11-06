import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/PrintButton";
import { SeatMap } from "@/components/seating/SeatMap";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { getLecture } from "@/lib/seating/lectures";
import { studentUrl } from "@/lib/seating/url";

export const metadata: Metadata = { title: "印刷・PDF" };

const KINDS = {
  result: "座席図と抽選結果",
  labels: "座席ラベル（机に置く番号札）",
  qr: "QR コード（掲示用）",
} as const;
type Kind = keyof typeof KINDS;

/** 印刷用ページ。ブラウザの印刷から「PDF に保存」できる */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const { kind: kindParam } = await searchParams;
  const kind: Kind = kindParam && kindParam in KINDS ? (kindParam as Kind) : "result";
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();
  const draws = listDraws(db, lecture.id);
  const taken = new Set(draws.map((d) => d.seatNumber));
  const url = await studentUrl(lecture.publicToken);
  const qrSvg = kind === "qr" ? await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) : "";
  const subtitle = `${lecture.lectureDate ?? ""} ${lecture.classroomName}`.trim();

  return (
    <main className={`page page--wide print-page print-page--${kind}`}>
      <div className="no-print print-toolbar">
        <p><Link href={`/teacher/lectures/${lecture.id}`}>← 講義に戻る</Link></p>
        <div className="stack" style={{ alignItems: "center" }}>
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <Link key={k} href={`?kind=${k}`} className={k === kind ? "button button--small" : "button button--secondary button--small"}>
              {KINDS[k]}
            </Link>
          ))}
          <PrintButton />
        </div>
        <p className="small muted">印刷画面の「送信先」で「PDF に保存」を選ぶと PDF になります。背景のグラフィックを印刷する設定にすると色も出ます。</p>
      </div>

      {kind === "result" ? (
        <>
          <header className="print-header">
            <h1>{lecture.name}</h1>
            <p>{subtitle}・受講者 {lecture.enrolledCount} 人・抽選済み {draws.length} 人</p>
          </header>
          <SeatMap
            layout={lecture.layout}
            seats={lecture.seats.map((s) => ({
              number: s.number,
              color: s.groupColor,
              taken: taken.has(s.number),
              spare: s.status === "spare",
              label: s.groupName,
            }))}
          />
          {lecture.groups.length ? (
            <ul className="legend">
              {lecture.groups.map((g) => (
                <li key={g.id}><span className="legend__swatch" style={{ background: g.color }} />{g.name}</li>
              ))}
            </ul>
          ) : null}
          <table className="table print-table">
            <thead><tr><th>席</th><th>グループ</th><th>方法</th><th>時刻</th></tr></thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.seatNumber}</strong></td>
                  <td>{d.groupName ?? "—"}</td>
                  <td>{d.drawnBy === "proxy" ? "代理" : "学生"}</td>
                  <td>{new Date(d.createdAt).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : kind === "labels" ? (
        <div className="labels">
          {lecture.seats.map((s) => (
            <div key={s.number} className="label" style={{ borderTopColor: s.groupColor ?? "#1f1f1f" }}>
              <div className="label__number">{s.number}</div>
              {s.groupName ? <div className="label__group">グループ {s.groupName}</div> : null}
              <div className="label__meta">{lecture.classroomName}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="qr-poster">
          <p className="qr-poster__title">{lecture.name}</p>
          <p className="qr-poster__lead">QR コードを読み取って「抽選」を押してください</p>
          <div className="qr-poster__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="qr-poster__url">{url}</p>
          <p className="qr-poster__meta">{subtitle}</p>
        </div>
      )}
    </main>
  );
}
