export type ExtractionFailure =
  | 'cannot_read_pdf'
  | 'document_missing'
  | 'storage_missing'
  | 'timeout'
  | 'parse_failed'
  | 'too_large';

/**
 * Domain error for the extraction pipeline. Lives outside Nest's
 * exception hierarchy on purpose so the service layer stays pure;
 * the controller / filter wraps it in an HTTP envelope at the
 * boundary.
 */
export class ExtractionError extends Error {
  readonly reason: ExtractionFailure;
  override readonly cause?: unknown;

  constructor(reason: ExtractionFailure, message?: string, cause?: unknown) {
    super(message ?? reason);
    this.name = 'ExtractionError';
    this.reason = reason;
    if (cause !== undefined) this.cause = cause;
  }
}
