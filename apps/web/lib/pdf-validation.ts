export const PDF_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const PDF_MIME = 'application/pdf';

export type PdfValidationError = 'WRONG_TYPE' | 'TOO_LARGE';

export interface PdfValidationResult {
  ok: boolean;
  error?: PdfValidationError;
}

// Browser File API only — caller passes a single File (the dropzone never
// accepts multi-select). Server-side MIME sniffing is intentionally out
// of scope for T-202; T-501 hardens the upload endpoint.
export function validatePdfFile(file: Pick<File, 'type' | 'size'>): PdfValidationResult {
  if (file.type !== PDF_MIME) return { ok: false, error: 'WRONG_TYPE' };
  if (file.size > PDF_MAX_BYTES) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true };
}
