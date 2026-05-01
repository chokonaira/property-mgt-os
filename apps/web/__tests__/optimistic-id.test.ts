import { describe, expect, it } from 'vitest';
import { isOptimisticId, OPTIMISTIC_PROPERTY_PREFIX } from '@/lib/optimistic-id';

describe('isOptimisticId', () => {
  it('returns true for tmp_-prefixed ids (mutation cache placeholder)', () => {
    expect(isOptimisticId(`${OPTIMISTIC_PROPERTY_PREFIX}1234567890`)).toBe(true);
    expect(isOptimisticId('tmp_abc')).toBe(true);
  });

  it('returns false for real cuid-shaped server ids', () => {
    expect(isOptimisticId('cmomwmrcr00013820nphivvsf')).toBe(false);
    expect(isOptimisticId('cuid_v1_xxx')).toBe(false);
  });

  it('returns false for empty / unrelated strings', () => {
    expect(isOptimisticId('')).toBe(false);
    expect(isOptimisticId('temporary')).toBe(false);
    expect(isOptimisticId('TMP_xxx')).toBe(false);
  });

  it('exports a stable prefix the rest of the app can pattern-match against', () => {
    expect(OPTIMISTIC_PROPERTY_PREFIX).toBe('tmp_');
  });
});
