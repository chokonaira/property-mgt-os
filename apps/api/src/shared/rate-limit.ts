// In-memory token-bucket rate limiter.
// v1 only — swap for a Redis-backed implementation before horizontal scaling
// or the per-key state will diverge between API instances.

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimitConfig {
  capacity: number;
  perMinute: number;
}

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export class TokenBucket {
  private readonly buckets = new Map<string, BucketState>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  tryConsume(key: string, config: RateLimitConfig): ConsumeResult {
    const { capacity, perMinute } = config;
    const refillPerMs = perMinute / 60_000;
    const nowMs = this.now();

    const state = this.buckets.get(key) ?? { tokens: capacity, lastRefillMs: nowMs };
    const elapsed = Math.max(0, nowMs - state.lastRefillMs);
    const refilled = Math.min(capacity, state.tokens + elapsed * refillPerMs);

    if (refilled >= 1) {
      const tokens = refilled - 1;
      this.buckets.set(key, { tokens, lastRefillMs: nowMs });
      return { allowed: true, retryAfterSec: 0, remaining: Math.floor(tokens) };
    }

    const deficit = 1 - refilled;
    const retryAfterSec = Math.max(1, Math.ceil(deficit / refillPerMs / 1000));
    this.buckets.set(key, { tokens: refilled, lastRefillMs: nowMs });
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  reset(key?: string): void {
    if (key === undefined) {
      this.buckets.clear();
    } else {
      this.buckets.delete(key);
    }
  }
}

export const rateLimitBucket = new TokenBucket();
