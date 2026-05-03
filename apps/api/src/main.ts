import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';
import { GlobalErrorFilter } from './shared/error.filter';
import { PrismaExceptionFilter } from './shared/prisma-exception.filter';
import { ZodValidationPipe } from './shared/zod-validation.pipe';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      hsts: env.NODE_ENV === 'production' ? undefined : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
    }),
  );

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: false,
    // PUT is needed for the bulk-replace endpoints
    // (PUT /properties/:id/units). Without it the browser
    // preflight rejects the request before the handler ever runs.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new GlobalErrorFilter(logger), new PrismaExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe());

  await app.listen(env.API_PORT);
  logger.log(`api listening on :${env.API_PORT}`);
}

bootstrap().catch((err: unknown) => {
  console.error('bootstrap_failed', err);
  process.exit(1);
});
