import { Injectable, Logger } from '@nestjs/common';
import { ExtractionResultSchema, type ExtractionResult } from '@buena/shared';
import { ExtractionError } from './extraction-error';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT } from './fixtures/system-prompt';
import { FEW_SHOT_ASSISTANT_RESULT, FEW_SHOT_USER_TEXT } from './fixtures/few-shot';

/**
 * Thin OpenAI client wrapper. The interesting bits live here:
 * - Structured output via response_format json_schema (strict mode)
 *   so the model either returns valid JSON or the call fails.
 * - 15 s timeout enforced via AbortController on top of the SDK's
 *   own timeout, because the SDK's timeout fires inconsistently in
 *   some networking edge cases.
 * - One retry on parse failure with a "your previous response was
 *   invalid: <error>" addendum (per spec). No retry on timeout —
 *   the user is already waiting.
 * - Few-shot anchor (one user/assistant pair) prepended before the
 *   live document so the model is grounded on the Parkview shape.
 *
 * Caller responsibilities (covered in extraction.service):
 * - Token budget guard (T-503 spec).
 * - Source-span verification (post-call hallucination check).
 * - Idempotency cache lookup.
 * - Persisting the ExtractionRun row.
 */

interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format: {
    type: 'json_schema';
    json_schema: { name: string; schema: unknown; strict: boolean };
  };
  temperature?: number;
}

/**
 * Minimal client surface. The OpenAI SDK is much wider than this; we
 * cast at the wiring layer (extraction.module.ts) so unit tests can
 * stub a tiny object without dragging the SDK's full type surface.
 */
export interface OpenAIChatClient {
  chat: {
    completions: {
      create(
        args: ChatCompletionRequest,
        options?: { signal?: AbortSignal },
      ): Promise<{
        choices: Array<{ message: { content?: string | null } }>;
      }>;
    };
  };
}

export interface OpenAIServiceConfig {
  model: string;
  timeoutMs: number;
  /** JSON schema (already produced from ExtractionResultSchema). */
  responseSchema: unknown;
  /** Model temperature; deterministic 0 for structured extraction. */
  temperature?: number;
}

export interface ExtractionCallResult {
  parsed: ExtractionResult;
  rawResponse: string;
  durationMs: number;
  promptVersion: string;
  model: string;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);

  constructor(
    private readonly client: OpenAIChatClient,
    private readonly config: OpenAIServiceConfig,
  ) {}

  async extract(documentText: string): Promise<ExtractionCallResult> {
    const baseMessages: ChatCompletionRequest['messages'] = [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: FEW_SHOT_USER_TEXT },
      { role: 'assistant', content: JSON.stringify(FEW_SHOT_ASSISTANT_RESULT) },
      { role: 'user', content: documentText },
    ];

    const start = Date.now();
    const first = await this.callOnce(baseMessages);
    const firstParse = parseExtraction(first.content);
    if (firstParse.success) {
      return this.toResult(firstParse.data, first.content, start);
    }

    // Retry once with the parse error as an addendum. Spec calls for
    // exactly one retry; if this fails too we surface
    // ExtractionError('parse_failed') so the caller can persist the
    // failed run and the UI shows the manual-fallback banner.
    const retryMessages: ChatCompletionRequest['messages'] = [
      ...baseMessages,
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: `Your previous response was invalid: ${firstParse.error}. Return ONLY the JSON matching the schema, with no commentary.`,
      },
    ];
    const second = await this.callOnce(retryMessages);
    const secondParse = parseExtraction(second.content);
    if (secondParse.success) {
      return this.toResult(secondParse.data, second.content, start);
    }

    this.logger.error(
      { firstError: firstParse.error, secondError: secondParse.error },
      'extraction.parse_failed_after_retry',
    );
    throw new ExtractionError('parse_failed', secondParse.error, {
      firstError: firstParse.error,
    });
  }

  private async callOnce(
    messages: ChatCompletionRequest['messages'],
  ): Promise<{ content: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.config.model,
          messages,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'ExtractionResult',
              schema: this.config.responseSchema,
              strict: true,
            },
          },
          temperature: this.config.temperature ?? 0,
        },
        { signal: controller.signal },
      );
      const content = response.choices[0]?.message?.content ?? '';
      return { content };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ExtractionError(
          'timeout',
          `OpenAI call exceeded ${this.config.timeoutMs} ms.`,
          error,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toResult(
    parsed: ExtractionResult,
    rawResponse: string,
    start: number,
  ): ExtractionCallResult {
    return {
      parsed,
      rawResponse,
      durationMs: Date.now() - start,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      model: this.config.model,
    };
  }
}

// Inlined ExtractionResultSchema.safeParse — using a generic helper
// would have collapsed Zod's distinct input / output types (the
// schema has .default() on contacts / confidenceByField /
// sourceSpansByField / warnings, so input ≠ output) and the parsed
// `data` would surface as the input shape (optional) instead of the
// output shape (required, defaults applied).
function parseExtraction(
  raw: string,
): { success: true; data: ExtractionResult } | { success: false; error: string } {
  if (!raw) return { success: false, error: 'empty model response' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'JSON parse failed',
    };
  }
  const result = ExtractionResultSchema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    return { success: false, error: message };
  }
  // Cast to the output shape: defaults() means safeParse's data type
  // is the schema's output (required fields), but TS sometimes
  // collapses it to the input variant when defaults change shape.
  return { success: true, data: result.data as ExtractionResult };
}
