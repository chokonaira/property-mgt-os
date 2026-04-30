import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppException } from './exceptions';
import { RATE_LIMIT_METADATA, type RateLimitOptions } from './rate-limit.decorator';
import { rateLimitBucket, type TokenBucket } from './rate-limit';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly bucket: TokenBucket = rateLimitBucket,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const key = `${options.bucketName ?? 'default'}:${options.keyer(req)}`;
    const capacity = options.capacity ?? options.perMinute;
    const result = this.bucket.tryConsume(key, { capacity, perMinute: options.perMinute });

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      throw new AppException(
        'RATE_LIMITED',
        'Too many requests. Try again in a moment.',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSec: result.retryAfterSec },
      );
    }

    return true;
  }
}
