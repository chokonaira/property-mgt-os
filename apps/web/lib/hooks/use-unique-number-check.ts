'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PropertyListResponseSchema } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

export type UniqueNumberStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'available' }
  | { kind: 'taken'; takenById: string }
  | { kind: 'error' };

const DEBOUNCE_MS = 350;

export function useUniqueNumberCheck(value: string): UniqueNumberStatus {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  const enabled = debounced.length > 0;
  const { data, isPending, isError, isFetching } = useQuery({
    queryKey: ['properties', 'unique-number', debounced],
    queryFn: () =>
      apiFetch(
        `/properties?uniqueNumber=${encodeURIComponent(debounced)}`,
        PropertyListResponseSchema,
      ),
    enabled,
    staleTime: 5_000,
  });

  if (!enabled) return { kind: 'idle' };
  if (isError) return { kind: 'error' };
  if (isPending || isFetching || debounced !== value) return { kind: 'pending' };
  if (!data) return { kind: 'pending' };
  if (data.items.length === 0) return { kind: 'available' };
  return { kind: 'taken', takenById: data.items[0]!.id };
}
