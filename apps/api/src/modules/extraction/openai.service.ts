import { Injectable, Logger } from '@nestjs/common';
import { ExtractionError } from './extraction-error';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT } from './fixtures/system-prompt';
import { FEW_SHOT_ASSISTANT_RESULT, FEW_SHOT_USER_TEXT } from './fixtures/few-shot';
import {
  parseExtraction,
  type AiExtractionClient,
  type ExtractionCallResult,
} from './ai-extraction.client';
import type { ExtractionResult } from '@buena/shared';

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

export type { ExtractionCallResult };

@Injectable()
export class OpenAIService implements AiExtractionClient {
  private readonly logger = new Logger(OpenAIService.name);

  constructor(
    private readonly client: OpenAIChatClient,
    private readonly config: OpenAIServiceConfig,
  ) {}

  async extract(documentText: string): Promise<ExtractionCallResult> {
    const baseMessages: ChatCompletionRequest['messages'] = [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: wrapAsDocument(FEW_SHOT_USER_TEXT) },
      { role: 'assistant', content: JSON.stringify(FEW_SHOT_ASSISTANT_RESULT) },
      { role: 'user', content: wrapAsDocument(documentText) },
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
      // Wrap raw SDK errors so the controller maps them to a typed
      // AppException. Without this, a 401 / 400 / 429 from OpenAI
      // bubbles up unwrapped → INTERNAL 500 → the client sees a
      // misleading "Something went wrong on our side" message.
      const apiStatus = readApiStatus(error);
      const apiCode = readApiCode(error);
      const apiMessage = readApiMessage(error);
      this.logger.error(
        {
          model: this.config.model,
          apiStatus,
          apiCode,
          apiMessage,
          err: error instanceof Error ? error.message : String(error),
        },
        'extraction.openai_call_failed',
      );
      throw new ExtractionError(
        mapOpenAiStatusToReason(apiStatus),
        openAiMessageFor(apiStatus, apiCode, apiMessage),
        { apiStatus, apiCode, apiMessage },
      );
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

// `<document>` tags isolate untrusted content from trusted instructions
// — pairs with the system prompt's prompt-injection clause.
function wrapAsDocument(text: string): string {
  return `<document>\n${text}\n</document>`;
}

// Structural reads against openai SDK's APIError so test stubs don't
// need the real class. SDK v6 surfaces `status`, `code`, `type` plus a
// nested `error.message`.
function readApiStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function readApiCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const nested = (error as { error?: { code?: unknown; type?: unknown } }).error;
  if (nested && typeof nested === 'object') {
    if (typeof nested.code === 'string') return nested.code;
    if (typeof nested.type === 'string') return nested.type;
  }
  return undefined;
}

function readApiMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const inner = (error as { error?: { message?: unknown } }).error?.message;
  if (typeof inner === 'string') return inner;
  const top = (error as { message?: unknown }).message;
  return typeof top === 'string' ? top : undefined;
}

function mapOpenAiStatusToReason(status: number | undefined) {
  // The orchestrator only distinguishes timeout / parse_failed / too_large;
  // every API-side failure (auth, quota, rate, 5xx) maps to parse_failed,
  // which the controller renders as 502 EXTRACTION_PARSE_FAILED. Status +
  // code travel in the cause for log triage.
  if (status === 429) return 'parse_failed' as const;
  if (status && status >= 500) return 'parse_failed' as const;
  return 'parse_failed' as const;
}

function openAiMessageFor(
  status: number | undefined,
  apiCode: string | undefined,
  apiMessage: string | undefined,
): string {
  if (status === 401) return 'OpenAI API key rejected (401). Check OPENAI_API_KEY.';
  if (apiCode === 'insufficient_quota' || status === 402) {
    return 'OpenAI quota exhausted. Top up the account or rotate to a key with credit.';
  }
  if (status === 429) return 'OpenAI rate limit hit (429). Retry shortly.';
  if (status === 400) return `OpenAI rejected the request (400). ${apiMessage ?? ''}`.trim();
  if (status && status >= 500) {
    return `OpenAI upstream error (${status}). ${apiMessage ?? ''}`.trim();
  }
  return apiMessage ?? 'OpenAI call failed.';
}

