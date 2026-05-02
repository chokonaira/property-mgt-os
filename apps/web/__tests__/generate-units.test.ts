import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAD_WIDTH,
  DEFAULT_PREFIX_BY_TYPE,
  GENERATE_MAX_COUNT,
  formatGeneratedNumber,
  generateUnits,
} from '@/lib/generate-units';

describe('generateUnits', () => {
  it('returns empty when count is zero', () => {
    expect(generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 0 })).toEqual({
      rows: [],
      skipped: 0,
    });
  });

  it('uses zero-padded numbers by default', () => {
    const { rows, skipped } = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 3 });
    expect(rows.map((r) => r.number)).toEqual(['01', '02', '03']);
    expect(skipped).toBe(0);
  });

  it('uses TG- prefix for PARKING by default (sample document case)', () => {
    const { rows } = generateUnits({ type: 'PARKING', buildingIndex: 0, count: 5 });
    expect(rows.map((r) => r.number)).toEqual(['TG-01', 'TG-02', 'TG-03', 'TG-04', 'TG-05']);
  });

  it('uses G- prefix for GARDEN, O- for OFFICE', () => {
    const garden = generateUnits({ type: 'GARDEN', buildingIndex: 0, count: 2 });
    const office = generateUnits({ type: 'OFFICE', buildingIndex: 0, count: 2 });
    expect(garden.rows.map((r) => r.number)).toEqual(['G-01', 'G-02']);
    expect(office.rows.map((r) => r.number)).toEqual(['O-01', 'O-02']);
  });

  it('respects an explicit prefix override', () => {
    const { rows } = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 2,
      prefix: 'WHG-',
    });
    expect(rows.map((r) => r.number)).toEqual(['WHG-01', 'WHG-02']);
  });

  it('starts numbering from startAt and pads to padWidth', () => {
    const { rows } = generateUnits({
      type: 'APARTMENT',
      buildingIndex: 0,
      count: 3,
      startAt: 9,
      padWidth: 3,
    });
    expect(rows.map((r) => r.number)).toEqual(['009', '010', '011']);
  });

  it('writes the buildingIndex on every row', () => {
    const { rows } = generateUnits({ type: 'APARTMENT', buildingIndex: 1, count: 2 });
    expect(rows.every((r) => r.buildingIndex === 1)).toBe(true);
  });

  it('applies template values when provided', () => {
    const { rows } = generateUnits({
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
    const { rows } = generateUnits({ type: 'APARTMENT', buildingIndex: 0, count: 1 });
    expect(rows[0]).not.toHaveProperty('sizeSqm');
    expect(rows[0]).not.toHaveProperty('meaShare');
    expect(rows[0]).not.toHaveProperty('rooms');
  });

  it('drops template.rooms for non-APARTMENT types', () => {
    const { rows } = generateUnits({
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

  // existingNumbers — auto-skip behavior so the form can't queue up
  // rows that would 409 on save. Each test asserts the generator
  // produced count fresh numbers and reports the skip count truthfully.
  describe('existingNumbers (skip-and-advance)', () => {
    it('skips a candidate that already exists in the same building', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['01']),
      );
      expect(rows.map((r) => r.number)).toEqual(['02', '03', '04']);
      expect(skipped).toBe(1);
    });

    it('advances past a contiguous block of existing numbers', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['01', '02', '03']),
      );
      expect(rows.map((r) => r.number)).toEqual(['04', '05', '06']);
      expect(skipped).toBe(3);
    });

    it('skips non-contiguous existing numbers (holes in the sequence)', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 3, startAt: 1 },
        new Set(['02', '04']),
      );
      expect(rows.map((r) => r.number)).toEqual(['01', '03', '05']);
      expect(skipped).toBe(2);
    });

    it('respects the prefix when comparing against existing numbers', () => {
      const { rows, skipped } = generateUnits(
        { type: 'PARKING', buildingIndex: 0, count: 2, startAt: 1 },
        new Set(['TG-01']),
      );
      expect(rows.map((r) => r.number)).toEqual(['TG-02', 'TG-03']);
      expect(skipped).toBe(1);
    });

    it('returns skipped=0 when no candidates collide', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 2, startAt: 5 },
        new Set(['01', '02']),
      );
      expect(rows.map((r) => r.number)).toEqual(['05', '06']);
      expect(skipped).toBe(0);
    });

    it('still produces count fresh rows when existingNumbers covers the entire start range', () => {
      const { rows, skipped } = generateUnits(
        { type: 'APARTMENT', buildingIndex: 0, count: 5, startAt: 1 },
        new Set(['01', '02', '03', '04', '05']),
      );
      expect(rows).toHaveLength(5);
      expect(rows.map((r) => r.number)).toEqual(['06', '07', '08', '09', '10']);
      expect(skipped).toBe(5);
    });
  });
});

describe('formatGeneratedNumber', () => {
  // Single source of truth for the dialog preview + the generator
  // output. If these ever diverge, both consumers break together
  // (which is what we want — fail loudly, not silently).

  it('zero-pads the sequence to padWidth', () => {
    expect(formatGeneratedNumber('', 1, 2)).toBe('01');
    expect(formatGeneratedNumber('', 9, 2)).toBe('09');
  });

  it('overflows pad width naturally', () => {
    expect(formatGeneratedNumber('TG-', 99, 2)).toBe('TG-99');
    expect(formatGeneratedNumber('TG-', 100, 2)).toBe('TG-100');
  });

  it('respects padWidth = 3', () => {
    expect(formatGeneratedNumber('WHG-', 1, 3)).toBe('WHG-001');
    expect(formatGeneratedNumber('WHG-', 99, 3)).toBe('WHG-099');
  });

  it('exports the documented default padWidth', () => {
    expect(DEFAULT_PAD_WIDTH).toBe(2);
  });

  it('agrees with the generator for the same input', () => {
    const { rows } = generateUnits({ type: 'PARKING', buildingIndex: 0, count: 5 });
    const previewLast = formatGeneratedNumber(
      DEFAULT_PREFIX_BY_TYPE.PARKING,
      5,
      DEFAULT_PAD_WIDTH,
    );
    expect(rows[rows.length - 1]?.number).toBe(previewLast);
  });
});
