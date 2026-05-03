import { describe, expect, it } from 'vitest';
import { findNextAvailableNumber, nextNumber } from '@/lib/duplicate-unit-number';

describe('nextNumber', () => {
  it('returns empty when input is empty', () => {
    expect(nextNumber('')).toBe('');
  });

  it('preserves zero-padding width', () => {
    expect(nextNumber('01')).toBe('02');
    expect(nextNumber('09')).toBe('10');
    expect(nextNumber('099')).toBe('100');
  });

  it('handles a fixed prefix + integer suffix', () => {
    expect(nextNumber('TG-01')).toBe('TG-02');
    expect(nextNumber('WHG-12')).toBe('WHG-13');
    expect(nextNumber('G-09')).toBe('G-10');
  });

  it('overflows the pad width naturally (09 → 10, not 010)', () => {
    expect(nextNumber('TG-09')).toBe('TG-10');
    expect(nextNumber('99')).toBe('100');
  });

  it('increments the LAST integer in dotted numbers', () => {
    expect(nextNumber('1.1')).toBe('1.2');
    expect(nextNumber('2.09')).toBe('2.10');
  });

  it('falls back to "(copy)" when there is no digit tail', () => {
    expect(nextNumber('Hobbygarten')).toBe('Hobbygarten (copy)');
    expect(nextNumber('A')).toBe('A (copy)');
  });

  it('preserves trailing non-digit suffix after the integer', () => {
    expect(nextNumber('Unit-12-EG')).toBe('Unit-13-EG');
  });

  it('trims surrounding whitespace before increment', () => {
    expect(nextNumber('  TG-01  ')).toBe('TG-02');
  });
});

// findNextAvailableNumber — the row-Duplicate code path. Single +
// bulk duplicate both call this so a click can never produce a
// number that immediately collides with another row in the same
// building. Tests cover the realistic scenarios: empty building,
// single collision, dense block, mixed prefixes, and the safety
// bound that protects the UI from a pathological taken-set.
describe('findNextAvailableNumber', () => {
  it('returns nextNumber when the seed has no collisions', () => {
    expect(findNextAvailableNumber('01', new Set())).toBe('02');
    expect(findNextAvailableNumber('01', new Set(['09']))).toBe('02');
    expect(findNextAvailableNumber('01', undefined)).toBe('02');
  });

  it('skips a single collision', () => {
    expect(findNextAvailableNumber('01', new Set(['02']))).toBe('03');
  });

  it('advances past a dense block of taken numbers', () => {
    const taken = new Set(['02', '03', '04', '05']);
    expect(findNextAvailableNumber('01', taken)).toBe('06');
  });

  it('preserves prefix while advancing (TG-01 → TG-04 past TG-02..TG-03)', () => {
    expect(findNextAvailableNumber('TG-01', new Set(['TG-02', 'TG-03']))).toBe('TG-04');
  });

  it('does not skip numbers from a different prefix in the same set', () => {
    // The duplicate-detector keys on the literal string, so "01"
    // and "TG-01" are independent. The helper trusts the caller's
    // taken-set and only checks string equality.
    expect(findNextAvailableNumber('TG-01', new Set(['01', '02']))).toBe('TG-02');
  });

  it('keeps appending "(copy)" suffixes when the seed has no digit tail', () => {
    expect(
      findNextAvailableNumber('Hobby', new Set(['Hobby (copy)'])),
    ).toBe('Hobby (copy) (copy)');
  });

  it('returns the last-tried candidate even if it still collides (safety bound)', () => {
    // Construct a taken-set covering 02..2000 to exhaust the loop.
    // The helper still terminates and returns *something* — the
    // duplicate-detector will paint that row red so the user can
    // fix it manually rather than the UI hanging.
    const taken = new Set<string>();
    for (let i = 2; i <= 2000; i += 1) taken.add(String(i).padStart(2, '0'));
    const result = findNextAvailableNumber('01', taken);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles bulk duplication: caller seeds taken with each new number', () => {
    // Mirrors how unit-table.tsx uses the helper inside duplicateSelected:
    // each minted number is added to the running set so the next
    // call advances past it. Five rows seeded "01" → 02..06.
    const taken = new Set<string>(['01']);
    const minted: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const n = findNextAvailableNumber('01', taken);
      taken.add(n);
      minted.push(n);
    }
    expect(minted).toEqual(['02', '03', '04', '05', '06']);
  });
});
