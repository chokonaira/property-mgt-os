'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AuditLogListResponseSchema, PropertyDetailSchema } from '@buena/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { HISTORY_PAGE_SIZE } from './use-property-history';

export function usePropertyDetail(id: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['properties', 'detail', id],
    queryFn: () => apiFetch(`/properties/${encodeURIComponent(id)}`, PropertyDetailSchema),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 1;
    },
  });

  // Pre-warm the audit-history cache the first time the detail page
  // mounts. The LastModifiedPill renders during the same paint as
  // the property detail, so without this its useQuery fires
  // serially after the detail one and the user sees a "Loading
  // history…" placeholder for ~30 ms even though the API is fast.
  // The prefetch shares the exact key shape use-property-history
  // uses so the pill picks the cache up on first read.
  useEffect(() => {
    if (!id) return;
    void queryClient.prefetchQuery({
      queryKey: ['properties', id, 'history', { take: HISTORY_PAGE_SIZE, skip: 0 }],
      queryFn: () =>
        apiFetch(
          `/properties/${encodeURIComponent(id)}/history?take=${HISTORY_PAGE_SIZE}&skip=0`,
          AuditLogListResponseSchema,
        ),
      staleTime: 5 * 60_000,
    });
  }, [id, queryClient]);

  return query;
}
