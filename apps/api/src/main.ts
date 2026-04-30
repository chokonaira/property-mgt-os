import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalErrorFilter } from './shared/error.filter';
import { ZodValidationPipe } from './shared/zod-validation.pipe';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new GlobalErrorFilter(logger));
  app.useGlobalPipes(new ZodValidationPipe());

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  logger.log(`api listening on :${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('bootstrap_failed', err);
  process.exit(1);
});
