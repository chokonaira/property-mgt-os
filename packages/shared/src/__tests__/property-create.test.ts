import { describe, expect, it } from 'vitest';
import { CreatePropertyRequestSchema } from '../property-create';

const valid = {
  property: {
    managementType: 'WEG' as const,
    name: 'Parkview Residences',
    uniqueNumber: '10-557-PRB',
  },
  buildings: [{ street: 'Hauptstr.', houseNumber: '1', country: 'DE' }],
  units: [
    {
      type: 'APARTMENT' as const,
      buildingIndex: 0,
      number: '1',
      meaShare: 100,
      sizeSqm: 70,
      rooms: 2,
    },
  ],
};

describe('CreatePropertyRequestSchema', () => {
  it('accepts the canonical happy path', () => {
    expect(CreatePropertyRequestSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an empty buildings array', () => {
    expect(CreatePropertyRequestSchema.safeParse({ ...valid, buildings: [] }).success).toBe(false);
  });

  it('rejects an empty units array', () => {
    expect(CreatePropertyRequestSchema.safeParse({ ...valid, units: [] }).success).toBe(false);
  });

  it('rejects a unit pointing to a buildingIndex outside the buildings array', () => {
    const result = CreatePropertyRequestSchema.safeParse({
      ...valid,
      units: [{ ...valid.units[0], buildingIndex: 5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'units.0.buildingIndex');
      expect(issue).toBeDefined();
    }
  });

  it('requires sizeSqm + rooms for APARTMENT', () => {
    expect(
      CreatePropertyRequestSchema.safeParse({
        ...valid,
        units: [
          {
            type: 'APARTMENT',
            buildingIndex: 0,
            number: '1',
            meaShare: 100,
            // sizeSqm + rooms missing
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires sizeSqm for OFFICE / PARKING / GARDEN', () => {
    for (const type of ['OFFICE', 'PARKING', 'GARDEN'] as const) {
      expect(
        CreatePropertyRequestSchema.safeParse({
          ...valid,
          units: [{ type, buildingIndex: 0, number: '1', meaShare: 50 }],
        }).success,
      ).toBe(false);
    }
  });

  it('rejects a uniqueNumber containing whitespace or punctuation', () => {
    expect(
      CreatePropertyRequestSchema.safeParse({
        ...valid,
        property: { ...valid.property, uniqueNumber: 'BAD VALUE' },
      }).success,
    ).toBe(false);
    expect(
      CreatePropertyRequestSchema.safeParse({
        ...valid,
        property: { ...valid.property, uniqueNumber: 'BAD/VALUE' },
      }).success,
    ).toBe(false);
  });

  it('trims property name', () => {
    const result = CreatePropertyRequestSchema.safeParse({
      ...valid,
      property: { ...valid.property, name: '  Parkview  ' },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.property.name).toBe('Parkview');
  });

  it('admits both APARTMENT and PARKING in the same payload', () => {
    expect(
      CreatePropertyRequestSchema.safeParse({
        ...valid,
        units: [
          {
            type: 'APARTMENT',
            buildingIndex: 0,
            number: '1',
            meaShare: 50,
            sizeSqm: 70,
            rooms: 2,
          },
          {
            type: 'PARKING',
            buildingIndex: 0,
            number: 'P1',
            meaShare: 5,
            sizeSqm: 12,
            parkingCode: 'P-12',
          },
        ],
      }).success,
    ).toBe(true);
  });
});
