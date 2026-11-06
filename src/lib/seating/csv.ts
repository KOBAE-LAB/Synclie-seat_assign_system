/** CSV の 1 セルをエスケープする（Excel での数式実行も防ぐ） */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 行の配列から CSV（先頭に BOM、改行は CRLF）を作る。Excel で文字化けしない */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** ファイル名に使えない文字を置き換える */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60) || "lecture";
}
