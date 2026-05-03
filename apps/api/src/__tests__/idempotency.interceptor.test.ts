import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_REPLAY_HEADER,
  IdempotencyInterceptor,
  IdempotencyStore,
} from '../shared/idempotency.interceptor';
import { AppException } from '../shared/exceptions';

interface FakeRequest {
  method: string;
  path: string;
  actorId?: string;
  tenantId?: string;
  headers: Record<string, string>;
  header(name: string): string | undefined;
}

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => void;
}

function makeContext({
  method = 'POST',
  path = '/properties',
  actorId = 'demo-user',
  tenantId = 'demo',
  idempotencyKey,
}: {
  method?: string;
  path?: string;
  actorId?: string;
  tenantId?: string;
  idempotencyKey?: string;
}): { ctx: ExecutionContext; req: FakeRequest; res: FakeResponse } {
  const headers: Record<string, string> = idempotencyKey
    ? { [IDEMPOTENCY_HEADER]: idempotencyKey }
    : {};
  const req: FakeRequest = {
    method,
    path,
    actorId,
    tenantId,
    headers,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, req, res };
}

function makeHandler(value: unknown): CallHandler {
  const handle = vi.fn(() => of(value));
  return { handle } as unknown as CallHandler;
}

describe('IdempotencyInterceptor', () => {
  it('passes through when no idempotency header is present', async () => {
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const { ctx } = makeContext({});
    const handler = makeHandler({ id: 'p1' });
    const result = await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ id: 'p1' });
    expect(store.size()).toBe(0);
    expect(handler.handle).toHaveBeenCalledTimes(1);
  });

  it('caches the response on first arrival under the composite key', async () => {
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const { ctx } = makeContext({ idempotencyKey: 'abc12345' });
    const handler = makeHandler({ id: 'p1', name: 'Test' });
    await lastValueFrom(interceptor.intercept(ctx, handler));
    expect(store.size()).toBe(1);
  });

  it('replays the cached response on a second arrival with the same key', async () => {
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const handler = makeHandler({ id: 'p1', name: 'Test' });

    const first = makeContext({ idempotencyKey: 'abc12345' });
    await lastValueFrom(interceptor.intercept(first.ctx, handler));

    const second = makeContext({ idempotencyKey: 'abc12345' });
    const replayHandler = makeHandler({ id: 'p2', name: 'Should Not Run' });
    const result = await lastValueFrom(interceptor.intercept(second.ctx, replayHandler));

    expect(result).toEqual({ id: 'p1', name: 'Test' });
    expect(replayHandler.handle).not.toHaveBeenCalled();
    expect(second.res.headers[IDEMPOTENCY_REPLAY_HEADER]).toBe('true');
  });

  it('does NOT replay across different actors using the same key', async () => {
    // Two tenants picking the same UUID by accident must not see
    // each other's data. The composite cache key isolates them.
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);

    const a = makeContext({ idempotencyKey: 'shared-key-1', actorId: 'alice', tenantId: 't1' });
    await lastValueFrom(interceptor.intercept(a.ctx, makeHandler({ id: 'a1' })));

    const b = makeContext({ idempotencyKey: 'shared-key-1', actorId: 'bob', tenantId: 't2' });
    const bHandler = makeHandler({ id: 'b1' });
    const result = await lastValueFrom(interceptor.intercept(b.ctx, bHandler));

    expect(result).toEqual({ id: 'b1' });
    expect(bHandler.handle).toHaveBeenCalled();
  });

  it('does NOT replay across different routes', async () => {
    // Same idempotency key on a different POST (e.g. /buildings)
    // is a different logical write — replaying the property body
    // back to a buildings caller would corrupt the response shape.
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);

    const props = makeContext({ idempotencyKey: 'shared-k-1', path: '/properties' });
    await lastValueFrom(interceptor.intercept(props.ctx, makeHandler({ id: 'p1' })));

    const builds = makeContext({ idempotencyKey: 'shared-k-1', path: '/buildings' });
    const buildsHandler = makeHandler({ id: 'b1' });
    const result = await lastValueFrom(interceptor.intercept(builds.ctx, buildsHandler));

    expect(result).toEqual({ id: 'b1' });
    expect(buildsHandler.handle).toHaveBeenCalled();
  });

  it('rejects malformed idempotency keys with 400 BAD_REQUEST', async () => {
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const { ctx } = makeContext({ idempotencyKey: 'bad key with spaces' });
    expect(() => interceptor.intercept(ctx, makeHandler({ id: 'p1' }))).toThrow(AppException);
  });

  it('rejects too-short keys (under 8 chars)', async () => {
    const store = new IdempotencyStore();
    const interceptor = new IdempotencyInterceptor(store);
    const { ctx } = makeContext({ idempotencyKey: 'short' });
    expect(() => interceptor.intercept(ctx, makeHandler({ id: 'p1' }))).toThrow(AppException);
  });
});

describe('IdempotencyStore', () => {
  it('returns undefined for missing keys', () => {
    const store = new IdempotencyStore();
    expect(store.get('nope')).toBeUndefined();
  });

  it('expires entries past their TTL', () => {
    const store = new IdempotencyStore();
    store.set('k1', { status: 200, body: { id: '1' }, expiresAt: Date.now() - 1 });
    expect(store.get('k1')).toBeUndefined();
    expect(store.size()).toBe(0);
  });

  it('returns live entries', () => {
    const store = new IdempotencyStore();
    store.set('k1', { status: 201, body: { id: '1' }, expiresAt: Date.now() + 60_000 });
    expect(store.get('k1')).toEqual({ status: 201, body: { id: '1' }, expiresAt: expect.any(Number) });
  });
});
