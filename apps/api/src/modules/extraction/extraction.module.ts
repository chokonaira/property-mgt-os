import { Module } from '@nestjs/common';
import { OpenAI } from 'openai';
import { encode } from 'gpt-tokenizer';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExtractionResultSchema } from '@buena/shared';
import { PrismaService } from '../../shared/prisma.service';
import { RATE_LIMIT_BUCKET, rateLimitBucket } from '../../shared/rate-limit';
import { RateLimitGuard } from '../../shared/rate-limit.guard';
import { ExtractionController } from './extraction.controller';
import { ExtractionService } from './extraction.service';
import { OpenAIService, type OpenAIChatClient } from './openai.service';
import { pdfjsExtract, unpdfExtract } from './pdf-extractors';
import { PdfTextService } from './pdf-text.service';

const EXTRACTION_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

const OPENAI_CONFIG = {
  model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 15_000),
};

const TOKEN_BUDGET = Number(process.env.EXTRACTION_MAX_TOKENS ?? 25_000);

@Module({
  controllers: [ExtractionController],
  providers: [
    // The RateLimitGuard depends on RATE_LIMIT_BUCKET. AppModule
    // already declares both for global scope, but
    // @UseGuards(RateLimitGuard) on a feature controller needs them
    // resolvable inside this module's DI scope. Declare both
    // locally — same singleton bucket as AppModule.
    { provide: RATE_LIMIT_BUCKET, useValue: rateLimitBucket },
    RateLimitGuard,
    {
      provide: PdfTextService,
      useFactory: (prisma: PrismaService) =>
        new PdfTextService(prisma, EXTRACTION_CONFIG, {
          unpdfExtract,
          pdfjsExtract,
        }),
      inject: [PrismaService],
    },
    {
      provide: OpenAIService,
      useFactory: () => {
        // The OpenAI SDK lazy-loads its API key; we inject a
        // placeholder when none is set so the module wires up
        // cleanly in dev / test environments. Live calls will fail
        // with a 401 from OpenAI, which the orchestrator persists
        // as a failed ExtractionRun.
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'placeholder' });
        // zodToJsonSchema can't infer the deeply-nested shape — we
        // pass the schema as `unknown` because OpenAIService takes
        // its `responseSchema` as opaque JSON anyway.
        const responseSchema = zodToJsonSchema(
          ExtractionResultSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
          {
            target: 'openAi',
            name: 'ExtractionResult',
          },
        );
        return new OpenAIService(client as unknown as OpenAIChatClient, {
          model: OPENAI_CONFIG.model,
          timeoutMs: OPENAI_CONFIG.timeoutMs,
          responseSchema,
        });
      },
    },
    {
      provide: ExtractionService,
      useFactory: (prisma: PrismaService, pdfText: PdfTextService, openai: OpenAIService) =>
        new ExtractionService(prisma, pdfText, openai, {
          maxTokens: TOKEN_BUDGET,
          // gpt-tokenizer is the BPE-faithful counter for production;
          // unit tests pass a char/4 stub via the helper's optional
          // encode argument.
          encode: (text: string) => ({ length: encode(text).length }),
        }),
      inject: [PrismaService, PdfTextService, OpenAIService],
    },
  ],
  exports: [PdfTextService, OpenAIService, ExtractionService],
})
export class ExtractionModule {}
