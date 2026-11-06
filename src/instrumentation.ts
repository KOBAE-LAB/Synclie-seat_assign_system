/** Next.js がサーバー起動時に一度だけ呼ぶ */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMaintenance } = await import("./lib/maintenance");
    startMaintenance();
  }
}
