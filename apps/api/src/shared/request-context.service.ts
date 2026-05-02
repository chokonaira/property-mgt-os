import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request actor scope. NestJS middleware seeds the store with
 * `{ actorId, tenantId }` for the lifetime of the request; downstream
 * code (Prisma audit middleware, services) reads it via `getActorId()`
 * / `getTenantId()` instead of threading it through every method
 * signature.
 *
 * Pre-auth shim: today the request middleware writes the demo user's
 * id into the store. When NextAuth/Clerk lands, the same middleware
 * reads `req.session.userId` instead — every consumer of this service
 * stays unchanged.
 *
 * Why AsyncLocalStorage and not a per-request injected provider:
 *   - Prisma's middleware (`prisma.$use`) runs inside service-method
 *     calls, not Nest's DI scope. ALS lets the middleware reach back
 *     into the request context without Nest having to resolve a
 *     scoped provider for every Prisma call.
 *   - Same pattern Nest's @nestjs/cls package wraps; we use the
 *     primitive directly to keep the dep list small.
 */
export interface RequestContext {
  actorId: string;
  tenantId: string;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContext>();

  run<T>(ctx: RequestContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  get(): RequestContext | undefined {
    return this.als.getStore();
  }

  getActorId(): string | undefined {
    return this.als.getStore()?.actorId;
  }

  getTenantId(): string | undefined {
    return this.als.getStore()?.tenantId;
  }
}
