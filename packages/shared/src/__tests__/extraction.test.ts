import { describe, expect, it } from 'vitest';
import {
  ExtractionResultSchema,
  ExtractionRunResponseSchema,
  WarningCodeSchema,
  WarningSchema,
} from '../extraction';

describe('WarningSchema', () => {
  it('accepts every documented code', () => {
    const codes = ['MEA_MISMATCH', 'MISSING_FIELD', 'UNRECOGNIZED_TYPE', 'AMBIGUOUS_VALUE'];
    for (const code of codes) {
      expect(WarningCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('rejects unknown warning codes', () => {
    expect(WarningCodeSchema.safeParse('TYPO').success).toBe(false);
  });

  it('round-trips a complete warning', () => {
    const parsed = WarningSchema.parse({
      code: 'MEA_MISMATCH',
      message: 'sums to 900',
      fields: ['property.totalMea'],
    });
    expect(parsed.code).toBe('MEA_MISMATCH');
    expect(parsed.fields).toEqual(['property.totalMea']);
  });

  it('rejects a warning with a wrong-typed fields property', () => {
    const result = WarningSchema.safeParse({
      code: 'MEA_MISMATCH',
      message: 'x',
      fields: 'property.totalMea',
    });
    expect(result.success).toBe(false);
  });
});

describe('shared WarningSchema reuse', () => {
  it('ExtractionResult.warnings accepts the WarningSchema shape', () => {
    const parsed = ExtractionResultSchema.parse({
      property: { name: 'X', managementType: 'WEG' },
      buildings: [{ label: 'A', street: 'X', houseNumber: '1' }],
      units: [],
      warnings: [{ code: 'MEA_MISMATCH', message: 'x', fields: [] }],
    });
    expect(parsed.warnings).toHaveLength(1);
  });

  it('ExtractionRunResponse.warnings rejects an unknown code', () => {
    const result = ExtractionRunResponseSchema.safeParse({
      runId: 'r1',
      extraction: {
        property: { name: 'X', managementType: 'WEG' },
        buildings: [{ label: 'A', street: 'X', houseNumber: '1' }],
        units: [],
        contacts: [],
        confidenceByField: {},
        sourceSpansByField: {},
        warnings: [],
      },
      warnings: [{ code: 'TYPO', message: 'x', fields: [] }],
      confidence: 0.9,
      durationMs: 4500,
      cached: false,
    });
    expect(result.success).toBe(false);
  });
});
