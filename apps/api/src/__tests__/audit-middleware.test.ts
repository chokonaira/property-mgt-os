import { describe, expect, it, vi } from 'vitest';
import { pruneAuditLog, registerAuditMiddleware } from '../shared/audit-middleware';

interface Params {
  model?: string;
  action: string;
  args: { where?: Record<string, unknown> } & Record<string, unknown>;
}

/**
 * Tiny harness that mimics Prisma's $use middleware semantics. The
 * real client invokes registered handlers around each operation; we
 * register one handler via `registerAuditMiddleware` and drive it with
 * synthetic params + a `next` stub so we can assert the call shape
 * without a live DB.
 */
function makeHarness(opts: {
  contextStore?: { actorId: string; tenantId: string } | undefined;
  beforeRow?: unknown;
  nextResult?: unknown;
}) {
  const handlers: Array<(params: Params, next: (p: Params) => Promise<unknown>) => Promise<unknown>> = [];
  const auditCreate = vi.fn(async (_arg: unknown) => ({}));
  const findUnique = vi.fn(async (_arg: unknown) => opts.beforeRow ?? null);
  const next = vi.fn(async (_p: Params) => opts.nextResult ?? null);

  const prisma = {
    $use: (h: (params: Params, next: (p: Params) => Promise<unknown>) => Promise<unknown>) => {
      handlers.push(h);
    },
    auditLog: { create: auditCreate },
    property: { findUnique },
    building: { findUnique },
    unit: { findUnique },
    contact: { findUnique },
  } as unknown as Parameters<typeof registerAuditMiddleware>[0];

  const requestContext = {
    get: () => opts.contextStore,
  } as unknown as Parameters<typeof registerAuditMiddleware>[1];

  registerAuditMiddleware(prisma, requestContext);

  return {
    invoke: (params: Params) => handlers[0]!(params, next),
    auditCreate,
    findUnique,
    next,
  };
}

const ctx = { actorId: 'demo-user', tenantId: 'demo' };

