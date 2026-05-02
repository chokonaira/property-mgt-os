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
      { role: 'user', content: FEW_SHOT_USER_TEXT },
      { role: 'assistant', content: JSON.stringify(FEW_SHOT_ASSISTANT_RESULT) },
      { role: 'user', content: documentText },
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
      throw error;
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
