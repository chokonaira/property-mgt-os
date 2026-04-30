import { z } from 'zod';

export const ManagementTypeSchema = z.enum(['WEG', 'MV']);
export type ManagementType = z.infer<typeof ManagementTypeSchema>;

export const UnitTypeSchema = z.enum(['APARTMENT', 'OFFICE', 'GARDEN', 'PARKING']);
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const FloorKindSchema = z.enum(['EG', 'OG', 'UG', 'DG', 'STAFFEL']);
export type FloorKind = z.infer<typeof FloorKindSchema>;

export const AreaMetricSchema = z.enum(['WOHN', 'NUTZ', 'ROH', 'GROUND']);
export type AreaMetric = z.infer<typeof AreaMetricSchema>;
