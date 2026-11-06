import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrations } from "./migrations.ts";

export type Db = Database.Database;

export const DEFAULT_DB_PATH = "./data/seat-assign.db";

/** 環境変数 SEAT_ASSIGN_DB_PATH から DB ファイルのパスを決める */
export function resolveDbPath(
  env: Partial<Record<string, string>> = process.env,
): string {
  // 実行時に決まるパスなので、ビルド時のファイルトレース対象から外す
  return path.resolve(/*turbopackIgnore: true*/ env.SEAT_ASSIGN_DB_PATH || DEFAULT_DB_PATH);
}

/** 未適用のマイグレーションを順に適用し、適用後のバージョンを返す */
export function migrate(db: Db): number {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (const m of migrations) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
  return db.pragma("user_version", { simple: true }) as number;
}

/** DB を開いて PRAGMA を設定し、マイグレーションを適用する。":memory:" も可 */
export function openDatabase(filename: string): Db {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  if (filename !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __seatAssignDb?: Db };

/** アプリ全体で共有する接続（開発時のホットリロードでも 1 つに保つ） */
export function getDb(): Db {
  if (!globalForDb.__seatAssignDb) {
    globalForDb.__seatAssignDb = openDatabase(resolveDbPath());
  }
  return globalForDb.__seatAssignDb;
}
