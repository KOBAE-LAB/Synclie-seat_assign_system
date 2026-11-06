import crypto from "node:crypto";

/** 見間違えやすい 0 / O / 1 / I / L を除いた英数字（31 文字） */
export const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const GROUPS = 4;
const GROUP_LENGTH = 4;

/** 復元コードを生成する（形式: XXXX-XXXX-XXXX-XXXX、約 79 ビット） */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = "";
    for (let i = 0; i < GROUP_LENGTH; i++) {
      s += RECOVERY_CODE_ALPHABET[crypto.randomInt(RECOVERY_CODE_ALPHABET.length)];
    }
    groups.push(s);
  }
  return groups.join("-");
}

/** 入力を正規化する（大文字・小文字、ハイフン・空白の有無を問わない） */
export function normalizeRecoveryCode(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\s\-‐‑‒–—―ー－]/g, "")
    .toUpperCase();
}

/** 正規化後の形式チェック（照合前のふるい分け用） */
export function isWellFormedRecoveryCode(normalized: string): boolean {
  return new RegExp(`^[${RECOVERY_CODE_ALPHABET}]{${GROUPS * GROUP_LENGTH}}$`).test(normalized);
}
