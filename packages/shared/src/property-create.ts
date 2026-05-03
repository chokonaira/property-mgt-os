import { z } from 'zod';
import { CreateBuildingSchema } from './building';
import { ManagementTypeSchema } from './enums';
import { FloorSchema } from './floor';

// Strict create-time payload for the atomic POST /properties endpoint.
// Mirrors the relaxed wire shape but tightens what the wizard collects:
// sizeSqm + APARTMENT rooms are required at submit time, the
// uniqueNumber is alphanumeric+hyphens, and every text field is
// trimmed. Optional fields stay truly optional.
const BaseCreateUnit = z.object({
  buildingIndex: z.number().int().min(0),
  number: z.string().trim().min(1).max(20),
  meaShare: z.number().nonnegative().max(10000),
  sizeSqm: z.number().positive(),
  floor: FloorSchema.optional(),
  entranceLabel: z.string().trim().min(1).max(40).optional(),
  yearBuilt: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  description: z.string().trim().min(1).max(500).optional(),
});

export const CreateUnitWithBuildingIndexSchema = z.discriminatedUnion('type', [
  BaseCreateUnit.extend({
    type: z.literal('APARTMENT'),
    rooms: z.number().int().min(0).max(50),
    subCategory: z.string().trim().min(1).max(40).optional(),
  }),
  BaseCreateUnit.extend({
    type: z.literal('OFFICE'),
    layoutNote: z.string().trim().min(1).max(120).optional(),
  }),
  BaseCreateUnit.extend({
    type: z.literal('PARKING'),
    parkingCode: z.string().trim().min(1).max(20).optional(),
  }),
  BaseCreateUnit.extend({
    type: z.literal('GARDEN'),
  }),
]);
export type CreateUnitWithBuildingIndex = z.infer<typeof CreateUnitWithBuildingIndexSchema>;

// Replace-units payload for `PUT /properties/:id/units`. Each entry
// is a CreateUnitWithBuildingIndex shape PLUS an optional `id`:
//   - id present → match against the existing row, UPDATE if changed
//   - id absent  → INSERT as a new unit
// Existing rows whose ids don't appear in the payload get DELETEd.
// One transaction. Audit middleware fires per touched row, so the
// timeline shows insert / update / delete entries the user can read.
const WithOptionalId = z.object({ id: z.string().min(1).optional() });
export const ReplaceUnitWithIdSchema = z.discriminatedUnion('type', [
  BaseCreateUnit.merge(WithOptionalId).extend({
    type: z.literal('APARTMENT'),
    rooms: z.number().int().min(0).max(50),
    subCategory: z.string().trim().min(1).max(40).optional(),
  }),
  BaseCreateUnit.merge(WithOptionalId).extend({
    type: z.literal('OFFICE'),
    layoutNote: z.string().trim().min(1).max(120).optional(),
  }),
  BaseCreateUnit.merge(WithOptionalId).extend({
    type: z.literal('PARKING'),
    parkingCode: z.string().trim().min(1).max(20).optional(),
  }),
  BaseCreateUnit.merge(WithOptionalId).extend({
    type: z.literal('GARDEN'),
  }),
]);
export type ReplaceUnitWithId = z.infer<typeof ReplaceUnitWithIdSchema>;

export const ReplaceUnitsRequestSchema = z.object({
  units: z.array(ReplaceUnitWithIdSchema).min(1),
});
export type ReplaceUnitsRequest = z.infer<typeof ReplaceUnitsRequestSchema>;

const CreatePropertyHeaderSchema = z.object({
  managementType: ManagementTypeSchema,
  name: z.string().trim().min(1).max(200),
  uniqueNumber: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9-]+$/),
  totalMea: z.number().nonnegative().max(10000).optional(),
  propertyManagerId: z.string().min(1).optional(),
  accountantId: z.string().min(1).optional(),
  notarialRollNo: z.string().trim().min(1).max(40).optional(),
  notarizedAt: z.coerce.date().optional(),
  declarationFileId: z.string().min(1).optional(),
  grundbuchOffice: z.string().trim().min(1).max(80).optional(),
  grundbuchSheet: z.string().trim().min(1).max(40).optional(),
  gemarkung: z.string().trim().min(1).max(80).optional(),
  flur: z.string().trim().min(1).max(20).optional(),
  flurstueck: z.string().trim().min(1).max(40).optional(),
  totalAreaSqm: z.number().nonnegative().optional(),
});
export type CreatePropertyHeader = z.infer<typeof CreatePropertyHeaderSchema>;

export const CreatePropertyRequestSchema = z
  .object({
    property: CreatePropertyHeaderSchema,
    buildings: z.array(CreateBuildingSchema).min(1),
    units: z.array(CreateUnitWithBuildingIndexSchema).min(1),
  })
  .superRefine((value, ctx) => {
    // Cross-field validation: every unit's buildingIndex must point at
    // a real position in the buildings array. Zod's discriminated
    // union can't express this, so we surface it here.
    const max = value.buildings.length - 1;
    value.units.forEach((unit, idx) => {
      if (unit.buildingIndex > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['units', idx, 'buildingIndex'],
          message: `buildingIndex ${unit.buildingIndex} is out of range (0..${max}).`,
        });
      }
    });
  });
export type CreatePropertyRequest = z.infer<typeof CreatePropertyRequestSchema>;
