import { z } from 'zod';
import { ManagementTypeSchema } from './enums';

export const PropertySchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  uniqueNumber: z.string().min(1).max(64),
  managementType: ManagementTypeSchema,
  totalMea: z.number().nonnegative().optional(),
  notarialRollNo: z.string().optional(),
  notarizedAt: z.coerce.date().optional(),
  declarationFileId: z.string().min(1).optional(),
  grundbuchOffice: z.string().optional(),
  grundbuchSheet: z.string().optional(),
  gemarkung: z.string().optional(),
  flur: z.string().optional(),
  flurstueck: z.string().optional(),
  totalAreaSqm: z.number().nonnegative().optional(),
  propertyManagerId: z.string().min(1).optional(),
  accountantId: z.string().min(1).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Property = z.infer<typeof PropertySchema>;

export const CreatePropertySchema = PropertySchema.omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateProperty = z.infer<typeof CreatePropertySchema>;

export const UpdatePropertySchema = CreatePropertySchema.partial();
export type UpdateProperty = z.infer<typeof UpdatePropertySchema>;
