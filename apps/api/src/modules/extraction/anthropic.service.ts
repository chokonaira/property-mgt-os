import { Injectable, Logger } from '@nestjs/common';
import { ExtractionError } from './extraction-error';
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SYSTEM_PROMPT } from './fixtures/system-prompt';
import { FEW_SHOT_ASSISTANT_RESULT, FEW_SHOT_USER_TEXT } from './fixtures/few-shot';
import {
  parseExtraction,
  type AiExtractionClient,
  type ExtractionCallResult,
} from './ai-extraction.client';

/**
 * Anthropic Claude wrapper for the extraction call. Mirrors
 * OpenAIService's contract (extract: text → ExtractionCallResult) so
 * the orchestrator stays vendor-agnostic.
 *
 * Structured output strategy: Anthropic's Messages API doesn't have a
 * direct json_schema response_format, so we use the `tools` mechanism
 * with a single ExtractionResult tool and force the model to call it
 * via `tool_choice: { type: 'tool', name: ... }`. The tool's
 * `input_schema` is the same JSON Schema produced from
 * ExtractionResultSchema, so the model's tool_use input arrives as a
 * structured object that we feed straight into Zod for verification.
 *
 * Retry policy: one retry on parse failure (same as OpenAI), with
 * the parse error appended as a follow-up user turn. Timeout enforced
 * via AbortController.
 */

interface AnthropicMessageRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: Array<{ name: string; description: string; input_schema: unknown }>;
  tool_choice: { type: 'tool'; name: string };
  temperature?: number;
}

interface AnthropicMessageResponse {
  content: Array<
    | { type: 'tool_use'; name: string; input: unknown }
    | { type: 'text'; text: string }
    | { type: string; [key: string]: unknown }
  >;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export interface AnthropicMessagesClient {
  messages: {
    create(
      args: AnthropicMessageRequest,
      options?: { signal?: AbortSignal },
    ): Promise<AnthropicMessageResponse>;
  };
}

export interface AnthropicServiceConfig {
  model: string;
  timeoutMs: number;
  /** Same JSON Schema that openai uses — generated from ExtractionResultSchema. */
  responseSchema: unknown;
  /** Hard cap on output tokens — must be set on Anthropic's API. */
  maxOutputTokens: number;
  temperature?: number;
}

const TOOL_NAME = 'submit_extraction_result';
const TOOL_DESCRIPTION =
  'Return the structured Teilungserklärung extraction result for the supplied document.';

@Injectable()
export class AnthropicService implements AiExtractionClient {
  private readonly logger = new Logger(AnthropicService.name);

  constructor(
    private readonly client: AnthropicMessagesClient,
    private readonly config: AnthropicServiceConfig,
  ) {}

