import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export type RateLimitKeyer = (req: Request) => string;

export interface RateLimitOptions {
  perMinute: number;
  capacity?: number;
  keyer: RateLimitKeyer;
  bucketName?: string;
}

export const RATE_LIMIT_METADATA = 'buena:rateLimit';

export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_METADATA, options);

export const byIp: RateLimitKeyer = (req) => `ip:${req.ip ?? 'unknown'}`;

// Falls back to a shared `anonymous` bucket when the client supplies no
// session id. That is intentional for v1 — anonymous chat callers all share
// a single bucket so they can't bypass the limit just by omitting the
// header. Real session middleware (T-802 dependency) should populate
// req.session.id so each user gets their own bucket.
export const bySession: RateLimitKeyer = (req) => {
  const sessionId =
    (req.headers['x-session-id'] as string | undefined) ??
    (req as Request & { session?: { id?: string } }).session?.id ??
    'anonymous';
  return `session:${sessionId}`;
};
