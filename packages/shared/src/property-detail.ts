import { z } from 'zod';
import { BuildingSchema } from './building';
import { ContactSchema } from './contact';
import { PropertySchema } from './property';
import { UnitSchema } from './unit';

const BuildingWithUnitsSchema = BuildingSchema.extend({
  units: z.array(UnitSchema),
});

export const PropertyDetailSchema = PropertySchema.extend({
  buildings: z.array(BuildingWithUnitsSchema),
  propertyManager: ContactSchema.nullable(),
  accountant: ContactSchema.nullable(),
});
export type PropertyDetail = z.infer<typeof PropertyDetailSchema>;
