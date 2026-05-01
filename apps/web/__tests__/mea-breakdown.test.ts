import { describe, expect, it } from 'vitest';
import { classifyMeaTone, computeMeaBreakdown } from '@/lib/mea-breakdown';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

const fallback = (idx: number) => `Building ${idx}`;

function buildings(...labels: Array<string | undefined>): WizardDraftInput['buildings'] {
  return labels.map((label) => ({
    street: 'X',
    houseNumber: '1',
    ...(label ? { label } : {}),
  }));
}

function unit(
  buildingIndex: number,
  meaShare: number | undefined,
): WizardDraftInput['units'][number] {
  return {
    type: 'APARTMENT',
    buildingIndex,
    number: '1',
    rooms: 3,
    sizeSqm: 80,
    ...(meaShare !== undefined ? { meaShare } : {}),
  } as unknown as WizardDraftInput['units'][number];
}

describe('computeMeaBreakdown', () => {
  it('rolls up shares per building', () => {
    const result = computeMeaBreakdown({
      buildings: buildings('Haus A', 'Haus B'),
      units: [unit(0, 200), unit(0, 300), unit(1, 400)],
      fallback,
    });
    expect(result.total).toBe(900);
    expect(result.rows).toEqual([
      { index: 0, label: 'Haus A', sum: 500 },
      { index: 1, label: 'Haus B', sum: 400 },
    ]);
  });

  it('treats missing meaShare as zero (no NaN propagation)', () => {
    const result = computeMeaBreakdown({
      buildings: buildings('Haus A'),
      units: [unit(0, 100), unit(0, undefined), unit(0, 200)],
      fallback,
    });
    expect(result.total).toBe(300);
    expect(result.rows[0]?.sum).toBe(300);
  });

  it('falls back to nickname then to the localiser when label is empty', () => {
    const result = computeMeaBreakdown({
      buildings: [
        { street: 'X', houseNumber: '1', label: '' as unknown as string, nickname: 'Park Side' },
        { street: 'Y', houseNumber: '2' },
      ],
      units: [],
      fallback,
    });
    expect(result.rows[0]?.label).toBe('Park Side');
    expect(result.rows[1]?.label).toBe('Building 2');
  });

  it('drops out-of-range buildingIndex from per-building rows but counts the share in the total', () => {
    const result = computeMeaBreakdown({
      buildings: buildings('Haus A'),
      units: [unit(0, 100), unit(99, 50)],
      fallback,
    });
    expect(result.total).toBe(150);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.sum).toBe(100);
  });
});

describe('classifyMeaTone', () => {
  it('returns matched when no total is declared', () => {
    expect(classifyMeaTone(900, undefined)).toBe('matched');
  });

  it('matches within 0.01 tolerance', () => {
    expect(classifyMeaTone(999.999, 1000)).toBe('matched');
    expect(classifyMeaTone(1000, 1000)).toBe('matched');
    expect(classifyMeaTone(1000.005, 1000)).toBe('matched');
  });

  it('flags short when sum < total', () => {
    expect(classifyMeaTone(900, 1000)).toBe('short');
    expect(classifyMeaTone(999.98, 1000)).toBe('short');
  });

  it('flags exceeded when sum > total', () => {
    expect(classifyMeaTone(1100, 1000)).toBe('exceeded');
    expect(classifyMeaTone(1000.05, 1000)).toBe('exceeded');
  });
});
