import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

// scrypt のパラメータ（N=2^15, r=8, p=1, 約 32MB）。変更しても既存ハッシュは検証できる。
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

function scryptAsync(secret: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LEN, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** パスワード・復旧コードのハッシュ。形式: scrypt$N$r$p$salt(b64)$hash(b64) */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scryptAsync(secret, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  const key = await scryptAsync(secret, salt, n, r, p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 存在しない ID でも応答時間を揃えるためのダミーハッシュ */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashSecret("synclie-dummy-password");
  return dummyHash;
}

// 紛らわしい文字（0/O, 1/I/L）を除いた 32 文字
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_LENGTH = 16; // 約 79 ビット

/** 復旧コードを生成する（表示用に 4 文字ごとにハイフン区切り） */
export function generateRecoveryCode(): string {
  let raw = "";
  for (let i = 0; i < RECOVERY_LENGTH; i++) {
    raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  }
  return raw.match(/.{4}/g)!.join("-");
}

/** 入力された復旧コードを正規化（空白・ハイフン除去、大文字化、全角→半角） */
export function normalizeRecoveryCode(input: string): string {
  return input
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-‐－ー]/g, "");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}
