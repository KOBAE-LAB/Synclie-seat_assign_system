import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 死活監視用。DB に接続できればスキーマのバージョンを返す */
export function GET() {
  try {
    const version = getDb().pragma("user_version", { simple: true });
    return Response.json({ status: "ok", schemaVersion: version });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
