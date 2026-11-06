import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/seating/AutoRefresh";
import { ConfirmButton } from "@/components/seating/ConfirmButton";
import { LectureSeatEditor } from "@/components/seating/LectureSeatEditor";
import {
  cancelDrawAction,
  deleteLectureAction,
  issueTtCodeAction,
  setArchivedAction,
  moveDrawAction,
  revokeTtCodeAction,
  proxyDrawAction,
  resetDrawsAction,
  setAcceptStateAction,
} from "@/app/teacher/seating-actions";
import { requireTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { formatTtCode, getLecture, getTtCode, STATE_LABEL } from "@/lib/seating/lectures";
import { publicBaseUrl, studentUrl } from "@/lib/seating/url";

export const metadata: Metadata = { title: "講義" };

export default async function LecturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ proxy?: string; group?: string; error?: string; moved?: string; to?: string; saved?: string }>;
}) {
  const teacher = await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) notFound();

  const draws = listDraws(db, lecture.id);
  const ttCode = getTtCode(db, teacher.teacherId, lecture.id);
  const ttUrl = `${await publicBaseUrl()}/tt`;
  const takenNumbers = new Set(draws.map((d) => d.seatNumber));
  const usedCount = lecture.seats.filter((s) => s.status === "used").length;
  const url = await studentUrl(lecture.publicToken);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <main className="page page--wide">
      <AutoRefresh />
      <p><Link href="/teacher">← 講義一覧へ</Link></p>

      <section className="card card--accent">
        <div className="card__head">
          <div>
            <p className="eyebrow">LECTURE</p>
            <h1>{lecture.name}</h1>
            <p className="muted small">
              {lecture.lectureDate ?? "日付なし"}・{lecture.classroomName}・受講者 {lecture.enrolledCount} 人（使用席 {usedCount} / 全 {lecture.seats.length} 席）
            </p>
          </div>
          <div className="stack" style={{ alignItems: "center" }}>
            <Link href={`/teacher/lectures/${lecture.id}/edit`} className="button button--secondary button--small">講義の設定・メッセージ</Link>
            <span className={`state state--${lecture.acceptState} state--large`}>{STATE_LABEL[lecture.acceptState]}</span>
          </div>
        </div>
        {query.saved === "info" ? <p className="notice" role="status">講義の設定を保存しました。</p> : null}
        {lecture.archived ? <p className="notice">この講義はアーカイブ済みです（学生の QR は使えません）。</p> : null}
        {lecture.folder || lecture.tags.length ? (
          <p className="tag-line">
            {lecture.folder ? <span className="folder-chip">📁 {lecture.folder}</span> : null}
            {lecture.tags.map((t) => <span key={t} className="tag-chip">#{t}</span>)}
          </p>
        ) : null}
        {lecture.memo ? <p className="memo"><span className="small muted">メモ：</span>{lecture.memo}</p> : null}

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
        <LectureSeatEditor
          lectureId={lecture.id}
          layout={lecture.layout}
          seats={lecture.seats}
          groups={lecture.groups}
          takenNumbers={[...takenNumbers]}
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
        {query.moved ? (
          <p className="notice" role="status">
            {query.moved === "swapped" ? `${query.to}番の人と席を入れ替えました。` : `${query.to}番へ移動しました。`}
          </p>
        ) : null}
        {draws.length === 0 ? (
          <p className="muted">まだ抽選はありません。</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>席</th><th>グループ</th><th>方法</th><th>時刻</th><th>席の移動・入れ替え</th><th></th></tr>
            </thead>
            <tbody>
              {draws.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.seatNumber}</strong></td>
                  <td>{d.groupName ?? "—"}</td>
                  <td>{d.drawnBy === "proxy" ? "代理" : `端末 ${d.deviceTag}`}</td>
                  <td>{new Date(d.createdAt).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <form action={moveDrawAction.bind(null, lecture.id, d.id)} className="move-form">
                      <select name="target" className="input input--select-small" defaultValue="" required aria-label={`${d.seatNumber}番の移動先`}>
                        <option value="" disabled>移動先</option>
                        {lecture.seats
                          .filter((s) => s.number !== d.seatNumber)
                          .map((s) => (
                            <option key={s.number} value={s.number}>
                              {s.number}番{takenNumbers.has(s.number) ? "（入れ替え）" : s.status === "spare" ? "（予備）" : ""}
                            </option>
                          ))}
                      </select>
                      <button type="submit" className="button button--secondary button--small">移動</button>
                    </form>
                  </td>
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

      <section className="card" id="tt">
        <h2>TT・参観コード</h2>
        <p className="small muted">
          TT の講師や参観者に渡すと、{ttUrl} でこの講義の抽選状況と座席図を閲覧できます（操作はできません）。再発行すると前のコードは使えなくなります。
        </p>
        {ttCode ? (
          <>
            <p className="tt-code">{formatTtCode(ttCode)}</p>
            <div className="stack">
              <form action={issueTtCodeAction.bind(null, lecture.id)}>
                <ConfirmButton message="コードを再発行します。今のコードは使えなくなります。よろしいですか？">再発行</ConfirmButton>
              </form>
              <form action={revokeTtCodeAction.bind(null, lecture.id)}>
                <ConfirmButton message="コードを無効にします。閲覧中の人も見られなくなります。よろしいですか？">無効にする</ConfirmButton>
              </form>
            </div>
          </>
        ) : (
          <form action={issueTtCodeAction.bind(null, lecture.id)}>
            <button type="submit" className="button button--secondary">コードを発行する</button>
          </form>
        )}
      </section>

      <section className="card">
        <h2>出力</h2>
        <div className="stack">
          <a href={`/teacher/lectures/${lecture.id}/csv`} className="button button--secondary">CSV をダウンロード</a>
          <a href={`/teacher/lectures/${lecture.id}/qr`} className="button button--secondary">QR 画像（PNG）</a>
          <Link href={`/teacher/lectures/${lecture.id}/print?kind=result`} className="button button--secondary">座席図と結果を印刷・PDF</Link>
          <Link href={`/teacher/lectures/${lecture.id}/print?kind=labels`} className="button button--secondary">座席ラベルを印刷</Link>
          <Link href={`/teacher/lectures/${lecture.id}/print?kind=qr`} className="button button--secondary">QR を掲示用に印刷</Link>
        </div>
      </section>

      <section className="card">
        <h2>その他の操作</h2>
        <div className="stack">
          {lecture.acceptState !== "before" ? (
            <form action={setAcceptStateAction.bind(null, lecture.id, "before")}>
              <button type="submit" className="button button--secondary">受付前に戻す</button>
            </form>
          ) : null}
          <form action={setArchivedAction.bind(null, lecture.id, !lecture.archived)}>
            {lecture.archived ? (
              <button type="submit" className="button button--secondary">アーカイブから戻す</button>
            ) : (
              <ConfirmButton message="アーカイブすると一覧から外れ、受付を終了し、学生の QR も使えなくなります（あとで戻せます）。よろしいですか？">アーカイブする</ConfirmButton>
            )}
          </form>
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
