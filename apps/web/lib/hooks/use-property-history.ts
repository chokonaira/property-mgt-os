'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AuditLogListResponseSchema, type AuditLogListResponse } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

// Product cap: the change-history surfaces (pill popover + full
// dialog) only ever show the most recent 5 entries. Keeping the cap
// low prevents the modal from growing into a wall of audit noise
// that nobody reads, keeps the network payload trivial, and matches
// the "Last modified by …" pill's role as a quick recency hint
// rather than a forensic log.
export const HISTORY_PAGE_SIZE = 5;

// Hard ceiling so a misuse / typo in the caller can't request more
// than the product cap. Both surfaces fetch with `take=5`; this
// safety net guards against accidental drift.
export const HISTORY_MAX_TAKE = 5;

export function usePropertyHistory(
  propertyId: string,
  options: { take?: number; skip?: number; enabled?: boolean } = {},
) {
  const requestedTake = options.take ?? HISTORY_PAGE_SIZE;
  const take = Math.max(1, Math.min(HISTORY_MAX_TAKE, requestedTake));
  const skip = Math.max(0, options.skip ?? 0);
  const enabled = options.enabled ?? true;
  return useQuery<AuditLogListResponse>({
    queryKey: ['properties', propertyId, 'history', { take, skip }],
    queryFn: () =>
      apiFetch(
        `/properties/${encodeURIComponent(propertyId)}/history?take=${take}&skip=${skip}`,
        AuditLogListResponseSchema,
      ),
    enabled: enabled && Boolean(propertyId),
    // Audit rows are append-only — once the dialog is open the only
    // legitimate reason to refetch is the user scrolling Load More.
    // Disabling focus + reconnect refetches stops the modal from
    // visibly flickering when the user clicks back into the tab,
    // hovers a row that briefly steals focus, or the network hiccups.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Keeps the previous page on screen while the next page request
    // is in flight, so the timeline doesn't collapse to a skeleton
    // mid-scroll.
    placeholderData: keepPreviousData,
  });
}
