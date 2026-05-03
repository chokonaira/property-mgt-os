import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health/health.controller';
import { AuditModule } from './modules/audit/audit.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { OpenApiModule } from './modules/openapi/openapi.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { PrismaModule } from './shared/prisma.module';
import { IdempotencyStore } from './shared/idempotency.interceptor';
import { RATE_LIMIT_BUCKET, rateLimitBucket } from './shared/rate-limit';
import { RateLimitGuard } from './shared/rate-limit.guard';
import { requestIdMiddleware } from './shared/request-id.middleware';
import { ActorContextMiddleware } from './shared/actor-context.middleware';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        customProps: (req) => ({ requestId: req.headers['x-request-id'] }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["set-cookie"]',
            'req.headers["x-api-key"]',
            'req.body.password',
            'req.body',
            '*.OPENAI_API_KEY',
            'OPENAI_API_KEY',
            'env.OPENAI_API_KEY',
            'apiKey',
          ],
          censor: '[redacted]',
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss.l' },
              },
      },
    }),
    PrismaModule,
    PropertiesModule,
    AuditModule,
    ContactsModule,
    DocumentsModule,
    ExtractionModule,
    OpenApiModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: RATE_LIMIT_BUCKET, useValue: rateLimitBucket },
    RateLimitGuard,
    // Single-instance store so every request that hits the
    // IdempotencyInterceptor sees the same cache. Production swaps
    // this for a Redis-backed implementation behind the same shape.
    IdempotencyStore,
  ],
  exports: [RateLimitGuard, RATE_LIMIT_BUCKET, IdempotencyStore],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Order matters: requestId first so the actor-context middleware
    // can log under the same id; ActorContext wraps every downstream
    // handler in the AsyncLocalStorage scope so Prisma audit middleware
    // can read actor + tenant on every write.
    consumer.apply(requestIdMiddleware, ActorContextMiddleware).forRoutes('*');
  }
}
