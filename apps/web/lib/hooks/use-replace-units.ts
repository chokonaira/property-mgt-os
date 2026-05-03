'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PropertyDetailSchema,
  type PropertyDetail,
  type ReplaceUnitsRequest,
} from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';

interface ReplaceUnitsInput {
  propertyId: string;
  body: ReplaceUnitsRequest;
}

/**
 * Bulk replace the units of an existing property. Sends the full
 * post-edit array; the server diffs against existing rows and
 * emits one audit row per touched unit (insert / update / delete)
 * via the Prisma audit middleware.
 *
 * On success we invalidate three caches so every surface that
 * touches the property re-reads fresh data: the detail query,
 * the dashboard list (unit count is summary fodder), and the
 * property history list (the new audit rows should appear in
 * the pill + the timeline modal immediately).
 */
export function useReplaceUnits() {
  const queryClient = useQueryClient();
  return useMutation<PropertyDetail, ApiError, ReplaceUnitsInput>({
    mutationFn: ({ propertyId, body }) =>
      apiFetch(`/properties/${encodeURIComponent(propertyId)}/units`, PropertyDetailSchema, {
        method: 'PUT',
        body,
      }),
    onSuccess: async (data) => {
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
