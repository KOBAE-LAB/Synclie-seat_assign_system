import crypto from "node:crypto";
import { promisify } from "node:util";

/**
 * パスワード・復元コード用のハッシュ（node:crypto の scrypt）。
 * 形式: scrypt$<N>$<r>$<p>$<salt(base64url)>$<hash(base64url)>
 */

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

export type ScryptParams = { N: number; r: number; p: number };

/** 既定パラメータ（約 32 MiB / 1 回あたり数十ミリ秒） */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function maxmemFor({ N, r, p }: ScryptParams): number {
  return 128 * N * r * p + 16 * 1024 * 1024;
}

export async function hashSecret(
  secret: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = await scryptAsync(secret.normalize("NFKC"), salt, KEY_LENGTH, {
    ...params,
    maxmem: maxmemFor(params),
  });
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join(
    "$",
  );
}

/** 保存済みハッシュと照合する（比較は定数時間）。形式が不正なら false */
export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isSafeInteger(n) && n > 0)) return false;
  // 異常に大きいパラメータで DoS にならないよう上限を設ける
  if (N > 2 ** 20 || r > 32 || p > 16) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scryptAsync(secret.normalize("NFKC"), salt, expected.length, {
    N,
    r,
    p,
    maxmem: maxmemFor({ N, r, p }),
  });
  return crypto.timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** 存在しない ID でも同程度の時間をかけるためのダミー照合 */
export async function verifyDummy(secret: string): Promise<false> {
  dummyHash ??= hashSecret("synclie-dummy-secret");
  await verifySecret(secret, await dummyHash);
  return false;
}
