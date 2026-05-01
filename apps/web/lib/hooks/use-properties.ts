'use client';

import { useQuery } from '@tanstack/react-query';
import { PropertyListResponseSchema, type PropertyListResponse } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

export function useProperties() {
  return useQuery<PropertyListResponse>({
    queryKey: ['properties', 'list'],
    queryFn: () => apiFetch('/properties', PropertyListResponseSchema),
  });
}
