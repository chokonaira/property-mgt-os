import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health/health.controller';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ExtractionModule } from './modules/extraction/extraction.module';
import { OpenApiModule } from './modules/openapi/openapi.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { PrismaModule } from './shared/prisma.module';
import { RATE_LIMIT_BUCKET, rateLimitBucket } from './shared/rate-limit';
import { RateLimitGuard } from './shared/rate-limit.guard';
import { requestIdMiddleware } from './shared/request-id.middleware';

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
    ContactsModule,
    DocumentsModule,
    ExtractionModule,
    OpenApiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: RATE_LIMIT_BUCKET, useValue: rateLimitBucket }, RateLimitGuard],
  exports: [RateLimitGuard, RATE_LIMIT_BUCKET],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestIdMiddleware).forRoutes('*');
  }
}
