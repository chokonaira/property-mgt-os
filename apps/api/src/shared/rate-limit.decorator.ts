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

export const bySession: RateLimitKeyer = (req) => {
  const sessionId =
    (req.headers['x-session-id'] as string | undefined) ??
    (req as Request & { session?: { id?: string } }).session?.id ??
    'anonymous';
  return `session:${sessionId}`;
};
