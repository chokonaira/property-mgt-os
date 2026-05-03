import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { of, tap, type Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { AppException } from './exceptions';

export const IDEMPOTENCY_HEADER = 'x-idempotency-key';
export const IDEMPOTENCY_REPLAY_HEADER = 'x-idempotent-replayed';
const KEY_FORMAT = /^[a-zA-Z0-9_-]{8,128}$/;
const DEFAULT_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 5_000;

interface CachedResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

/**
 * Idempotency layer. The classic distributed-systems hedge against
 * duplicate writes from a flaky network, a double-clicked Save, or
 * a client retry that fired after the server already committed.
 *
 * Contract:
 *   - Client sends `X-Idempotency-Key: <uuid>` on a POST.
 *   - First arrival: request runs normally; the response (status +
 *     body) is cached against the composite key
 *     `actor:tenant:method:path:idempotency-key` for 5 minutes.
 *   - Subsequent arrivals with the same key + same actor + same
 *     route: replayed from cache with an `X-Idempotent-Replayed: true`
 *     header so the client can distinguish a retry from a fresh write.
 *   - Missing or malformed key: pass through (header is opt-in).
 *
 * What this is NOT:
 *   - A request-body equality check. We trust the key. If a client
 *     reuses the same key with a different body, that's a client
 *     bug; this layer would still replay the original response.
 *     Stripe documents the same trade-off.
 *   - Persistent. The Map is in-process; a deploy / restart drops
 *     the cache. For our take-home that's fine; production swaps
 *     `IdempotencyStore` for a Redis-backed implementation.
 *
 * Scope is opt-in via `@UseInterceptors(IdempotencyInterceptor)` on
 * the controller method. POST /properties is the obvious mount —
 * it writes a property + buildings + units in one shot, which is
 * exactly the kind of operation the user must not have happen twice.
 */
/**
 * In-memory idempotency cache with TTL eviction. Lazy expiry on
 * read; bounded growth via a `MAX_ENTRIES` ceiling that drops the
 * oldest insert when full. Production swap: Redis with `SETEX`.
 *
 * Defined ABOVE the interceptor so the interceptor's constructor
 * can reference it as a DI token without hitting a temporal-dead-zone
 * error at class-decoration time.
 */
@Injectable()
export class IdempotencyStore {
  private readonly entries = new Map<string, CachedResponse>();

  get(key: string): CachedResponse | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return hit;
  }

  set(key: string, value: CachedResponse): void {
    if (this.entries.size >= MAX_ENTRIES && !this.entries.has(key)) {
      // Drop oldest by insertion order — Map iteration order is
      // insertion order in modern JS, so the first key is the
      // oldest unread entry.
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(key, value);
  }

  /** Test affordance — clears the entire cache. Don't call in prod. */
  clear(): void {
    this.entries.clear();
  }

  /** Test affordance — current size. */
  size(): number {
    return this.entries.size;
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly store: IdempotencyStore;

  constructor(@Optional() @Inject(IdempotencyStore) injected?: IdempotencyStore) {
    // Inject a real store in production wiring; tests provide a
    // direct instance via `new IdempotencyInterceptor(store)` — the
    // @Optional path falls back to a fresh instance only when DI
    // didn't provide one (typically in stand-alone unit tests).
    this.store = injected ?? new IdempotencyStore();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const rawKey = req.header(IDEMPOTENCY_HEADER);
    if (!rawKey) return next.handle();

    if (!KEY_FORMAT.test(rawKey)) {
      // Malformed key is a client bug worth surfacing — silently
      // ignoring would mask retries that aren't actually idempotent.
      throw new AppException(
        'BAD_REQUEST',
        `Invalid ${IDEMPOTENCY_HEADER} header. Expected an opaque token of 8–128 chars [a-zA-Z0-9_-].`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Composite key includes actor + tenant so two tenants
    // accidentally picking the same UUID don't share a slot.
    const actorId = (req as Request & { actorId?: string }).actorId ?? 'anon';
    const tenantId = (req as Request & { tenantId?: string }).tenantId ?? 'anon';
    const cacheKey = `${actorId}:${tenantId}:${req.method}:${req.path}:${rawKey}`;

    const cached = this.store.get(cacheKey);
    if (cached) {
      res.setHeader(IDEMPOTENCY_REPLAY_HEADER, 'true');
      res.status(cached.status);
      this.logger.log({ event: 'idempotency.replayed', cacheKey: hashKey(cacheKey) });
      return of(cached.body);
    }

    return next.handle().pipe(
      tap((body) => {
        this.store.set(cacheKey, {
          status: res.statusCode || 200,
          body,
          expiresAt: Date.now() + DEFAULT_TTL_MS,
        });
      }),
    );
  }
}

function hashKey(raw: string): string {
  // Tiny non-cryptographic hash for log lines so we don't spill
  // the actual idempotency key into telemetry.
  let h = 0;
  for (let i = 0; i < raw.length; i += 1) {
    h = (h * 31 + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
