import { z } from 'zod';
import { ManagementTypeSchema } from './enums';

export const PropertyListItemSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  uniqueNumber: z.string(),
  managementType: ManagementTypeSchema,
});
export type PropertyListItem = z.infer<typeof PropertyListItemSchema>;

export const PropertyListQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  uniqueNumber: z.string().min(1).optional(),
});
export type PropertyListQuery = z.infer<typeof PropertyListQuerySchema>;

export const PropertyListResponseSchema = z.object({
  items: z.array(PropertyListItemSchema),
  total: z.number().int().nonnegative(),
  take: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
});
export type PropertyListResponse = z.infer<typeof PropertyListResponseSchema>;
