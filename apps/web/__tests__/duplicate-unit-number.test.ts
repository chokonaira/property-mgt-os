import { describe, expect, it } from 'vitest';
import { nextNumber } from '@/lib/duplicate-unit-number';

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
