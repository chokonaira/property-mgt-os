'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type DocumentUploadResponse,
  DocumentUploadResponseSchema,
} from '@buena/shared';
import { ApiError, ApiSchemaError } from '@/lib/api-client';
import { ZodError } from 'zod';
import { ApiErrorEnvelopeSchema } from '@buena/shared';

const DEFAULT_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Multipart upload to POST /documents. The shared `apiFetch` helper
 * always serialises bodies as JSON, so the multipart path lives here
 * directly. The server's FileInterceptor expects the field name
 * `file` and rejects any other name with 400.
 */
async function uploadDocument(file: File): Promise<DocumentUploadResponse> {
  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch(`${DEFAULT_BASE}/documents`, {
    method: 'POST',
    body: form,
  });

  const text = await res.text();
  let parsed: unknown = null;
  let parseFailed = false;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parseFailed = true;
    }
  }

  if (!res.ok) {
    const envelope = parseFailed
      ? null
      : (ApiErrorEnvelopeSchema.safeParse(parsed).data?.error ?? null);
    throw new ApiError(
      res.status,
      envelope ?? {
        code: 'UNKNOWN',
        message: text || res.statusText || 'Upload failed',
      },
    );
  }

  if (parseFailed) {
    throw new ApiSchemaError(
      [{ code: 'custom', path: [], message: 'Response body is not valid JSON.' }] as ZodError['issues'],
      text,
    );
  }

  try {
    return DocumentUploadResponseSchema.parse(parsed);
  } catch (error) {
    if (error instanceof ZodError) throw new ApiSchemaError(error.issues, parsed);
    throw error;
  }
}

export function useUploadDocument() {
  return useMutation<DocumentUploadResponse, ApiError, File>({
    mutationFn: uploadDocument,
  });
}
