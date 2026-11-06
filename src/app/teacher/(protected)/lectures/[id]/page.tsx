import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/seating/AutoRefresh";
import { ConfirmButton } from "@/components/seating/ConfirmButton";
import { SeatMap } from "@/components/seating/SeatMap";
import {
  cancelDrawAction,
  deleteLectureAction,
  proxyDrawAction,
  resetDrawsAction,
  setAcceptStateAction,
} from "@/app/teacher/seating-actions";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { getLecture, STATE_LABEL } from "@/lib/seating/lectures";
import { studentUrl } from "@/lib/seating/url";

export const metadata: Metadata = { title: "講義" };

export default async function LecturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proxy?: string; group?: string; error?: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();

  const draws = listDraws(db, lecture.id);
  const takenNumbers = new Set(draws.map((d) => d.seatNumber));
  const usedCount = lecture.seats.filter((s) => s.status === "used").length;
  const url = await studentUrl(lecture.publicToken);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <main className="page page--wide">
      <AutoRefresh />
      <p><Link href="/teacher">← 講義一覧へ</Link></p>

      <section className="card">
        <div className="card__head">
          <div>
            <h1>{lecture.name}</h1>
            <p className="muted small">
              {lecture.lectureDate ?? "日付なし"}・{lecture.classroomName}・受講者 {lecture.enrolledCount} 人（使用席 {usedCount} / 全 {lecture.seats.length} 席）
            </p>
          </div>
          <span className={`state state--${lecture.acceptState} state--large`}>{STATE_LABEL[lecture.acceptState]}</span>
        </div>

        <div className="lecture-top">
          <div>
            <p className="big-count">
              抽選済み <strong>{draws.length}</strong> / {lecture.enrolledCount}
            </p>
            <div className="stack">
              {lecture.acceptState !== "open" ? (
                <form action={setAcceptStateAction.bind(null, lecture.id, "open")}>
                  <button type="submit" className="button">受付を開始</button>
                </form>
              ) : (
                <form action={setAcceptStateAction.bind(null, lecture.id, "closed")}>
                  <button type="submit" className="button">受付を終了</button>
                </form>
              )}
              <Link href={`/screen/${lecture.id}`} className="button button--secondary" target="_blank">
                QR をスクリーンに表示
              </Link>
              <form action={proxyDrawAction.bind(null, lecture.id)}>
                <button type="submit" className="button button--secondary">代理抽選</button>
              </form>
            </div>
            {query.proxy ? (
              <p className="notice" role="status">
                代理抽選の結果：<strong>{query.proxy}番</strong>
                {query.group ? `（グループ ${query.group}）` : ""}
              </p>
            ) : null}
            {query.error === "full" ? <p className="form-error" role="alert">空いている席がありません。</p> : null}
            <p className="small muted">
              学生用 URL：<a href={url} target="_blank" rel="noreferrer">{url}</a>
            </p>
          </div>
          <div className="qr-small" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        </div>
      </section>

      <section className="card">
        <h2>座席図</h2>
        <p className="small muted">丸の色＝グループ、点線の丸＝予備席、塗りつぶし＝抽選済み、▲＝机の向き（5 秒ごとに自動更新）</p>
        <SeatMap
          layout={lecture.layout}
          seats={lecture.seats.map((s) => ({
            number: s.number,
            color: s.groupColor,
            taken: takenNumbers.has(s.number),
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
      </section>

      <section className="card">
        <h2>抽選結果（{draws.length} 件）</h2>
        {draws.length === 0 ? (
          <p className="muted">まだ抽選はありません。</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>席</th><th>グループ</th><th>方法</th><th>時刻</th><th></th></tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.seatNumber}</strong></td>
                  <td>{d.groupName ?? "—"}</td>
                  <td>{d.drawnBy === "proxy" ? "代理" : `端末 ${d.deviceTag}`}</td>
                  <td>{new Date(d.createdAt).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <form action={cancelDrawAction.bind(null, lecture.id, d.id)}>
                      <ConfirmButton message={`${d.seatNumber}番の抽選を取り消しますか？（その端末はもう一度抽選できるようになります）`} className="button button--secondary button--small">
                        取消
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>その他の操作</h2>
        <div className="stack">
          {lecture.acceptState !== "before" ? (
            <form action={setAcceptStateAction.bind(null, lecture.id, "before")}>
              <button type="submit" className="button button--secondary">受付前に戻す</button>
            </form>
          ) : null}
          <form action={resetDrawsAction.bind(null, lecture.id)}>
            <ConfirmButton message="すべての抽選結果を取り消します。よろしいですか？">抽選をすべてリセット</ConfirmButton>
          </form>
          <form action={deleteLectureAction.bind(null, lecture.id)}>
            <ConfirmButton message={`講義「${lecture.name}」を削除します。抽選結果も消えます。よろしいですか？`}>講義を削除</ConfirmButton>
          </form>
        </div>
      </section>
    </main>
  );
}
