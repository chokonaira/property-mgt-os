import { z } from 'zod';
import { FloorSchema } from './floor';

const BaseUnit = z.object({
  id: z.string().min(1),
  buildingId: z.string().min(1),
  number: z.string().min(1),
  meaShare: z.number().nonnegative().max(10000),
  floor: FloorSchema.optional(),
  entranceLabel: z.string().optional(),
  entranceNote: z.string().optional(),
  yearBuilt: z
    .number()
    .int()
    .min(1800)
    .max(new Date().getFullYear() + 1)
    .optional(),
  description: z.string().max(500).optional(),
});

export const UnitSchema = z.discriminatedUnion('type', [
  BaseUnit.extend({
    type: z.literal('APARTMENT'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('WOHN'),
    rooms: z.number().int().min(0).max(50),
    subCategory: z.string().optional(),
  }),
  BaseUnit.extend({
    type: z.literal('OFFICE'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('NUTZ'),
    layoutNote: z.string().optional(),
  }),
  BaseUnit.extend({
    type: z.literal('PARKING'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('NUTZ'),
    parkingCode: z.string().optional(),
  }),
  BaseUnit.extend({
    type: z.literal('GARDEN'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('GROUND'),
  }),
]);
export type Unit = z.infer<typeof UnitSchema>;

const stripIds = { id: true, buildingId: true } as const;

export const CreateUnitSchema = z.discriminatedUnion('type', [
  BaseUnit.omit(stripIds).extend({
    type: z.literal('APARTMENT'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('WOHN'),
    rooms: z.number().int().min(0).max(50),
    subCategory: z.string().optional(),
  }),
  BaseUnit.omit(stripIds).extend({
    type: z.literal('OFFICE'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('NUTZ'),
    layoutNote: z.string().optional(),
  }),
  BaseUnit.omit(stripIds).extend({
    type: z.literal('PARKING'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('NUTZ'),
    parkingCode: z.string().optional(),
  }),
  BaseUnit.omit(stripIds).extend({
    type: z.literal('GARDEN'),
    sizeSqm: z.number().positive(),
    areaMetric: z.literal('GROUND'),
  }),
]);
export type CreateUnit = z.infer<typeof CreateUnitSchema>;

export const UpdateUnitSchema = BaseUnit.omit(stripIds)
  .extend({
    sizeSqm: z.number().positive().optional(),
    rooms: z.number().int().min(0).max(50).optional(),
    subCategory: z.string().optional(),
    layoutNote: z.string().optional(),
    parkingCode: z.string().optional(),
  })
  .partial();
export type UpdateUnit = z.infer<typeof UpdateUnitSchema>;
