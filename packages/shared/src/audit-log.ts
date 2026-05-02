import { z } from 'zod';

/**
 * Public API contract for the audit-log surface.
 *
 *   GET /properties/:id/history
 *     → AuditLogListResponse (newest first, paginated)
 *
 * Each entry pairs the actor + timestamp + action with the diff —
 * `changedFields` is precomputed server-side so the client doesn't
 * have to walk the JSON snapshots to render a sleek timeline.
 */

export const AuditActionSchema = z.enum(['create', 'update', 'delete', 'upsert']);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditEntitySchema = z.enum(['Property', 'Building', 'Unit', 'Contact']);
export type AuditEntity = z.infer<typeof AuditEntitySchema>;

/**
 * One field that differed between `before` and `after`. The view
 * renders these as `{label}: {before} → {after}` rows.
 */
export const AuditFieldChangeSchema = z.object({
  field: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type AuditFieldChange = z.infer<typeof AuditFieldChangeSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  entity: AuditEntitySchema,
  entityId: z.string(),
  action: AuditActionSchema,
  actor: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  createdAt: z.string(),
  /**
   * Per-field diff for `update` actions. Empty array on `create` /
   * `delete` (the whole snapshot is the "diff" — see before / after).
   */
  changedFields: z.array(AuditFieldChangeSchema),
  /** Full pre-change snapshot — null on create. */
  before: z.unknown().nullable(),
  /** Full post-change snapshot — null on delete. */
  after: z.unknown().nullable(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const AuditLogListResponseSchema = z.object({
  items: z.array(AuditLogEntrySchema),
  total: z.number().int().nonnegative(),
  take: z.number().int().positive(),
  skip: z.number().int().nonnegative(),
});
export type AuditLogListResponse = z.infer<typeof AuditLogListResponseSchema>;
