'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AuditLogListResponseSchema, type AuditLogListResponse } from '@buena/shared';
import { apiFetch } from '@/lib/api-client';

// Pill popover preview — the recency hint that lives next to the
// title. 5 fits one viewport without scrolling and matches the
// pill's role as a quick "what changed lately" glance.
export const HISTORY_PILL_SIZE = 5;

// Full-timeline dialog page. Larger than the pill so a power user
// reviewing the audit doesn't paginate every 5 rows. Load More
// pages another 25 at a time.
export const HISTORY_DIALOG_PAGE_SIZE = 25;

// Per-request safety net so a typo in the caller can't pull
// thousands of rows in one shot. Server enforces its own bound; this
// guards the client.
export const HISTORY_MAX_TAKE = 100;

/**
 * @deprecated Kept for backwards-compatibility while the prefetch
 * in usePropertyDetail still imports it. Use HISTORY_PILL_SIZE for
 * the pill preview and HISTORY_DIALOG_PAGE_SIZE for the full
 * timeline dialog.
 */
export const HISTORY_PAGE_SIZE = HISTORY_PILL_SIZE;

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
