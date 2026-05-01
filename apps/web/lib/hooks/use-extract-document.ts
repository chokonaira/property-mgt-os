'use client';

import { useMutation } from '@tanstack/react-query';
import type { ZodSchema } from 'zod';
import {
  type ExtractionRunResponse,
  ExtractionRunResponseSchema,
} from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';

interface ExtractRequest {
  documentId: string;
  force?: boolean;
}

// ExtractionRunResponseSchema's parsed output narrows several arrays
// (warnings / contacts / confidenceByField / sourceSpansByField) via
// `.default(…)`, so its inferred output type is stricter than its
// input type. The shared `apiFetch` helper takes a `ZodSchema<T>`
// which collapses both sides — the cast pins T to the strict output
// shape so callers see the post-default values.
const RESPONSE_SCHEMA = ExtractionRunResponseSchema as unknown as ZodSchema<ExtractionRunResponse>;

export function useExtractDocument() {
  return useMutation<ExtractionRunResponse, ApiError, ExtractRequest>({
    mutationFn: ({ documentId, force }) =>
      apiFetch(`/extraction/runs${force ? '?force=true' : ''}`, RESPONSE_SCHEMA, {
        method: 'POST',
        body: { documentId },
      }),
  });
}