describe('registerAuditMiddleware', () => {
  it('writes an audit row on Property.create with after-snapshot only', async () => {
    const harness = makeHarness({
      contextStore: ctx,
      nextResult: { id: 'p1', name: 'Parkview' },
    });
    await harness.invoke({ model: 'Property', action: 'create', args: { data: { name: 'Parkview' } } });
    expect(harness.next).toHaveBeenCalledOnce();
    expect(harness.findUnique).not.toHaveBeenCalled();
    expect(harness.auditCreate).toHaveBeenCalledOnce();
    const arg = harness.auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      tenantId: 'demo',
      actorId: 'demo-user',
      entity: 'Property',
      entityId: 'p1',
      action: 'create',
      before: null,
      after: { id: 'p1', name: 'Parkview' },
    });
  });

  it('writes an audit row on Unit.update with both before and after snapshots', async () => {
    const harness = makeHarness({
      contextStore: ctx,
      beforeRow: { id: 'u1', number: '01', meaShare: 100 },
      nextResult: { id: 'u1', number: '01', meaShare: 250 },
    });
    await harness.invoke({
      model: 'Unit',
      action: 'update',
      args: { where: { id: 'u1' }, data: { meaShare: 250 } },
    });
    expect(harness.findUnique).toHaveBeenCalledOnce();
    expect(harness.auditCreate).toHaveBeenCalledOnce();
    const arg = harness.auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data.entity).toBe('Unit');
    expect(arg.data.action).toBe('update');
    expect(arg.data.before).toEqual({ id: 'u1', number: '01', meaShare: 100 });
    expect(arg.data.after).toEqual({ id: 'u1', number: '01', meaShare: 250 });
  });

  it('writes an audit row on Building.delete with after=null', async () => {
    const harness = makeHarness({
      contextStore: ctx,
      beforeRow: { id: 'b1', street: 'Musterstr.' },
      nextResult: { id: 'b1', street: 'Musterstr.' },
    });
    await harness.invoke({
      model: 'Building',
      action: 'delete',
      args: { where: { id: 'b1' } },
    });
    expect(harness.auditCreate).toHaveBeenCalledOnce();
    const arg = harness.auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data.action).toBe('delete');
    expect(arg.data.before).toEqual({ id: 'b1', street: 'Musterstr.' });
    expect(arg.data.after).toBeNull();
  });

  it('writes an audit row on Contact.upsert (treated as a write that may have a before)', async () => {
    const harness = makeHarness({
      contextStore: ctx,
      beforeRow: { id: 'c1', name: 'Old' },
      nextResult: { id: 'c1', name: 'New' },
    });
    await harness.invoke({
      model: 'Contact',
      action: 'upsert',
      args: { where: { id: 'c1' }, update: { name: 'New' }, create: { name: 'New' } },
    });
    expect(harness.findUnique).toHaveBeenCalled();
    expect(harness.auditCreate).toHaveBeenCalledOnce();
  });

  it('skips non-auditable models entirely (no findUnique, no audit row)', async () => {
    const harness = makeHarness({ contextStore: ctx, nextResult: { id: 'd1' } });
    await harness.invoke({
      model: 'Document',
      action: 'create',
      args: { data: { filename: 'x.pdf' } },
    });
    expect(harness.next).toHaveBeenCalledOnce();
    expect(harness.findUnique).not.toHaveBeenCalled();
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it('skips non-auditable actions (read paths leave no log)', async () => {
    const harness = makeHarness({ contextStore: ctx, nextResult: [{ id: 'p1' }] });
    await harness.invoke({ model: 'Property', action: 'findMany', args: {} });
    expect(harness.next).toHaveBeenCalledOnce();
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it('skips audit when the request context is empty (seed scripts, migrations, repl)', async () => {
    // No actor in scope = nothing meaningful to attribute. We still let
    // the write through — seed needs to insert rows — but suppress the
    // audit row so the history isn't polluted with "demo-user wrote 14
    // units" on every container restart.
    const harness = makeHarness({
      contextStore: undefined,
      nextResult: { id: 'p1', name: 'Seed' },
    });
    await harness.invoke({ model: 'Property', action: 'create', args: { data: {} } });
    expect(harness.next).toHaveBeenCalledOnce();
    expect(harness.auditCreate).not.toHaveBeenCalled();
  });

  it('does not block the originating write when the audit insert throws', async () => {
    // Telemetry must never break user data. The write returns its
    // result; the audit failure is logged to console.warn but
    // swallowed so the controller still gets the success path.
    const harness = makeHarness({
      contextStore: ctx,
      nextResult: { id: 'p1', name: 'X' },
    });
    (harness.auditCreate as unknown as { mockImplementationOnce: (fn: () => Promise<unknown>) => void })
      .mockImplementationOnce(async () => {
        throw new Error('audit-table-down');
      });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await harness.invoke({
      model: 'Property',
      action: 'create',
      args: { data: { name: 'X' } },
    });
    expect(result).toEqual({ id: 'p1', name: 'X' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('swallows prune failures from the fire-and-forget retention sweep', async () => {
    // Force the probabilistic prune to fire, then have it throw —
    // simulates an audit-table-down condition or a partial mock that
    // doesn't implement prisma.auditLog.count. The middleware must
    // catch internally; an unhandled rejection here would crash the
    // request runtime (and the test runner — CI caught this before
    // the .catch landed).
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const harness = makeHarness({
      contextStore: ctx,
      nextResult: { id: 'p1', name: 'X' },
    });
    // Audit insert succeeds; prune throws because the mock harness
    // intentionally has no count() method.
    const result = await harness.invoke({
      model: 'Property',
      action: 'create',
      args: { data: { name: 'X' } },
    });
    // Give the floating promise a tick to settle inside the catch.
    await new Promise((r) => setImmediate(r));
    expect(result).toEqual({ id: 'p1', name: 'X' });
    randomSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('captures entityId from the result when create has no where', async () => {
    const harness = makeHarness({
      contextStore: ctx,
      nextResult: { id: 'b-new', street: 'Hauptstr.' },
    });
    await harness.invoke({
      model: 'Building',
      action: 'create',
      args: { data: { street: 'Hauptstr.' } },
    });
    const arg = harness.auditCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(arg.data.entityId).toBe('b-new');
  });
});

describe('pruneAuditLog', () => {
  function makePrismaStub(opts: { total: number; keepIds?: string[] }) {
    const count = vi.fn(async () => opts.total);
    const findMany = vi.fn(async () =>
      (opts.keepIds ?? Array.from({ length: opts.total }, (_, i) => `r${i}`)).map((id) => ({ id })),
    );
    const deleteMany = vi.fn(async () => ({ count: opts.total - (opts.keepIds?.length ?? 0) }));
    const prisma = {
      auditLog: { count, findMany, deleteMany },
    } as unknown as Parameters<typeof pruneAuditLog>[0];
    return { prisma, count, findMany, deleteMany };
  }

  it('returns 0 and skips the delete when row count is at or under the cap', async () => {
    const stub = makePrismaStub({ total: 100 });
    const removed = await pruneAuditLog(stub.prisma, 'demo', 100);
    expect(removed).toBe(0);
    expect(stub.count).toHaveBeenCalledOnce();
    expect(stub.findMany).not.toHaveBeenCalled();
    expect(stub.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 0 when row count is one under the cap (boundary)', async () => {
    const stub = makePrismaStub({ total: 99 });
    const removed = await pruneAuditLog(stub.prisma, 'demo', 100);
    expect(removed).toBe(0);
    expect(stub.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes everything outside the newest `cap` rows when over the cap', async () => {
    // 150 rows in DB, cap is 100 → keep newest 100, delete oldest 50.
    const newestIds = Array.from({ length: 100 }, (_, i) => `keep-${i}`);
    const stub = makePrismaStub({ total: 150, keepIds: newestIds });
    const removed = await pruneAuditLog(stub.prisma, 'demo', 100);
    expect(removed).toBe(50);
    expect(stub.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'demo' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true },
    });
    expect(stub.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 'demo', id: { notIn: newestIds } },
    });
  });

  it('scopes the prune to one tenant — no cross-tenant deletes', async () => {
    const stub = makePrismaStub({ total: 200, keepIds: ['k1', 'k2'] });
    await pruneAuditLog(stub.prisma, 'tenant-A', 2);
    const findArgs = (stub.findMany.mock.calls as unknown as Array<Array<{ where: { tenantId: string } }>>)[0]?.[0];
    const deleteArgs = (stub.deleteMany.mock.calls as unknown as Array<Array<{ where: { tenantId: string } }>>)[0]?.[0];
    if (!findArgs || !deleteArgs) throw new Error('expected mock calls');
    expect(findArgs.where.tenantId).toBe('tenant-A');
    expect(deleteArgs.where.tenantId).toBe('tenant-A');
  });
});
