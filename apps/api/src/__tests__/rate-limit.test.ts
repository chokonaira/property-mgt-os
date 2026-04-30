import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../shared/rate-limit';

describe('TokenBucket', () => {
  it('allows up to capacity in a single burst', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 5, perMinute: 5 };

    for (let i = 0; i < 5; i++) {
      const result = bucket.tryConsume('ip:1.2.3.4', config);
      expect(result.allowed).toBe(true);
    }
    expect(bucket.tryConsume('ip:1.2.3.4', config).allowed).toBe(false);
  });

  it('returns a Retry-After hint when denied', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 5, perMinute: 5 };

    for (let i = 0; i < 5; i++) bucket.tryConsume('ip:1.2.3.4', config);

    const denied = bucket.tryConsume('ip:1.2.3.4', config);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('refills tokens over time at the per-minute rate', () => {
    let now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 5, perMinute: 5 };

    for (let i = 0; i < 5; i++) bucket.tryConsume('ip:1.2.3.4', config);
    expect(bucket.tryConsume('ip:1.2.3.4', config).allowed).toBe(false);

    now += 12_000; // 12s → 1 full token at 5/min
    expect(bucket.tryConsume('ip:1.2.3.4', config).allowed).toBe(true);
    expect(bucket.tryConsume('ip:1.2.3.4', config).allowed).toBe(false);
  });

  it('isolates buckets per key', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 2, perMinute: 2 };

    expect(bucket.tryConsume('ip:a', config).allowed).toBe(true);
    expect(bucket.tryConsume('ip:a', config).allowed).toBe(true);
    expect(bucket.tryConsume('ip:a', config).allowed).toBe(false);

    expect(bucket.tryConsume('ip:b', config).allowed).toBe(true);
    expect(bucket.tryConsume('ip:b', config).allowed).toBe(true);
    expect(bucket.tryConsume('ip:b', config).allowed).toBe(false);
  });

  it('does not over-fill above capacity after long idle', () => {
    let now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 5, perMinute: 5 };

    bucket.tryConsume('ip:c', config);
    now += 10 * 60_000;

    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume('ip:c', config).allowed).toBe(true);
    }
    expect(bucket.tryConsume('ip:c', config).allowed).toBe(false);
  });

  it('reset(key) clears one bucket', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const config = { capacity: 1, perMinute: 1 };

    bucket.tryConsume('ip:d', config);
    expect(bucket.tryConsume('ip:d', config).allowed).toBe(false);

    bucket.reset('ip:d');
    expect(bucket.tryConsume('ip:d', config).allowed).toBe(true);
  });
});
