'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PropertyDetailSchema,
  type PropertyDetail,
  type UpdateProperty,
} from '@buena/shared';
import { apiFetch, ApiError } from '@/lib/api-client';

interface UpdateInput {
  id: string;
  patch: UpdateProperty;
}

/**
 * Mutation for the inline edit-property flow on the detail page.
 * Sends a PATCH with only the fields the caller wants to change;
 * the server merges them onto the existing row + emits an audit
 * entry per field-level diff via the Prisma audit middleware.
 *
 * On success we invalidate three caches so every surface that
 * touches the property re-reads fresh data:
 *   - the detail query (the user's current page)
 *   - the dashboard list (name + uniqueNumber show in the row)
 *   - the property history list (the new audit entry should appear)
 */
export function useUpdateProperty() {
  const queryClient = useQueryClient();
  return useMutation<PropertyDetail, ApiError, UpdateInput>({
    mutationFn: ({ id, patch }) =>
      apiFetch(`/properties/${encodeURIComponent(id)}`, PropertyDetailSchema, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['properties', 'detail', data.id] });
      void queryClient.invalidateQueries({ queryKey: ['properties', data.id, 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['properties'] });
    },
  });
}
