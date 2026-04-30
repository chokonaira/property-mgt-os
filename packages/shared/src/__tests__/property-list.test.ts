import { describe, expect, it } from 'vitest';
import { PropertyListQuerySchema, PropertyListResponseSchema } from '../property-list';

describe('PropertyListQuerySchema', () => {
  it('applies defaults when query is empty', () => {
    const result = PropertyListQuerySchema.parse({});
    expect(result).toEqual({ take: 50, skip: 0 });
  });

  it('coerces stringified numbers from query strings', () => {
    const result = PropertyListQuerySchema.parse({ take: '10', skip: '20' });
    expect(result.take).toBe(10);
    expect(result.skip).toBe(20);
  });

  it('caps take at 100', () => {
    expect(PropertyListQuerySchema.safeParse({ take: 101 }).success).toBe(false);
  });

  it('rejects negative skip', () => {
    expect(PropertyListQuerySchema.safeParse({ skip: -1 }).success).toBe(false);
  });

  it('keeps uniqueNumber as a non-empty string when supplied', () => {
    const result = PropertyListQuerySchema.parse({ uniqueNumber: '10-557-PRB' });
    expect(result.uniqueNumber).toBe('10-557-PRB');
    expect(PropertyListQuerySchema.safeParse({ uniqueNumber: '' }).success).toBe(false);
  });
});

describe('PropertyListResponseSchema', () => {
  it('accepts an empty envelope', () => {
    const result = PropertyListResponseSchema.safeParse({
      items: [],
      total: 0,
      take: 50,
      skip: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an envelope missing total', () => {
    expect(PropertyListResponseSchema.safeParse({ items: [], take: 50, skip: 0 }).success).toBe(
      false,
    );
  });
});
