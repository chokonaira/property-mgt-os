import { z } from 'zod';

// Wire shape (read responses). `country` is always present; the API
// mapper substitutes 'DE' when the column is null. Avoiding `.default()`
// here keeps `z.infer` output cleanly required (zod's default helper
// produces a string|undefined input which leaks into TanStack Query
// generic inference under bundler module resolution).
export const BuildingSchema = z.object({
  id: z.string().min(1),
  propertyId: z.string().min(1),
  street: z.string().min(1),
  houseNumber: z.string().min(1),
  postalCode: z
    .string()
    .regex(/^\d{5}$/, '5-digit German postal code')
    .optional(),
  city: z.string().optional(),
  country: z.string().length(2),
  label: z.string().optional(),
  nickname: z.string().optional(),
  yearBuilt: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  floorsCount: z.number().int().min(0).max(50).optional(),
  hasElevator: z.boolean().optional(),
  energyStandard: z.string().optional(),
  heating: z.string().optional(),
  buildingType: z.string().optional(),
});
export type Building = z.infer<typeof BuildingSchema>;

// Write contract: country may be omitted by the wizard; the API fills 'DE'.
export const CreateBuildingSchema = BuildingSchema.omit({
  id: true,
  propertyId: true,
  country: true,
}).extend({
  country: z.string().length(2).default('DE'),
});
export type CreateBuilding = z.infer<typeof CreateBuildingSchema>;

export const UpdateBuildingSchema = CreateBuildingSchema.partial();
export type UpdateBuilding = z.infer<typeof UpdateBuildingSchema>;
