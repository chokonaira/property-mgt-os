import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so feature modules can inject PrismaService without re-importing.
// Owning it here ensures a single PrismaClient instance for the whole app.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
