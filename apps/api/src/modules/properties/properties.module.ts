import { Module } from '@nestjs/common';
import {
  IdempotencyInterceptor,
  IdempotencyStore,
} from '../../shared/idempotency.interceptor';
import { PrismaService } from '../../shared/prisma.service';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

const PROPERTIES_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

@Module({
  controllers: [PropertiesController],
  providers: [
    {
      provide: PropertiesService,
      useFactory: (prisma: PrismaService) => new PropertiesService(prisma, PROPERTIES_CONFIG),
      inject: [PrismaService],
    },
    // IdempotencyInterceptor depends on the singleton IdempotencyStore
    // from AppModule (re-exported there). Listing both here lets
    // `@UseInterceptors(IdempotencyInterceptor)` resolve via Nest DI
    // instead of falling back to the @Optional new-store branch
    // (which would defeat cross-request caching).
    IdempotencyStore,
    IdempotencyInterceptor,
  ],
  exports: [PropertiesService],
})
export class PropertiesModule {}
