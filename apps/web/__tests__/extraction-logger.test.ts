import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { logExtractionFailure } from '@/lib/extraction-logger';

describe('logExtractionFailure', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('emits a structured payload with the documentId and ApiError fields', () => {
    const error = new ApiError(504, {
      code: 'EXTRACTION_TIMEOUT',
      message: 'Reading timed out',
      requestId: 'req_abc',
    });
    logExtractionFailure('doc-1', error);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const [tag, payload] = consoleWarnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(tag).toBe('extraction.failed');
    expect(payload).toMatchObject({
      event: 'extraction.failed',
      documentId: 'doc-1',
      reason: 'EXTRACTION_TIMEOUT',
      status: 504,
      requestId: 'req_abc',
      message: 'Reading timed out',
    });
  });

  it('falls back to a generic reason for non-ApiError throwables', () => {
    logExtractionFailure(undefined, new TypeError('boom'));
    const payload = consoleWarnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: 'extraction.failed',
      documentId: undefined,
      reason: 'TypeError',
      message: 'boom',
      status: undefined,
      requestId: undefined,
    });
  });

  it('handles non-Error inputs without throwing', () => {
    logExtractionFailure('doc-2', 'something opaque');
    const payload = consoleWarnSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      reason: 'unknown',
      message: 'something opaque',
    });
  });
});
