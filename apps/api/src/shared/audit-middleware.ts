import type { Prisma, PrismaClient } from '@prisma/client';
import type { RequestContextService } from './request-context.service';

/**
 * Models whose writes flow into the AuditLog. Excludes:
 *   - AuditLog itself (would recurse)
 *   - User (identity-layer; pre-auth, mostly seeded)
 *   - Tenant (boundary, not user-edited)
 *   - Document / ExtractionRun (already append-only and AI-owned;
 *     the ExtractionRun table is its own audit trail for the AI flow)
 */
const AUDITABLE_MODELS = new Set(['Property', 'Building', 'Unit', 'Contact']);
const AUDITED_ACTIONS = new Set(['create', 'update', 'delete', 'upsert']);

/**
 * Per-tenant cap on retained audit rows. Past the cap, the oldest
 * rows are deleted on the next write. Cheap because the prune query
 * is `DELETE … WHERE id IN (SELECT id … ORDER BY createdAt ASC OFFSET cap)`
 * indexed by `(tenantId, createdAt)`. Override via env if a tenant
 * needs a longer retention window.
 */
const AUDIT_MAX_ROWS_PER_TENANT = Number(process.env.AUDIT_MAX_ROWS_PER_TENANT ?? 5000);

/**
 * Probability that a write triggers a prune sweep. Most audit inserts
 * skip the count + delete entirely; the sweep runs occasionally so
 * tenants stay near the cap without paying for it on every keystroke.
 * Adjustable via env for high-write-rate tenants where amortised cost
 * matters more than peak.
 */
const AUDIT_PRUNE_PROBABILITY = Number(process.env.AUDIT_PRUNE_PROBABILITY ?? 0.05);

/**
 * Pure registration helper — wires the audit hook onto a Prisma client.
 * Capturing the client + context service as parameters keeps this unit-
 * testable: the test passes a mock `prisma` + mock `requestContext` and
 * drives `prisma.$use` directly without touching Nest DI.
 *
 * Behavior on each auditable write:
 *   1. For update / delete / upsert: read the BEFORE snapshot via
 *      findUnique({ where }). Skipped on create (nothing to snapshot).
 *   2. Forward the call to the next handler — original write semantics
 *      preserved, including any Prisma errors the caller expects.
 *   3. After the write, persist an AuditLog row with the actor +
 *      tenant from the request context, the entity / action, and the
 *      before / after JSON snapshots.
 *
 * Audit insert failures NEVER block the originating write — telemetry
 * not transactional. We log a warning and move on; the user's data is
 * already saved.
 */
export function registerAuditMiddleware(
  prisma: PrismaClient,
  requestContext: RequestContextService,
): void {
  prisma.$use(async (params, next) => {
    const action = params.action as string;
    const model = params.model as string | undefined;
    if (!model || !AUDITABLE_MODELS.has(model) || !AUDITED_ACTIONS.has(action)) {
      return next(params);
    }

    const ctx = requestContext.get();
    // No request context = the call came from a non-HTTP path (seed
    // script, migration, repl). We still let the write through but
    // don't write an audit row — there's no actor to attribute it to,
    // and seeding "demo-user wrote 14 units" pollutes the real history.
    if (!ctx) {
      return next(params);
    }

    const where = params.args.where as Prisma.PropertyWhereUniqueInput | undefined;
    const captureBefore = action === 'update' || action === 'delete' || action === 'upsert';
    let before: unknown = null;
    if (captureBefore && where) {
      try {
        const reader = (
          prisma as unknown as Record<
            string,
            { findUnique: (a: { where: unknown }) => Promise<unknown> }
          >
        )[lowercaseFirst(model)];
        before = (await reader?.findUnique({ where })) ?? null;
      } catch {
        before = null;
      }
    }

    const result = (await next(params)) as Record<string, unknown> | null;
    const after = action === 'delete' ? null : result;
    const entityId =
      (result as { id?: string } | null)?.id ??
      (before as { id?: string } | null)?.id ??
      (where as { id?: string } | undefined)?.id ??
      'unknown';

    try {
      await prisma.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          actorId: ctx.actorId,
          entity: model,
          entityId,
          action,
          before: before as Prisma.InputJsonValue,
          after: after as Prisma.InputJsonValue,
        },
      });
      // Probabilistic retention sweep — keeps the table bounded
      // without paying the count + delete cost on every write.
      if (Math.random() < AUDIT_PRUNE_PROBABILITY) {
        void pruneAuditLog(prisma, ctx.tenantId, AUDIT_MAX_ROWS_PER_TENANT);
      }
    } catch (err) {
      // Telemetry must never break the originating write.
      console.warn('audit.write_failed', { model, action, entityId, err });
    }

    return result;
  });
}

/**
 * Deletes audit rows older than the cap, scoped to one tenant. Pure
 * helper so the middleware can fire-and-forget without awaiting the
 * prune. Called only when the throttled sample fires — most writes
 * skip this entirely.
 *
 * Implementation note: we delete by id instead of `where: { createdAt
 * < cutoff }` because reading the cutoff first lets us short-circuit
 * the no-op case (count <= cap) with a single COUNT query, no DELETE
 * issued at all.
 */
export async function pruneAuditLog(
  prisma: PrismaClient,
  tenantId: string,
  cap: number,
): Promise<number> {
  const total = await prisma.auditLog.count({ where: { tenantId } });
  if (total <= cap) return 0;
  // Read the ids of the rows we want to KEEP (newest `cap` for this
  // tenant); delete everything else. One round-trip read + one
  // delete keeps the sweep predictable.
  const keep = await prisma.auditLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: cap,
    select: { id: true },
  });
  const keepIds = keep.map((row) => row.id);
  const result = await prisma.auditLog.deleteMany({
    where: { tenantId, id: { notIn: keepIds } },
  });
  return result.count;
}

function lowercaseFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
