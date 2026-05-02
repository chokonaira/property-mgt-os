import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RequestContextService } from './request-context.service';

// Global so feature modules can inject PrismaService without re-importing.
// Owning it here ensures a single PrismaClient instance for the whole app.
//
// RequestContextService rides along: PrismaService depends on it (audit
// middleware reads actor / tenant from the ALS-backed store), and the
// HTTP middleware that seeds the store imports it from the same module.
@Global()
@Module({
  providers: [PrismaService, RequestContextService],
  exports: [PrismaService, RequestContextService],
})
export class PrismaModule {}
