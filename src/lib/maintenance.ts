import { purgeInactiveTeachers } from "./auth/account.ts";
import { getDb } from "./db/index.ts";

const INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 30 * 1000;

const globalForMaintenance = globalThis as unknown as { __seatAssignMaintenance?: boolean };

/** 一度だけ実行する：2 年使われていないアカウントの削除と、期限切れセッションの掃除 */
export function runMaintenance(): void {
  try {
    const deleted = purgeInactiveTeachers(getDb());
    if (deleted) console.log(`[maintenance] 2 年間使われていないアカウントを ${deleted} 件削除しました。`);
  } catch (e) {
    console.error("[maintenance] 自動削除に失敗しました", e);
  }
}

/** サーバー起動時に呼ぶ。起動 30 秒後と、その後 6 時間ごとに実行する */
export function startMaintenance(): void {
  if (globalForMaintenance.__seatAssignMaintenance) return;
  if (process.env.SEAT_ASSIGN_DISABLE_PURGE === "1") return;
  globalForMaintenance.__seatAssignMaintenance = true;
  setTimeout(runMaintenance, FIRST_RUN_DELAY_MS).unref();
  setInterval(runMaintenance, INTERVAL_MS).unref();
}
