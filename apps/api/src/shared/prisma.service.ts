import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { registerAuditMiddleware } from './audit-middleware';
import { RequestContextService } from './request-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(RequestContextService) requestContext: RequestContextService) {
    super();
    // Audit-log middleware reads actor + tenant from the request
    // context (AsyncLocalStorage-backed) on every Property / Building /
    // Unit / Contact write. Wired here, not in feature modules, so
    // every Prisma client in the app is auditable by construction.
    registerAuditMiddleware(this, requestContext);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
