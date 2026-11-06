/**
 * IP アドレスごとの簡易レート制限（固定ウィンドウ・プロセス内メモリ）。
 * 1 プロセス構成（systemd で next start 1 つ）を前提にしている。
 */

export type RateLimitRule = { limit: number; windowMs: number };

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly rule: RateLimitRule;
  private readonly maxKeys: number;

  constructor(rule: RateLimitRule, maxKeys = 10_000) {
    this.rule = rule;
    this.maxKeys = maxKeys;
  }

  /** 1 回分を消費する。上限を超えていれば false */
  consume(key: string, now: number = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      bucket = { count: 0, resetAt: now + this.rule.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= this.rule.limit;
  }

  private sweep(now: number): void {
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
    // それでも多すぎる場合は古いものから捨てる
    while (this.buckets.size >= this.maxKeys) {
      this.buckets.delete(this.buckets.keys().next().value as string);
    }
  }
}

const globalForLimits = globalThis as unknown as { __seatAssignLimits?: Record<string, RateLimiter> };

/** 用途ごとの共有リミッタ */
export const rateLimits = (globalForLimits.__seatAssignLimits ??= {
  // ログイン・パスワード再設定の試行：10 分に 20 回まで
  auth: new RateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 }),
  // アカウント作成：1 時間に 10 件まで
  signup: new RateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 }),
  // ログイン ID の空き確認：1 分に 60 回まで
  loginIdCheck: new RateLimiter({ limit: 60, windowMs: 60 * 1000 }),
});

export const RATE_LIMIT_MESSAGE = "試行回数が多すぎます。しばらく待ってからもう一度お試しください。";
