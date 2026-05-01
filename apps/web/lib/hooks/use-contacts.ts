'use client';

import { useQuery } from '@tanstack/react-query';
import { ContactListResponseSchema, type ContactRole } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

export function useContacts(role: ContactRole) {
  return useQuery({
    queryKey: ['contacts', 'list', role],
    queryFn: () =>
      apiFetch(`/contacts?role=${encodeURIComponent(role)}`, ContactListResponseSchema),
    staleTime: 30_000,
  });
}
