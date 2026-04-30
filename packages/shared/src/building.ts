import { z } from 'zod';

export const BuildingSchema = z.object({
  id: z.string().cuid(),
  propertyId: z.string().cuid(),
  street: z.string().min(1),
  houseNumber: z.string().min(1),
  postalCode: z
    .string()
    .regex(/^\d{5}$/, '5-digit German postal code')
    .optional(),
  city: z.string().optional(),
  country: z.string().length(2).default('DE'),
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

export const CreateBuildingSchema = BuildingSchema.omit({ id: true, propertyId: true });
export type CreateBuilding = z.infer<typeof CreateBuildingSchema>;

export const UpdateBuildingSchema = CreateBuildingSchema.partial();
export type UpdateBuilding = z.infer<typeof UpdateBuildingSchema>;
