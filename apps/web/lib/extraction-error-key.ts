import { ApiError } from '@/lib/api-client';

export type ExtractionErrorKey =
  | 'tooLarge'
  | 'timeout'
  | 'parseFailed'
  | 'unreadable'
  | 'unavailable'
  | 'rateLimited'
  | 'generic';

/**
 * Maps an unknown error from the upload + extraction pipeline to a
 * stable translation key under `extraction.status.errors.*`. Pure so
 * the mapping can be tested without rendering the banner.
 */
export function extractionErrorKey(error: unknown): ExtractionErrorKey {
  if (error instanceof ApiError) {
    switch (error.body.code) {
      case 'EXTRACTION_TOO_LARGE':
      case 'PAYLOAD_TOO_LARGE':
        return 'tooLarge';
      case 'EXTRACTION_TIMEOUT':
        return 'timeout';
      case 'EXTRACTION_PARSE_FAILED':
        return 'parseFailed';
      case 'VALIDATION_FAILED':
      case 'UNSUPPORTED_MEDIA_TYPE':
        return 'unreadable';
      case 'SERVICE_UNAVAILABLE':
        return 'unavailable';
      case 'RATE_LIMITED':
        return 'rateLimited';
      default:
        return 'generic';
    }
  }
  return 'generic';
}
