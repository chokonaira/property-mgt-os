import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@buena/shared';
import { ApiError } from '@/lib/api-client';
import { extractionErrorKey } from '@/lib/extraction-error-key';

function apiError(code: ErrorCode, status = 500): ApiError {
  return new ApiError(status, { code, message: code });
}

describe('extractionErrorKey', () => {
  it('returns generic for non-Error inputs', () => {
    expect(extractionErrorKey(undefined)).toBe('generic');
    expect(extractionErrorKey(null)).toBe('generic');
    expect(extractionErrorKey('boom')).toBe('generic');
    expect(extractionErrorKey(new Error('boom'))).toBe('generic');
  });

  it('maps EXTRACTION_TOO_LARGE and PAYLOAD_TOO_LARGE to tooLarge', () => {
    expect(extractionErrorKey(apiError('EXTRACTION_TOO_LARGE', 413))).toBe('tooLarge');
    expect(extractionErrorKey(apiError('PAYLOAD_TOO_LARGE', 413))).toBe('tooLarge');
  });

  it('maps EXTRACTION_TIMEOUT to timeout', () => {
    expect(extractionErrorKey(apiError('EXTRACTION_TIMEOUT', 504))).toBe('timeout');
  });

  it('maps EXTRACTION_PARSE_FAILED to parseFailed', () => {
    expect(extractionErrorKey(apiError('EXTRACTION_PARSE_FAILED', 502))).toBe('parseFailed');
  });

  it('maps VALIDATION_FAILED and UNSUPPORTED_MEDIA_TYPE to unreadable', () => {
    expect(extractionErrorKey(apiError('VALIDATION_FAILED', 422))).toBe('unreadable');
    expect(extractionErrorKey(apiError('UNSUPPORTED_MEDIA_TYPE', 415))).toBe('unreadable');
  });

  it('maps SERVICE_UNAVAILABLE to unavailable', () => {
    expect(extractionErrorKey(apiError('SERVICE_UNAVAILABLE', 503))).toBe('unavailable');
  });

  it('maps RATE_LIMITED to rateLimited', () => {
    expect(extractionErrorKey(apiError('RATE_LIMITED', 429))).toBe('rateLimited');
  });

  it('falls back to generic for unmapped codes', () => {
    expect(extractionErrorKey(apiError('INTERNAL', 500))).toBe('generic');
    expect(extractionErrorKey(apiError('NOT_FOUND', 404))).toBe('generic');
    expect(extractionErrorKey(apiError('CONFLICT', 409))).toBe('generic');
  });
});
