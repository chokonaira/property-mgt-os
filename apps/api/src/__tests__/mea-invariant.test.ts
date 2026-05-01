import { describe, expect, it } from 'vitest';
import type { ExtractionResult } from '@buena/shared';
import { computeMeaInvariant, ensureMeaWarning } from '../modules/extraction/lib/mea-invariant';

function base(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    property: { name: 'Test', managementType: 'WEG', totalMea: 1000 },
    buildings: [{ label: 'Haus A', street: 'Hauptstr.', houseNumber: '1' }],
    units: [],
    contacts: [],
    confidenceByField: {},
    sourceSpansByField: {},
    warnings: [],
    ...overrides,
  };
}

describe('computeMeaInvariant', () => {
  it('matches when sum equals total within 0.01 tolerance', () => {
    const result = base({
      units: [
        {
          type: 'APARTMENT',
          number: '1',
          buildingLabel: 'Haus A',
          meaShare: 999.999,
        },
      ],
    });
    const outcome = computeMeaInvariant(result);
    expect(outcome.matches).toBe(true);
  });

  it('flags mismatch outside tolerance', () => {
    const result = base({
      units: [{ type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', meaShare: 900 }],
    });
    const outcome = computeMeaInvariant(result);
    expect(outcome.matches).toBe(false);
    expect(outcome.delta).toBeCloseTo(100, 4);
  });

  it('treats missing totalMea as a non-mismatch', () => {
    const result = base({
      property: { name: 'X', managementType: 'WEG' },
      units: [{ type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', meaShare: 250 }],
    });
    const outcome = computeMeaInvariant(result);
    expect(outcome.matches).toBe(true);
  });

  it('treats missing meaShare on a unit as 0', () => {
    const result = base({
      units: [
        {
          type: 'APARTMENT',
          number: '1',
          buildingLabel: 'Haus A',
        },
      ],
    });
    const outcome = computeMeaInvariant(result);
    expect(outcome.sum).toBe(0);
    expect(outcome.delta).toBe(1000);
  });
});

describe('ensureMeaWarning', () => {
  it('adds a MEA_MISMATCH warning when shares are short of total', () => {
    const result = base({
      units: [{ type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', meaShare: 900 }],
    });
    const next = ensureMeaWarning(result);
    const warning = next.warnings.find((w) => w.code === 'MEA_MISMATCH');
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('900');
    expect(warning?.message).toContain('1000');
    expect(warning?.fields).toContain('property.totalMea');
  });

  it('does not add a duplicate warning when the model already emitted one', () => {
    const result = base({
      units: [{ type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', meaShare: 900 }],
      warnings: [
        {
          code: 'MEA_MISMATCH',
          message: 'Already flagged.',
          fields: ['property.totalMea'],
        },
      ],
    });
    const next = ensureMeaWarning(result);
    const meaWarnings = next.warnings.filter((w) => w.code === 'MEA_MISMATCH');
    expect(meaWarnings).toHaveLength(1);
    expect(meaWarnings[0]?.message).toBe('Already flagged.');
  });

  it('returns the input unchanged when shares match the total', () => {
    const result = base({
      units: [{ type: 'APARTMENT', number: '1', buildingLabel: 'Haus A', meaShare: 1000 }],
    });
    const next = ensureMeaWarning(result);
    expect(next.warnings).toEqual([]);
  });
});
