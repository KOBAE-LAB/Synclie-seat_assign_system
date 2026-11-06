import QRCode from "qrcode";
import { getCurrentTeacher } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { safeFileName } from "@/lib/seating/csv";
import { getLecture } from "@/lib/seating/lectures";
import { studentUrl } from "@/lib/seating/url";

export const dynamic = "force-dynamic";

/** 学生用 QR コードの PNG（1024px、講師のみ） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await getCurrentTeacher();
  if (!teacher) return new Response("ログインしてください。", { status: 401 });
  const { id } = await params;
  const lecture = getLecture(getDb(), teacher.teacherId, Number(id));
  if (!lecture) return new Response("見つかりません。", { status: 404 });
  const png = await QRCode.toBuffer(await studentUrl(lecture.publicToken), {
    type: "png",
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  const fileName = `${safeFileName(lecture.name)}_QR.png`;
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr.png"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
