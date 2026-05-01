import { describe, expect, it } from 'vitest';
import { PDF_MAX_BYTES, PDF_MIME, validatePdfFile } from '@/lib/pdf-validation';

describe('validatePdfFile', () => {
  it('accepts a PDF under the limit', () => {
    expect(validatePdfFile({ type: PDF_MIME, size: 1024 })).toEqual({ ok: true });
  });

  it('accepts a PDF exactly at the limit', () => {
    expect(validatePdfFile({ type: PDF_MIME, size: PDF_MAX_BYTES })).toEqual({ ok: true });
  });

  it('rejects a non-PDF MIME type', () => {
    expect(validatePdfFile({ type: 'image/png', size: 1024 })).toEqual({
      ok: false,
      error: 'WRONG_TYPE',
    });
  });

  it('rejects an empty MIME (browser quirk)', () => {
    expect(validatePdfFile({ type: '', size: 1024 })).toEqual({
      ok: false,
      error: 'WRONG_TYPE',
    });
  });

  it('rejects a PDF over the limit', () => {
    expect(validatePdfFile({ type: PDF_MIME, size: PDF_MAX_BYTES + 1 })).toEqual({
      ok: false,
      error: 'TOO_LARGE',
    });
  });

  it('reports WRONG_TYPE before TOO_LARGE if both fail', () => {
    expect(validatePdfFile({ type: 'image/png', size: PDF_MAX_BYTES + 1 })).toEqual({
      ok: false,
      error: 'WRONG_TYPE',
    });
  });
});
