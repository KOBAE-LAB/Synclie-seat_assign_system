import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/seating/AutoRefresh";
import { SeatMap } from "@/components/seating/SeatMap";
import { getDb } from "@/lib/db";
import { listDraws } from "@/lib/seating/draws";
import { getLectureByTtCode, STATE_LABEL } from "@/lib/seating/lectures";
import { TT_COOKIE } from "@/lib/seating/tt-cookie";
import { leaveTtAction } from "../actions";

export const metadata: Metadata = { title: "閲覧（TT・参観）", referrer: "no-referrer" };

/** TT・参観用の閲覧専用画面（操作ボタンなし・端末の識別子も出さない） */
export default async function TtViewPage() {
  const code = (await cookies()).get(TT_COOKIE)?.value;
  const db = getDb();
  const lecture = code ? getLectureByTtCode(db, code) : null;
  if (!lecture) redirect("/tt?expired=1");
  const draws = listDraws(db, lecture.id);
  const taken = new Set(draws.map((d) => d.seatNumber));

  return (
    <main className="page page--wide">
      <AutoRefresh />
      <section className="card">
        <div className="card__head">
          <div>
            <p className="small muted">TT・参観用（閲覧のみ）</p>
            <h1>{lecture.name}</h1>
            <p className="muted small">{lecture.lectureDate ?? "日付なし"}・{lecture.classroomName}・受講者 {lecture.enrolledCount} 人</p>
          </div>
          <div className="stack" style={{ alignItems: "center" }}>
            <span className={`state state--${lecture.acceptState} state--large`}>{STATE_LABEL[lecture.acceptState]}</span>
            <form action={leaveTtAction}>
              <button type="submit" className="button button--secondary button--small">閲覧をやめる</button>
            </form>
          </div>
        </div>
        <p className="big-count">抽選済み <strong>{draws.length}</strong> / {lecture.enrolledCount}</p>
        {lecture.messageJa ? <p className="message">{lecture.messageJa}</p> : null}
      </section>

      <section className="card">
        <h2>座席図</h2>
        <p className="small muted">丸の色＝グループ、点線の丸＝予備席、塗りつぶし＝抽選済み（5 秒ごとに自動更新）</p>
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
      </section>

      {lecture.groups.length ? (
        <section className="card">
          <h2>グループごとの座席</h2>
          <table className="table">
            <thead><tr><th>グループ</th><th>抽選済みの席</th><th>人数</th></tr></thead>
            <tbody>
              {lecture.groups.map((g) => {
                const seats = draws.filter((d) => d.groupName === g.name).map((d) => d.seatNumber);
                return (
                  <tr key={g.id}>
                    <td><span className="legend__swatch" style={{ background: g.color }} /> {g.name}</td>
                    <td>{seats.length ? seats.join("・") : "—"}</td>
                    <td>{seats.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  );
}
