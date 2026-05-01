import { describe, expect, it } from 'vitest';
import {
  classifyConfidence,
  CONFIDENCE_HIGH,
  CONFIDENCE_MEDIUM,
  tierForField,
} from '@/lib/confidence-tier';

describe('classifyConfidence', () => {
  it('classifies ≥ 0.85 as high', () => {
    expect(classifyConfidence(1)).toBe('high');
    expect(classifyConfidence(CONFIDENCE_HIGH)).toBe('high');
    expect(classifyConfidence(0.9)).toBe('high');
  });

  it('classifies 0.6 ≤ x < 0.85 as medium', () => {
    expect(classifyConfidence(CONFIDENCE_MEDIUM)).toBe('medium');
    expect(classifyConfidence(0.7)).toBe('medium');
    expect(classifyConfidence(0.849)).toBe('medium');
  });

  it('classifies < 0.6 as low', () => {
    expect(classifyConfidence(0)).toBe('low');
    expect(classifyConfidence(0.59)).toBe('low');
    expect(classifyConfidence(-0.1)).toBe('low');
  });

  it('treats non-finite scores as low', () => {
    expect(classifyConfidence(Number.NaN)).toBe('low');
    expect(classifyConfidence(Number.POSITIVE_INFINITY)).toBe('low');
    expect(classifyConfidence(Number.NEGATIVE_INFINITY)).toBe('low');
  });
});

describe('tierForField', () => {
  it('returns unverified when score is missing', () => {
    expect(tierForField(undefined, true)).toBe('unverified');
  });

  it('returns unverified when verification dropped the span', () => {
    expect(tierForField(0.95, false)).toBe('unverified');
  });

  it('falls back to the numeric tier when verified', () => {
    expect(tierForField(0.95, true)).toBe('high');
    expect(tierForField(0.7, true)).toBe('medium');
    expect(tierForField(0.4, true)).toBe('low');
  });
});
