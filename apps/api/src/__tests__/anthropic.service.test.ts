import { describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '../modules/extraction/extraction-error';
import {
  AnthropicService,
  type AnthropicMessagesClient,
} from '../modules/extraction/anthropic.service';

const VALID_RESULT = {
  property: { name: 'Test', managementType: 'WEG', totalMea: 1000 },
  buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
  units: [],
  contacts: [],
  confidenceByField: {},
  sourceSpansByField: {},
  warnings: [],
};

interface ClientHandlerInput {
  call: number;
  abortSignal?: AbortSignal;
}

function makeClient(
  handler: (input: ClientHandlerInput) => Promise<unknown>,
): {
  client: AnthropicMessagesClient;
  create: ReturnType<typeof vi.fn>;
} {
  let calls = 0;
  const create = vi.fn(async (_args, opts) => {
    calls += 1;
    const input = await handler({ call: calls, abortSignal: opts?.signal });
    return {
      content: [{ type: 'tool_use', name: 'submit_extraction_result', input }],
    };
  });
  return {
    client: { messages: { create } } as unknown as AnthropicMessagesClient,
    create,
  };
}

const baseConfig = {
  model: 'claude-haiku-4-5-20251001',
  timeoutMs: 5_000,
  maxOutputTokens: 4_096,
  responseSchema: {},
};

describe('AnthropicService.extract', () => {
  it('parses a valid tool_use response on the first call', async () => {
    const { client, create } = makeClient(async () => VALID_RESULT);
    const svc = new AnthropicService(client, baseConfig);
    const result = await svc.extract('document text');
    expect(result.parsed.property.name).toBe('Test');
    expect(result.model).toBe('claude-haiku-4-5-20251001');
    expect(result.promptVersion).toBe('extract.v1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries once on parse failure with the error addendum', async () => {
    const { client, create } = makeClient(async ({ call }) => {
      // Anthropic forces tool_choice, so the input always reaches our
      // service as an object — simulate a "wrong shape" first attempt
      // by returning a deliberately-broken structure that Zod rejects.
      return call === 1 ? { not: 'an extraction result' } : VALID_RESULT;
    });
    const svc = new AnthropicService(client, baseConfig);
    const result = await svc.extract('document text');
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.parsed.property.name).toBe('Test');
    const retryCall = create.mock.calls[1]?.[0] as {
      messages: Array<{ content: string }>;
    };
    const lastMessage = retryCall.messages[retryCall.messages.length - 1];
    expect(lastMessage?.content).toContain('Your previous tool call was invalid');
  });

  it('throws ExtractionError(parse_failed) when both attempts fail', async () => {
    const { client } = makeClient(async () => ({ still: 'wrong shape' }));
    const svc = new AnthropicService(client, baseConfig);
    await expect(svc.extract('document text')).rejects.toMatchObject({
      name: 'ExtractionError',
      reason: 'parse_failed',
    });
  });

  it('throws ExtractionError(timeout) when the abort signal fires', async () => {
    const { client } = makeClient(async ({ abortSignal }) => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (abortSignal?.aborted) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return VALID_RESULT;
    });
    const svc = new AnthropicService(client, { ...baseConfig, timeoutMs: 5 });
    await expect(svc.extract('document text')).rejects.toBeInstanceOf(ExtractionError);
    await expect(svc.extract('document text')).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('forwards the document AFTER the few-shot anchor wrapped in <document> tags and forces the tool', async () => {
    const { client, create } = makeClient(async () => VALID_RESULT);
    const svc = new AnthropicService(client, baseConfig);
    await svc.extract('LIVE DOCUMENT TEXT');
    const firstCall = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
      tool_choice: { type: string; name: string };
      tools: Array<{ name: string }>;
      system: string;
    };
    // System prompt lives outside the message list on Anthropic's API,
    // so the few-shot order is user → assistant → user (3 messages).
    expect(firstCall.system.length).toBeGreaterThan(0);
    expect(firstCall.messages.length).toBe(3);
    expect(firstCall.messages[0]?.role).toBe('user'); // few-shot user (also wrapped)
    expect(firstCall.messages[1]?.role).toBe('assistant'); // few-shot assistant
    // Live document text is wrapped in <document> tags so prompt-
    // injection payloads in the PDF can't pose as instructions.
    expect(firstCall.messages[2]?.content).toContain('<document>');
    expect(firstCall.messages[2]?.content).toContain('LIVE DOCUMENT TEXT');
    expect(firstCall.messages[2]?.content).toContain('</document>');
    expect(firstCall.tool_choice).toEqual({
      type: 'tool',
      name: 'submit_extraction_result',
    });
    expect(firstCall.tools[0]?.name).toBe('submit_extraction_result');
  });
});
