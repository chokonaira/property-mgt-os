import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'EXTRACTION_TIMEOUT',
  'EXTRACTION_PARSE_FAILED',
  'EXTRACTION_TOO_LARGE',
  'EXTRACTION_NOT_TEILUNGSERKLARUNG',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
  'UNKNOWN',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
