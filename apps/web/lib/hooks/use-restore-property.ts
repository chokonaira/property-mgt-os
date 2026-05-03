'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PropertyDetailSchema, type PropertyDetail } from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';

/**
 * Restores a soft-deleted property. Mirrors the create / update
 * mutation shape so the dashboard's Undo toast can call it without
 * any wiring quirks.
 *
 * On success we invalidate the dashboard list (the row reappears),
 * the detail cache (the previously-deleted page becomes navigable
 * again), and the history cache (the restore itself is an audit
 * row that should show up in the pill).
 */
export function useRestoreProperty() {
  const queryClient = useQueryClient();
  return useMutation<PropertyDetail, ApiError, string>({
    mutationFn: (id) =>
      apiFetch(`/properties/${encodeURIComponent(id)}/restore`, PropertyDetailSchema, {
        method: 'POST',
      }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['properties'] }),
        queryClient.invalidateQueries({ queryKey: ['properties', 'detail', data.id] }),
        queryClient.invalidateQueries({ queryKey: ['properties', data.id, 'history'] }),
      ]);
    },
  });
}
