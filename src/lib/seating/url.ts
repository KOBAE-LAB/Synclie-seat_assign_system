import { headers } from "next/headers";

/** 学生用 URL の基点。PUBLIC_BASE_URL があればそれを、なければリクエストのホストを使う */
export async function publicBaseUrl(): Promise<string> {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function studentUrl(publicToken: string): Promise<string> {
  return `${await publicBaseUrl()}/d/${publicToken}`;
}
