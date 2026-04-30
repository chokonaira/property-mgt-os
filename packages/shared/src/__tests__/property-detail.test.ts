import { describe, expect, it } from 'vitest';
import { PropertyDetailSchema } from '../property-detail';

const baseProperty = {
  id: 'cm0pp0001',
  tenantId: 'demo',
  name: 'Parkview Residences Berlin',
  uniqueNumber: '10-557-PRB',
  managementType: 'WEG' as const,
  totalMea: 1000,
  createdAt: '2026-04-01T10:00:00Z',
  updatedAt: '2026-04-01T10:00:00Z',
  buildings: [],
  propertyManager: null,
  accountant: null,
};

describe('PropertyDetailSchema', () => {
  it('accepts a property with no buildings', () => {
    expect(PropertyDetailSchema.safeParse(baseProperty).success).toBe(true);
  });

  it('accepts a property with buildings + nested units', () => {
    const result = PropertyDetailSchema.safeParse({
      ...baseProperty,
      buildings: [
        {
          id: 'cm0bA',
          propertyId: 'cm0pp0001',
          street: 'Am Fiktivpark',
          houseNumber: '12',
          country: 'DE',
          units: [
            {
              id: 'cm0u01',
              buildingId: 'cm0bA',
              number: '01',
              type: 'APARTMENT',
              sizeSqm: 95,
              areaMetric: 'WOHN',
              meaShare: 110,
              rooms: 3,
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts inlined contacts', () => {
    const result = PropertyDetailSchema.safeParse({
      ...baseProperty,
      propertyManager: {
        id: 'cm0c1',
        tenantId: 'demo',
        name: 'immoGuard',
        role: 'WEG-Verwalter',
      },
    });
    expect(result.success).toBe(true);
  });
});
