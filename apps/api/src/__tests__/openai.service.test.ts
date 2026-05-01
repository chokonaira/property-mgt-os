import { describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '../modules/extraction/extraction-error';
import { OpenAIService, type OpenAIChatClient } from '../modules/extraction/openai.service';

const VALID_RESULT = {
  property: { name: 'Test', managementType: 'WEG', totalMea: 1000 },
  buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
  units: [],
  contacts: [],
  confidenceByField: {},
  sourceSpansByField: {},
  warnings: [],
};

function makeClient(handler: (call: number) => Promise<{ content: string }>): {
  client: OpenAIChatClient;
  create: ReturnType<typeof vi.fn>;
} {
  let calls = 0;
  const create = vi.fn(async () => {
    calls += 1;
    const result = await handler(calls);
    return { choices: [{ message: { content: result.content } }] };
  });
  return {
    client: { chat: { completions: { create } } } as unknown as OpenAIChatClient,
    create,
  };
}

const baseConfig = {
  model: 'gpt-4o-mini',
  timeoutMs: 5_000,
  responseSchema: {},
};

describe('OpenAIService.extract', () => {
  it('parses a valid response on the first call', async () => {
    const { client, create } = makeClient(async () => ({
      content: JSON.stringify(VALID_RESULT),
    }));
    const svc = new OpenAIService(client, baseConfig);
    const result = await svc.extract('document text');
    expect(result.parsed.property.name).toBe('Test');
    expect(result.model).toBe('gpt-4o-mini');
    expect(result.promptVersion).toBe('extract.v1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('retries once on parse failure with the error addendum', async () => {
    const { client, create } = makeClient(async (call) => ({
      content: call === 1 ? 'not json' : JSON.stringify(VALID_RESULT),
    }));
    const svc = new OpenAIService(client, baseConfig);
    const result = await svc.extract('document text');
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.parsed.property.name).toBe('Test');
    // The retry payload includes the explanatory user message.
    const retryCall = create.mock.calls[1]?.[0] as { messages: Array<{ content: string }> };
    const lastMessage = retryCall.messages[retryCall.messages.length - 1];
    expect(lastMessage?.content).toContain('Your previous response was invalid');
  });

  it('throws ExtractionError(parse_failed) when both attempts fail', async () => {
    const { client } = makeClient(async () => ({ content: 'still not json' }));
    const svc = new OpenAIService(client, baseConfig);
    await expect(svc.extract('document text')).rejects.toMatchObject({
      name: 'ExtractionError',
      reason: 'parse_failed',
    });
  });

  it('throws ExtractionError(timeout) when the client signals abort', async () => {
    const { client } = makeClient(async () => {
      // Simulate a slow upstream — abort fires before this resolves.
      await new Promise((resolve) => setTimeout(resolve, 60));
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    const svc = new OpenAIService(client, { ...baseConfig, timeoutMs: 5 });
    await expect(svc.extract('document text')).rejects.toBeInstanceOf(ExtractionError);
    await expect(svc.extract('document text')).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('passes the live document AFTER the few-shot anchor on the first call', async () => {
    const { client, create } = makeClient(async () => ({
      content: JSON.stringify(VALID_RESULT),
    }));
    const svc = new OpenAIService(client, baseConfig);
    await svc.extract('LIVE DOCUMENT TEXT');
    const firstCall = create.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(firstCall.messages[0]?.role).toBe('system');
    expect(firstCall.messages[1]?.role).toBe('user'); // few-shot user
    expect(firstCall.messages[2]?.role).toBe('assistant'); // few-shot assistant
    expect(firstCall.messages[3]?.role).toBe('user');
    expect(firstCall.messages[3]?.content).toBe('LIVE DOCUMENT TEXT');
  });
});
