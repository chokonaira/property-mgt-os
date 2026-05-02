'use client';

import { useQuery } from '@tanstack/react-query';
import { AuditLogListResponseSchema, type AuditLogListResponse } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

export function usePropertyHistory(
  propertyId: string,
  options: { take?: number; skip?: number; enabled?: boolean } = {},
) {
  const { take = 50, skip = 0, enabled = true } = options;
  return useQuery<AuditLogListResponse>({
    queryKey: ['properties', propertyId, 'history', { take, skip }],
    queryFn: () =>
      apiFetch(
        `/properties/${encodeURIComponent(propertyId)}/history?take=${take}&skip=${skip}`,
        AuditLogListResponseSchema,
      ),
    enabled: enabled && Boolean(propertyId),
    staleTime: 30_000,
  });
}
