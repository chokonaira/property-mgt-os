import { z } from 'zod';

const ExtractedFloorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('EG') }),
  z.object({
    kind: z.literal('OG'),
    level: z.number().int().min(0).max(99),
    qualifier: z.string().optional(),
  }),
  z.object({ kind: z.literal('UG'), level: z.number().int().min(1).max(9) }),
  z.object({ kind: z.literal('DG') }),
  z.object({ kind: z.literal('STAFFEL') }),
]);

export const ExtractedUnitSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('APARTMENT'),
    number: z.string(),
    buildingLabel: z.string(),
    floor: ExtractedFloorSchema.optional(),
    entranceLabel: z.string().optional(),
    entranceNote: z.string().optional(),
    sizeSqm: z.number().positive().optional(),
    rooms: z.number().int().min(0).max(50).optional(),
    meaShare: z.number().nonnegative().optional(),
    yearBuilt: z.number().int().min(1800).max(2100).optional(),
    subCategory: z.string().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('OFFICE'),
    number: z.string(),
    buildingLabel: z.string(),
    floor: ExtractedFloorSchema.optional(),
    entranceLabel: z.string().optional(),
    entranceNote: z.string().optional(),
    sizeSqm: z.number().positive().optional(),
    meaShare: z.number().nonnegative().optional(),
    yearBuilt: z.number().int().min(1800).max(2100).optional(),
    layoutNote: z.string().optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('PARKING'),
    number: z.string(),
    buildingLabel: z.string(),
    parkingCode: z.string().optional(),
    sizeSqm: z.number().positive().optional(),
    meaShare: z.number().nonnegative().optional(),
    yearBuilt: z.number().int().min(1800).max(2100).optional(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('GARDEN'),
    number: z.string(),
    buildingLabel: z.string(),
    sizeSqm: z.number().positive().optional(),
    meaShare: z.number().nonnegative().optional(),
    yearBuilt: z.number().int().min(1800).max(2100).optional(),
    description: z.string().optional(),
  }),
]);

export const ExtractedBuildingSchema = z.object({
  label: z.string(),
  nickname: z.string().optional(),
  street: z.string(),
  houseNumber: z.string(),
  postalCode: z
    .string()
    .regex(/^\d{4,5}$/)
    .optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  floorsCount: z.number().int().min(1).max(150).optional(),
  hasElevator: z.boolean().optional(),
  energyStandard: z.string().optional(),
  heating: z.string().optional(),
  buildingType: z.string().optional(),
});

export const ExtractedContactSchema = z.object({
  role: z.enum(['PROPERTY_MANAGER', 'ACCOUNTANT']),
  name: z.string(),
  street: z.string().optional(),
  houseNumber: z.string().optional(),
  postalCode: z
    .string()
    .regex(/^\d{4,5}$/)
    .optional(),
  city: z.string().optional(),
});

export const ExtractedPropertySchema = z.object({
  name: z.string(),
  uniqueNumber: z.string().optional(),
  managementType: z.enum(['WEG', 'MV']),
  totalMea: z.number().positive().optional(),
  notarialRollNo: z.string().optional(),
  notarizedAt: z.string().optional(),
  grundbuchOffice: z.string().optional(),
  grundbuchSheet: z.string().optional(),
  gemarkung: z.string().optional(),
  flur: z.string().optional(),
  flurstueck: z.string().optional(),
  totalAreaSqm: z.number().positive().optional(),
});

export const ExtractionResultSchema = z.object({
  property: ExtractedPropertySchema,
  buildings: z.array(ExtractedBuildingSchema).min(1),
  units: z.array(ExtractedUnitSchema),
  contacts: z.array(ExtractedContactSchema).default([]),
  confidenceByField: z.record(z.string(), z.number().min(0).max(1)).default({}),
  sourceSpansByField: z.record(z.string(), z.string()).default({}),
  warnings: z
    .array(
      z.object({
        code: z.enum(['MEA_MISMATCH', 'MISSING_FIELD', 'UNRECOGNIZED_TYPE', 'AMBIGUOUS_VALUE']),
        message: z.string(),
        fields: z.array(z.string()),
      }),
    )
    .default([]),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
