import { ApiError } from '@/lib/api-client';

interface ExtractionFailurePayload {
  event: 'extraction.failed';
  documentId: string | undefined;
  reason: string;
  status: number | undefined;
  requestId: string | undefined;
  message: string;
}

/**
 * Single client-side hook for "extraction request failed" telemetry.
 * Today it writes a structured `console.error` so the message lands
 * in the browser dev console + any wrapping log shipper (Sentry,
 * LogRocket, etc.) can pick it up without app code changes. When we
 * wire a real telemetry stack the body of this function changes;
 * call sites stay the same.
 *
 * Why a dedicated module instead of inline `console.error`:
 *   - One place to grep for "what do we know about extraction
 *     failures in the browser?".
 *   - Tests can spy on `logExtractionFailure` without intercepting
 *     console globals.
 *   - The error envelope shape (code / status / requestId) is
 *     already well-known via ApiError; this normalises it.
 */
export function logExtractionFailure(documentId: string | undefined, error: unknown): void {
  const payload: ExtractionFailurePayload = {
    event: 'extraction.failed',
    documentId,
    ...extractFields(error),
  };
  // console.warn (not console.error) so Next.js dev overlay doesn't
  // treat a recoverable extraction failure as a crash. Real log
  // shippers (Sentry, LogRocket, Datadog browser SDK) pick up both
  // warn + error, so production telemetry is unchanged. Production
  // upgrade swaps this for the shipper's own client.
  // eslint-disable-next-line no-console -- intentional structured telemetry; not a debug breadcrumb
  console.warn('extraction.failed', payload);
}

function extractFields(error: unknown): Omit<ExtractionFailurePayload, 'event' | 'documentId'> {
  if (error instanceof ApiError) {
    return {
      reason: error.body.code,
      status: error.status,
      requestId: error.body.requestId,
      message: error.body.message,
    };
  }
  if (error instanceof Error) {
    return { reason: error.name || 'Error', status: undefined, requestId: undefined, message: error.message };
  }
  return { reason: 'unknown', status: undefined, requestId: undefined, message: String(error) };
}
