import { describe, expect, it } from 'vitest';
import { ApiErrorEnvelopeSchema, ErrorCodeSchema } from '../api-error';

describe('ErrorCodeSchema', () => {
  it('accepts every documented code', () => {
    const codes = [
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'EXTRACTION_TIMEOUT',
      'EXTRACTION_PARSE_FAILED',
      'EXTRACTION_TOO_LARGE',
      'INTERNAL',
      'UNKNOWN',
    ];
    for (const code of codes) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects an arbitrary string', () => {
    expect(ErrorCodeSchema.safeParse('TYPO').success).toBe(false);
  });
});

describe('ApiErrorEnvelopeSchema', () => {
  it('accepts a minimal envelope with a known code', () => {
    const result = ApiErrorEnvelopeSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'no such property' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts envelope with details + requestId', () => {
    const result = ApiErrorEnvelopeSchema.safeParse({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'bad input',
        details: [{ path: 'name', message: 'required', code: 'invalid_type' }],
        requestId: 'req_abc',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects envelope with unknown code (no longer widened to string)', () => {
    const result = ApiErrorEnvelopeSchema.safeParse({
      error: { code: 'TYPO', message: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects envelope missing the wrapping `error` key', () => {
    expect(ApiErrorEnvelopeSchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(
      false,
    );
  });

  it('rejects envelope with non-string message', () => {
    expect(
      ApiErrorEnvelopeSchema.safeParse({ error: { code: 'INTERNAL', message: 42 } }).success,
    ).toBe(false);
  });
});
