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
  // eslint-disable-next-line no-console -- intentional structured error log; not a debug breadcrumb
  console.error('extraction.failed', payload);
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
