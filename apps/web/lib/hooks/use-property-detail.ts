'use client';

import { useQuery } from '@tanstack/react-query';
import { PropertyDetailSchema } from '@buena/shared';
import { apiFetch, ApiError } from '@/lib/api-client';

export function usePropertyDetail(id: string) {
  return useQuery({
    queryKey: ['properties', 'detail', id],
    queryFn: () => apiFetch(`/properties/${encodeURIComponent(id)}`, PropertyDetailSchema),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 1;
    },
  });
}
