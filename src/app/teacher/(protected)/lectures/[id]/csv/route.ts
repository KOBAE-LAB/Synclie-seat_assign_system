import { getCurrentTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { safeFileName, toCsv } from "@/lib/seating/csv";
import { listDraws } from "@/lib/seating/draws";
import { getLecture } from "@/lib/seating/lectures";

export const dynamic = "force-dynamic";

/** 講義の座席と抽選結果の CSV（講師のみ） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await getCurrentTeacher();
  if (!teacher) return new Response("ログインしてください。", { status: 401 });
  const { id } = await params;
  const db = getDb();
  const lecture = getLecture(db, teacher.teacherId, Number(id));
  if (!lecture) return new Response("見つかりません。", { status: 404 });
  const draws = new Map(listDraws(db, lecture.id).map((d) => [d.seatNumber, d]));
  const time = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false });

  const rows = [
    ["席番号", "グループ", "席の種類", "抽選", "方法", "抽選時刻", "端末"],
    ...lecture.seats.map((s) => {
      const d = draws.get(s.number);
      return [
        s.number,
        s.groupName ?? "",
        s.status === "used" ? "使用" : "予備",
        d ? "済" : "",
        d ? (d.drawnBy === "proxy" ? "代理" : "学生") : "",
        d ? time(d.createdAt) : "",
        d?.deviceTag ?? "",
      ];
    }),
  ];
  const fileName = `${safeFileName(lecture.name)}_${lecture.lectureDate ?? "nodate"}.csv`;
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="seats.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
