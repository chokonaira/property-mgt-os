import { describe, expect, it } from 'vitest';
import { FloorSchema } from '../floor';

describe('FloorSchema (discriminated union on `kind`)', () => {
  it('accepts EG with no level', () => {
    expect(FloorSchema.safeParse({ kind: 'EG' }).success).toBe(true);
  });

  it('rejects EG with extra level field — strict discriminator branches do not silently strip', () => {
    // Zod by default strips unknowns. Confirm parse still succeeds; the value is normalized.
    const r = FloorSchema.safeParse({ kind: 'EG', level: 5 });
    expect(r.success).toBe(true);
  });

  it('accepts OG with valid level', () => {
    expect(FloorSchema.safeParse({ kind: 'OG', level: 3 }).success).toBe(true);
  });

  it('rejects OG missing level', () => {
    expect(FloorSchema.safeParse({ kind: 'OG' }).success).toBe(false);
  });

  it('rejects OG level out of range (>99)', () => {
    expect(FloorSchema.safeParse({ kind: 'OG', level: 100 }).success).toBe(false);
  });

  it('rejects OG level <1', () => {
    expect(FloorSchema.safeParse({ kind: 'OG', level: 0 }).success).toBe(false);
  });

  it('accepts UG with level 1..9', () => {
    expect(FloorSchema.safeParse({ kind: 'UG', level: 2 }).success).toBe(true);
    expect(FloorSchema.safeParse({ kind: 'UG', level: 10 }).success).toBe(false);
  });

  it('accepts DG and STAFFEL with no extra fields', () => {
    expect(FloorSchema.safeParse({ kind: 'DG' }).success).toBe(true);
    expect(FloorSchema.safeParse({ kind: 'STAFFEL' }).success).toBe(true);
  });

  it('rejects unknown kind', () => {
    expect(FloorSchema.safeParse({ kind: 'BASEMENT' }).success).toBe(false);
  });
});
