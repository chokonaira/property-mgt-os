import { Logger, Module } from '@nestjs/common';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { encode } from 'gpt-tokenizer';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExtractionResultSchema } from '@buena/shared';
import { PrismaService } from '../../shared/prisma.service';
import { RATE_LIMIT_BUCKET, rateLimitBucket } from '../../shared/rate-limit';
import { RateLimitGuard } from '../../shared/rate-limit.guard';
import {
  AI_EXTRACTION_CLIENT,
  type AiExtractionClient,
} from './ai-extraction.client';
import { AnthropicService, type AnthropicMessagesClient } from './anthropic.service';
import { ExtractionController } from './extraction.controller';
import { ExtractionService } from './extraction.service';
import { OpenAIService, type OpenAIChatClient } from './openai.service';
import { pdfjsExtract, unpdfExtract } from './pdf-extractors';
import { PdfTextService } from './pdf-text.service';

const EXTRACTION_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

const TOKEN_BUDGET = Number(process.env.EXTRACTION_MAX_TOKENS ?? 25_000);

const moduleLogger = new Logger('ExtractionModule');

/**
 * Build the active AI extraction client. Selection rule:
 *
 *   AI_PROVIDER=anthropic  → AnthropicService (claude-haiku-4-5 default)
 *   AI_PROVIDER=openai     → OpenAIService    (gpt-4o-mini default)
 *   unset                  → 'anthropic' if ANTHROPIC_API_KEY present,
 *                            otherwise 'openai'.
 *
 * Both implementations satisfy AiExtractionClient — the orchestrator
 * never knows which one is wired in. The vendor SDK is constructed
 * with a placeholder API key when the real one is absent so the
 * module wires up cleanly in dev / test; live calls fail at the API
 * boundary, where ExtractionService persists a failed run row.
 */
// Anthropic's tool `input_schema` requires a top-level object schema;
// passing a `name` to zodToJsonSchema wraps it as `{$ref, definitions}`
// which Anthropic rejects with 400.
export function buildAnthropicResponseSchema(): Record<string, unknown> {
  return zodToJsonSchema(
    ExtractionResultSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
  ) as Record<string, unknown>;
}

// OpenAI's `response_format.json_schema` accepts the named, $ref-wrapped
// shape and the `openAi` dialect (no $defs, oneOf restrictions).
export function buildOpenAiResponseSchema(): Record<string, unknown> {
  return zodToJsonSchema(
    ExtractionResultSchema as unknown as Parameters<typeof zodToJsonSchema>[0],
    { target: 'openAi', name: 'ExtractionResult' },
  ) as Record<string, unknown>;
}

function buildAiExtractionClient(): AiExtractionClient {
  const provider = resolveProvider();
  if (provider === 'anthropic') {
    moduleLogger.log({ provider: 'anthropic' }, 'extraction.provider_selected');
    if (!process.env.ANTHROPIC_API_KEY) {
      moduleLogger.warn('ANTHROPIC_API_KEY missing — extraction calls will 401 at the API boundary.');
    }
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? 'placeholder',
    });
    return new AnthropicService(client as unknown as AnthropicMessagesClient, {
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      timeoutMs: Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 15_000),
      maxOutputTokens: Number(process.env.ANTHROPIC_MAX_OUTPUT_TOKENS ?? 4_096),
      responseSchema: buildAnthropicResponseSchema(),
    });
  }

  moduleLogger.log({ provider: 'openai' }, 'extraction.provider_selected');
  if (!process.env.OPENAI_API_KEY) {
    moduleLogger.warn('OPENAI_API_KEY missing — extraction calls will 401 at the API boundary.');
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? 'placeholder' });
  return new OpenAIService(client as unknown as OpenAIChatClient, {
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 15_000),
    responseSchema: buildOpenAiResponseSchema(),
  });
}

function resolveProvider(): 'anthropic' | 'openai' {
  const explicit = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (explicit === 'anthropic' || explicit === 'openai') return explicit;
  // No explicit pick: prefer Anthropic when its key exists, fall back
  // to OpenAI otherwise. Matches "default to Claude" guidance for
  // greenfield AI work while keeping the legacy OpenAI path live.
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
}

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
      provide: AI_EXTRACTION_CLIENT,
      useFactory: () => buildAiExtractionClient(),
    },
    {
      provide: ExtractionService,
      useFactory: (
        prisma: PrismaService,
        pdfText: PdfTextService,
        ai: AiExtractionClient,
      ) =>
        new ExtractionService(prisma, pdfText, ai, {
          maxTokens: TOKEN_BUDGET,
          // gpt-tokenizer is the BPE-faithful counter for production;
          // unit tests pass a char/4 stub via the helper's optional
          // encode argument.
          encode: (text: string) => ({ length: encode(text).length }),
        }),
      inject: [PrismaService, PdfTextService, AI_EXTRACTION_CLIENT],
    },
  ],
  exports: [PdfTextService, AI_EXTRACTION_CLIENT, ExtractionService],
})
export class ExtractionModule {}
