import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFIX_BY_TYPE,
  GENERATE_MAX_COUNT,
  generateUnits,
} from '@/lib/generate-units';

describe('generateUnits', () => {
  it('returns empty when count is zero', () => {
    expect(generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 0 })).toEqual([]);
  });

  it('uses zero-padded numbers by default', () => {
    const rows = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 3 });
    expect(rows.map((r) => r.number)).toEqual(['01', '02', '03']);
  });

  it('uses TG- prefix for PARKING by default (sample document case)', () => {
    const rows = generateUnits({ type: 'PARKING', buildingIndex: 0, count: 5 });
    expect(rows.map((r) => r.number)).toEqual(['TG-01', 'TG-02', 'TG-03', 'TG-04', 'TG-05']);
  });

  it('uses G- prefix for GARDEN, O- for OFFICE', () => {
    const garden = generateUnits({ type: 'GARDEN', buildingIndex: 0, count: 2 });
    const office = generateUnits({ type: 'OFFICE', buildingIndex: 0, count: 2 });
    expect(garden.map((r) => r.number)).toEqual(['G-01', 'G-02']);
    expect(office.map((r) => r.number)).toEqual(['O-01', 'O-02']);
  });

  it('respects an explicit prefix override', () => {
    const rows = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 2,
      prefix: 'WHG-',
    });
    expect(rows.map((r) => r.number)).toEqual(['WHG-01', 'WHG-02']);
  });

  it('starts numbering from startAt and pads to padWidth', () => {
    const rows = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 3,
      startAt: 9,
      padWidth: 3,
    });
    expect(rows.map((r) => r.number)).toEqual(['009', '010', '011']);
  });

  it('writes the buildingIndex on every row', () => {
    const rows = generateUnits({ type: 'APARTMENT', buildingIndex: 1, count: 2 });
    expect(rows.every((r) => r.buildingIndex === 1)).toBe(true);
  });

  it('applies template values when provided', () => {
    const rows = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 2,
      template: { sizeSqm: 80, meaShare: 250, rooms: 3 },
    });
    for (const row of rows) {
      expect(row).toMatchObject({ sizeSqm: 80, meaShare: 250, rooms: 3 });
    }
  });

  it('omits template fields when not supplied (schema fails inline at the form layer)', () => {
    const rows = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 1 });
    expect(rows[0]).not.toHaveProperty('sizeSqm');
    expect(rows[0]).not.toHaveProperty('meaShare');
    expect(rows[0]).not.toHaveProperty('rooms');
  });

  it('drops template.rooms for non-APARTMENT types', () => {
    const rows = generateUnits({
      type: 'PARKING',
      buildingIndex: 0,
      count: 1,
      template: { rooms: 99 },
    });
    expect(rows[0]).not.toHaveProperty('rooms');
  });

  it('exports the documented default prefixes', () => {
    expect(DEFAULT_PREFIX_BY_TYPE).toEqual({
      APARTMENT: '',
      OFFICE: 'O-',
      PARKING: 'TG-',
      GARDEN: 'G-',
    });
  });

  it('exports a sane upper bound', () => {
    expect(GENERATE_MAX_COUNT).toBeGreaterThanOrEqual(100);
  });
});
