import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { RequestContextService } from './request-context.service';

/**
 * Seeds the AsyncLocalStorage-backed RequestContextService with the
 * per-request actor + tenant ids before any controller or service code
 * runs. Pre-auth shim — actor / tenant come from env constants today;
 * the swap to NextAuth/Clerk is one diff in this file (read from
 * `req.session` instead of process.env).
 *
 * Lives here, not in app bootstrap, so:
 *   - The Prisma audit middleware reads the same source of truth.
 *   - End-to-end tests can override the env vars per test instead of
 *     monkey-patching headers.
 */
@Injectable()
export class ActorContextMiddleware implements NestMiddleware {
  constructor(@Inject(RequestContextService) private readonly requestContext: RequestContextService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    const actorId = process.env.USER_DEFAULT_ID ?? 'demo-user';
    const tenantId = process.env.TENANT_DEFAULT_ID ?? 'demo';
    // Wrap the entire downstream call chain — including async Prisma
    // calls inside services — in the ALS scope. Once auth lands the
    // body of this method changes (read from req.session); the
    // surrounding wiring stays the same.
    this.requestContext.run({ actorId, tenantId }, () => next());
  }
}