  async extract(documentText: string): Promise<ExtractionCallResult> {
    const baseMessages: AnthropicMessageRequest['messages'] = [
      { role: 'user', content: wrapAsDocument(FEW_SHOT_USER_TEXT) },
      { role: 'assistant', content: JSON.stringify(FEW_SHOT_ASSISTANT_RESULT) },
      { role: 'user', content: wrapAsDocument(documentText) },
    ];

    const start = Date.now();
    const first = await this.callOnce(baseMessages);
    const firstParse = parseExtraction(first.rawJson);
    if (firstParse.success) {
      return this.toResult(firstParse.data, first.rawJson, start);
    }

    // Retry once, just like OpenAIService — same single-retry budget.
    const retryMessages: AnthropicMessageRequest['messages'] = [
      ...baseMessages,
      { role: 'assistant', content: first.rawJson },
      {
        role: 'user',
        content: `Your previous tool call was invalid: ${firstParse.error}. Call ${TOOL_NAME} again with input matching the schema exactly.`,
      },
    ];
    const second = await this.callOnce(retryMessages);
    const secondParse = parseExtraction(second.rawJson);
    if (secondParse.success) {
      return this.toResult(secondParse.data, second.rawJson, start);
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
    messages: AnthropicMessageRequest['messages'],
  ): Promise<{ rawJson: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.client.messages.create(
        {
          model: this.config.model,
          max_tokens: this.config.maxOutputTokens,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages,
          tools: [
            {
              name: TOOL_NAME,
              description: TOOL_DESCRIPTION,
              input_schema: this.config.responseSchema,
            },
          ],
          tool_choice: { type: 'tool', name: TOOL_NAME },
          temperature: this.config.temperature ?? 0,
        },
        { signal: controller.signal },
      );
      // Find the tool_use block. Forced tool_choice should make the
      // first content block a tool_use; defensive check anyway in case
      // the model returns text alongside.
      const toolBlock = response.content.find((block) => block.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        return { rawJson: '' };
      }
      // Stringify the structured input so downstream parseExtraction
      // can run the same JSON.parse + Zod path it does for OpenAI.
      // Costs one stringify per call — negligible vs. the network RTT.
      return { rawJson: JSON.stringify(toolBlock.input) };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ExtractionError(
          'timeout',
          `Anthropic call exceeded ${this.config.timeoutMs} ms.`,
          error,
        );
      }
      // Wrap raw SDK errors so the controller can map them to a
      // typed AppException. Without this, a 401 / 400 / 429 from
      // Anthropic bubbles up unwrapped → INTERNAL 500 → the client
      // sees a misleading "Something went wrong on our side" message.
      // Log with status + provider error type so Railway logs name
      // the actual cause.
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
        'extraction.anthropic_call_failed',
      );
      throw new ExtractionError(
        mapAnthropicStatusToReason(apiStatus),
        anthropicMessageFor(apiStatus, apiMessage),
        { apiStatus, apiCode, apiMessage },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private toResult(
    parsed: ExtractionCallResult['parsed'],
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

/**
 * Anthropic.APIError shape (mirrored from @anthropic-ai/sdk's runtime
 * — we keep it as a structural read because importing the SDK's class
 * for an instanceof check would couple our test stubs to the real
 * package).
 */
function readApiStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function readApiCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const inner = (error as { error?: { error?: { type?: unknown } } }).error?.error?.type;
  return typeof inner === 'string' ? inner : undefined;
}

function readApiMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const inner = (error as { error?: { error?: { message?: unknown } } }).error?.error?.message;
  if (typeof inner === 'string') return inner;
  const top = (error as { message?: unknown }).message;
  return typeof top === 'string' ? top : undefined;
}

function mapAnthropicStatusToReason(status: number | undefined) {
  // 4xx → cannot_read_pdf is wrong; reuse parse_failed since the
  // model never produced a parseable result. Auth + invalid_request
  // both surface as parse_failed at the orchestration layer; the
  // controller already maps parse_failed → 502 EXTRACTION_PARSE_FAILED
  // which the UI banner renders cleanly. Detail (apiStatus + apiCode)
  // travels in the cause for log triage.
  if (status === 429) return 'parse_failed' as const;
  if (status && status >= 500) return 'parse_failed' as const;
  return 'parse_failed' as const;
}

// `<document>` tags isolate untrusted content from trusted instructions
// — pairs with the system prompt's prompt-injection clause.
function wrapAsDocument(text: string): string {
  return `<document>\n${text}\n</document>`;
}

function anthropicMessageFor(
  status: number | undefined,
  apiMessage: string | undefined,
): string {
  if (status === 401) return 'Anthropic API key rejected (401). Check ANTHROPIC_API_KEY.';
  if (status === 400) return `Anthropic rejected the request (400). ${apiMessage ?? ''}`.trim();
  if (status === 429) return 'Anthropic rate limit hit (429). Retry shortly.';
  if (status && status >= 500) {
    return `Anthropic upstream error (${status}). ${apiMessage ?? ''}`.trim();
  }
  return apiMessage ?? 'Anthropic call failed.';
}
