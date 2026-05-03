'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type CreatePropertyRequest,
  type PropertyDetail,
  type PropertyListResponse,
  PropertyDetailSchema,
} from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';
import { OPTIMISTIC_PROPERTY_PREFIX } from '@/lib/optimistic-id';

const PROPERTIES_LIST_KEY = ['properties', 'list'] as const;

/**
 * Generates an opaque idempotency token. crypto.randomUUID is the
 * preferred path (universal in modern browsers + Node 19+); a
 * Math.random fallback covers any obscure runtime where
 * crypto.randomUUID is missing — the key only needs to be
 * unguessable to the OTHER tabs of the same user, not to the
 * cryptographic adversary.
 */
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface OptimisticContext {
  previous: PropertyListResponse | undefined;
  tempId: string;
}

/**
 * Property creation with optimistic insertion into the dashboard
 * list cache. The mutation:
 *
 *   1. onMutate cancels any in-flight `useProperties` fetch,
 *      snapshots the current cache, and writes a placeholder row
 *      with a tmp_-prefixed id so the dashboard reflects the new
 *      property the moment Save is clicked.
 *   2. onError restores the snapshot — the placeholder vanishes
 *      and the user's existing list is intact.
 *   3. onSettled invalidates so the next read fetches fresh data
 *      (and reconciles the temp row with the real saved one).
 *
 * The dashboard's PropertyRow detects the `tmp_` prefix and
 * renders a non-clickable saving placeholder, so the optimistic
 * row never points at a 404 detail page mid-flight.
 */
export function useCreateProperty() {
  const queryClient = useQueryClient();
  return useMutation<PropertyDetail, ApiError, CreatePropertyRequest, OptimisticContext>({
    mutationFn: (body) => {
      // One idempotency key per mutation attempt — generated here,
      // not at the call site, so the wizard's Save button doesn't
      // have to thread the value. React Query retries inside the
      // SAME attempt reuse the same key (we generate once per
      // mutationFn invocation), which is exactly the contract
      // a server-side idempotency layer expects: "this is the same
      // logical write, here it is again."
      const idempotencyKey = generateIdempotencyKey();
      return apiFetch('/properties', PropertyDetailSchema, {
        method: 'POST',
        body,
        headers: { 'x-idempotency-key': idempotencyKey },
      });
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: PROPERTIES_LIST_KEY });
      const previous = queryClient.getQueryData<PropertyListResponse>(PROPERTIES_LIST_KEY);
      const tempId = `${OPTIMISTIC_PROPERTY_PREFIX}${Date.now()}`;
      queryClient.setQueryData<PropertyListResponse>(PROPERTIES_LIST_KEY, (current) => {
        const baseline: PropertyListResponse = current ?? {
          items: [],
          total: 0,
          take: 50,
          skip: 0,
        };
        return {
          ...baseline,
          items: [
            {
              id: tempId,
              name: variables.property.name,
              uniqueNumber: variables.property.uniqueNumber,
              managementType: variables.property.managementType,
            },
            ...baseline.items,
          ],
          total: baseline.total + 1,
        };
      });
      return { previous, tempId };
    },
    onError: (_err, _variables, context) => {
      if (!context) return;
      // Restore the pre-mutation snapshot — temp row vanishes,
      // existing list intact. Skip the write when previous is
      // undefined (first-ever create against an empty cache);
      // setQueryData(KEY, undefined) would clear the cache and
      // produce a brief two-step flicker between the rolled-back
      // state and the onSettled refetch.
      if (context.previous !== undefined) {
        queryClient.setQueryData(PROPERTIES_LIST_KEY, context.previous);
      }
    },
    onSettled: () => {
      // Reconcile with the server: success → real row replaces
      // the temp; failure → cache stays at the restored snapshot.
      void queryClient.invalidateQueries({ queryKey: PROPERTIES_LIST_KEY });
    },
  });
}
