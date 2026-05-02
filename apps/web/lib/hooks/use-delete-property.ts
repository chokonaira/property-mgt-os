'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PropertyListResponse } from '@buena/shared';
import { ApiError, parseEnvelope } from '@/lib/api-client';

const DEFAULT_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PROPERTIES_LIST_KEY = ['properties', 'list'] as const;

interface OptimisticContext {
  previous: PropertyListResponse | undefined;
}

/**
 * Property deletion. The server cascades buildings + units via Prisma
 * `onDelete: Cascade`, deletes the attached document + extraction-run
 * history inside the same transaction, and best-effort unlinks the
 * stored PDF. The client mutation:
 *
 *   1. onMutate optimistically removes the row from the dashboard
 *      cache so the user sees the deletion before the round-trip.
 *   2. onError restores the snapshot if the request fails.
 *   3. onSettled invalidates the list + the per-property detail cache
 *      so any open detail view falls back to the dashboard.
 *
 * The endpoint returns 204 No Content; we skip apiFetch's Zod-parse
 * path and run a thin raw fetch with the same envelope-aware error
 * handling.
 */
export function useDeleteProperty() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string, OptimisticContext>({
    mutationFn: async (id) => {
      const res = await fetch(`${DEFAULT_BASE}/properties/${id}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      });
      if (res.ok) return;
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        // fall through — envelope parse will return null
      }
      const envelope = parseEnvelope(parsed);
      throw new ApiError(
        res.status,
        envelope ?? {
          code: 'UNKNOWN',
          message: text || res.statusText || 'Delete failed',
        },
      );
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: PROPERTIES_LIST_KEY });
      const previous = queryClient.getQueryData<PropertyListResponse>(PROPERTIES_LIST_KEY);
      queryClient.setQueryData<PropertyListResponse>(PROPERTIES_LIST_KEY, (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.filter((row) => row.id !== id),
          total: Math.max(0, current.total - 1),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PROPERTIES_LIST_KEY, context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      void queryClient.invalidateQueries({ queryKey: PROPERTIES_LIST_KEY });
      void queryClient.invalidateQueries({ queryKey: ['property', id] });
    },
  });
}
