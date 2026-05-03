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
    onSuccess: async (data) => {
      // Awaiting the invalidations means the mutation's `isPending`
      // stays true until the refetch lands. The Save button stays in
      // its loader state for the extra ~50 ms it takes the API to
      // return the new audit row, which is a much smaller jank than
      // "Saved." flashing while the chip still shows the old data.
      //
      // refetchType: 'active' is the default, but we spell it for the
      // history key — the LastModifiedPill is the only consumer and
      // it IS active during the edit, so an in-place refetch is what
      // we want here.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['properties', 'detail', data.id],
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: ['properties', data.id, 'history'],
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: ['properties'],
          refetchType: 'active',
        }),
      ]);
    },
  });
}
