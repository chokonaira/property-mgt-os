import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { TokenBucket } from '../shared/rate-limit';
import { RateLimitGuard } from '../shared/rate-limit.guard';
import { byIp, RATE_LIMIT_METADATA, type RateLimitOptions } from '../shared/rate-limit.decorator';
import { AppException } from '../shared/exceptions';

interface MockRes {
  setHeader: ReturnType<typeof vi.fn>;
}

function makeContext(
  options: RateLimitOptions | undefined,
  ip = '1.2.3.4',
): {
  ctx: ExecutionContext;
  res: MockRes;
  reflector: Reflector;
} {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(options);
  const res: MockRes = { setHeader: vi.fn() };
  const req = { ip, headers: {} };
  const ctx = {
    getHandler: () => ({}) as unknown,
    getClass: () => ({}) as unknown,
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, res, reflector };
}

describe('RateLimitGuard', () => {
  it('skips when no @RateLimit metadata is set', () => {
    const { ctx, reflector } = makeContext(undefined);
    const guard = new RateLimitGuard(reflector, new TokenBucket(() => 0));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes through while under the per-minute cap', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const options: RateLimitOptions = { perMinute: 5, keyer: byIp, bucketName: 'extraction' };
    const { ctx, reflector } = makeContext(options);
    const guard = new RateLimitGuard(reflector, bucket);

    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('throws AppException(RATE_LIMITED) and sets Retry-After when over', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const options: RateLimitOptions = { perMinute: 5, keyer: byIp, bucketName: 'extraction' };
    const { ctx, res, reflector } = makeContext(options);
    const guard = new RateLimitGuard(reflector, bucket);

    for (let i = 0; i < 5; i++) guard.canActivate(ctx);

    expect(() => guard.canActivate(ctx)).toThrowError(AppException);
    try {
      guard.canActivate(ctx);
    } catch (err) {
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).code).toBe('RATE_LIMITED');
      expect((err as AppException).getStatus()).toBe(429);
    }
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('isolates buckets per (bucketName, keyer-output)', () => {
    const now = 0;
    const bucket = new TokenBucket(() => now);
    const optionsA: RateLimitOptions = {
      perMinute: 1,
      keyer: byIp,
      bucketName: 'extraction',
    };
    const optionsB: RateLimitOptions = {
      perMinute: 1,
      keyer: byIp,
      bucketName: 'chat',
    };
    const a = makeContext(optionsA);
    const b = makeContext(optionsB);
    const guard = new RateLimitGuard(a.reflector, bucket);

    expect(guard.canActivate(a.ctx)).toBe(true);

    const guardB = new RateLimitGuard(b.reflector, bucket);
    expect(guardB.canActivate(b.ctx)).toBe(true);
  });
});

describe('@RateLimit metadata helper', () => {
  it('exports the metadata key', () => {
    expect(RATE_LIMIT_METADATA).toBe('buena:rateLimit');
  });
});
