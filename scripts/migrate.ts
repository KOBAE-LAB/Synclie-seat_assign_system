// 使い方: npm run db:migrate （SEAT_ASSIGN_DB_PATH の DB にマイグレーションを適用）
import { openDatabase, resolveDbPath } from "../src/lib/db/index.ts";

const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
const version = db.pragma("user_version", { simple: true });
db.close();
console.log(`マイグレーション完了: ${dbPath} (schema version ${version})`);
