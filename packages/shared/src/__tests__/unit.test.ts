import { describe, expect, it } from 'vitest';
import { CreateUnitSchema, UnitSchema } from '../unit';

describe('UnitSchema (full entity)', () => {
  const baseIds = { id: 'cm0apartment000000000000', buildingId: 'cm0building00000000000000' };

  it('accepts a valid APARTMENT with rooms + WOHN areaMetric', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'APARTMENT',
      number: '01',
      sizeSqm: 95,
      areaMetric: 'WOHN',
      meaShare: 110,
      rooms: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects APARTMENT missing required `rooms`', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'APARTMENT',
      number: '01',
      sizeSqm: 95,
      areaMetric: 'WOHN',
      meaShare: 110,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rooms'))).toBe(true);
    }
  });

  it('rejects APARTMENT with NUTZ areaMetric (literal mismatch on discriminated branch)', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'APARTMENT',
      number: '01',
      sizeSqm: 95,
      areaMetric: 'NUTZ',
      meaShare: 110,
      rooms: 3,
    });
    expect(result.success).toBe(false);
  });

  it('accepts PARKING without `rooms` and with NUTZ areaMetric', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'PARKING',
      number: 'TG-01',
      sizeSqm: 12.5,
      areaMetric: 'NUTZ',
      meaShare: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts GARDEN with GROUND areaMetric', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'GARDEN',
      number: '14',
      sizeSqm: 40,
      areaMetric: 'GROUND',
      meaShare: 20,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown unit type (discriminator out of union)', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'BASEMENT',
      number: '99',
      sizeSqm: 10,
      areaMetric: 'NUTZ',
      meaShare: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative meaShare', () => {
    const result = UnitSchema.safeParse({
      ...baseIds,
      type: 'PARKING',
      number: 'TG-01',
      sizeSqm: 12.5,
      areaMetric: 'NUTZ',
      meaShare: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateUnitSchema (without ids)', () => {
  it('accepts payload without id/buildingId', () => {
    const result = CreateUnitSchema.safeParse({
      type: 'APARTMENT',
      number: '01',
      sizeSqm: 95,
      areaMetric: 'WOHN',
      meaShare: 110,
      rooms: 3,
    });
    expect(result.success).toBe(true);
  });
});
