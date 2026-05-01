import { describe, expect, it } from 'vitest';
import type { Floor, Unit } from '@buena/shared';
import { evaluateMea, formatFloor, formatNumber, formatSqm, sumMea } from '@/lib/format';

describe('formatFloor', () => {
  it('returns the placeholder for undefined', () => {
    expect(formatFloor(undefined)).toBe('—');
    expect(formatFloor(undefined, '')).toBe('');
  });

  it('handles ground / top floors', () => {
    expect(formatFloor({ kind: 'EG' } satisfies Floor)).toBe('EG');
    expect(formatFloor({ kind: 'DG' } satisfies Floor)).toBe('DG');
  });

  it('formats numbered floors', () => {
    expect(formatFloor({ kind: 'OG', level: 3 } satisfies Floor)).toBe('OG 3');
    expect(formatFloor({ kind: 'UG', level: 1 } satisfies Floor)).toBe('UG 1');
  });

  it('appends an OG qualifier when provided (panel + form must agree)', () => {
    expect(formatFloor({ kind: 'OG', level: 2, qualifier: 'links' } satisfies Floor)).toBe(
      'OG 2 links',
    );
  });

  it('formats Staffel with optional qualifier', () => {
    expect(formatFloor({ kind: 'STAFFEL' } satisfies Floor)).toBe('Staffel');
    expect(formatFloor({ kind: 'STAFFEL', qualifier: 'A' } satisfies Floor)).toBe('Staffel A');
  });
});

describe('formatNumber', () => {
  it('uses comma decimal for de', () => {
    expect(formatNumber(1234.5, 'de')).toBe('1.234,5');
  });

  it('uses period decimal for en', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('falls back to en for unknown locale', () => {
    expect(formatNumber(10, 'fr')).toBe('10.0');
  });
});

describe('formatSqm', () => {
  it('returns "—" when value is undefined', () => {
    expect(formatSqm(undefined, 'de')).toBe('—');
  });

  it('appends unit suffix in either locale', () => {
    expect(formatSqm(75, 'de')).toBe('75,0 m²');
    expect(formatSqm(75, 'en')).toBe('75.0 m²');
  });
});

describe('sumMea', () => {
  function unit(meaShare: number): Unit {
    return {
      id: 'u',
      buildingId: 'b',
      number: '1',
      meaShare,
      type: 'APARTMENT',
      areaMetric: 'WOHN',
    } as Unit;
  }

  it('returns 0 for empty list', () => {
    expect(sumMea([])).toBe(0);
  });

  it('sums meaShare across units', () => {
    expect(sumMea([unit(100), unit(250.5), unit(49.5)])).toBe(400);
  });
});

describe('evaluateMea', () => {
  it('treats undefined total as the sum (always balanced)', () => {
    expect(evaluateMea(900, undefined)).toMatchObject({
      matches: true,
      delta: 0,
      ratio: 1,
      expected: 900,
    });
  });

  it('matches when sum equals total within tolerance', () => {
    expect(evaluateMea(999.99, 1000).matches).toBe(true);
    expect(evaluateMea(1000.01, 1000).matches).toBe(true);
  });

  it('flags mismatch when sum is short of total', () => {
    const status = evaluateMea(900, 1000);
    expect(status.matches).toBe(false);
    expect(status.delta).toBeCloseTo(100);
    expect(status.ratio).toBeCloseTo(0.9);
  });

  it('flags mismatch for non-zero sum against zero total', () => {
    expect(evaluateMea(900, 0)).toMatchObject({ matches: false, ratio: 0 });
  });

  it('treats sum=0 against total=0 as balanced', () => {
    expect(evaluateMea(0, 0).matches).toBe(true);
  });
});
