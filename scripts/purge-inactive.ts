// 使い方: npm run purge:inactive （最後のログインから 2 年たったアカウントを今すぐ削除）
import { purgeInactiveTeachers } from "../src/lib/auth/account.ts";
import { openDatabase, resolveDbPath } from "../src/lib/db/index.ts";

const db = openDatabase(resolveDbPath());
const deleted = purgeInactiveTeachers(db);
db.close();
console.log(`削除したアカウント: ${deleted} 件`);
