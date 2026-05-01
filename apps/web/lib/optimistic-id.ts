/**
 * Prefix every cache-only optimistic id with a stable string so
 * downstream consumers (PropertyRow, the dashboard link, the chatbot
 * later) can detect "this id has not been confirmed by the server
 * yet" and render a non-clickable placeholder. Pure constant + a
 * predicate so the rule stays one source of truth.
 */
export const OPTIMISTIC_PROPERTY_PREFIX = 'tmp_';

export function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_PROPERTY_PREFIX);
}
