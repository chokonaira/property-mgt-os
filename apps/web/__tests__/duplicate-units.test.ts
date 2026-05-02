import { describe, expect, it } from 'vitest';
import { findAllDuplicateUnitRows } from '@/lib/duplicate-units';
import type { WizardDraftInput } from '@/lib/schemas/wizard-draft';

const buildings: WizardDraftInput['buildings'] = [
  { street: 'Musterstr.', houseNumber: '1', label: 'Haus A' },
  { street: 'Musterstr.', houseNumber: '2', nickname: 'Side wing' },
];

const apt = (overrides: Partial<WizardDraftInput['units'][number]> = {}) =>
  ({
    type: 'APARTMENT',
    buildingIndex: 0,
    number: '01',
    meaShare: 100,
    sizeSqm: 70,
    rooms: 2,
    ...overrides,
  }) as WizardDraftInput['units'][number];

describe('findAllDuplicateUnitRows', () => {
  it('returns an empty map when units is empty or undefined', () => {
    expect(findAllDuplicateUnitRows([], buildings).size).toBe(0);
    expect(findAllDuplicateUnitRows(undefined, buildings).size).toBe(0);
  });

  it('returns an empty map when every (building, number) pair is unique', () => {
    const result = findAllDuplicateUnitRows(
      [apt({ number: '01' }), apt({ number: '02' }), apt({ number: '03' })],
      buildings,
    );
    expect(result.size).toBe(0);
  });

  it('flags the SECOND occurrence, not the first', () => {
    const result = findAllDuplicateUnitRows(
      [apt({ number: '01' }), apt({ number: '02' }), apt({ number: '01' })],
      buildings,
    );
    expect(result.has(0)).toBe(false);
    expect(result.has(2)).toBe(true);
    expect(result.get(2)).toEqual({
      duplicateOf: 0,
      number: '01',
      buildingLabel: 'Haus A',
    });
  });

  it('flags every duplicate when a number appears more than twice', () => {
    const result = findAllDuplicateUnitRows(
      [apt({ number: '01' }), apt({ number: '01' }), apt({ number: '01' })],
      buildings,
    );
    expect([...result.keys()]).toEqual([1, 2]);
    // both point at row 0 as the original
    expect(result.get(1)?.duplicateOf).toBe(0);
    expect(result.get(2)?.duplicateOf).toBe(0);
  });

  it('treats the same number across different buildings as unique', () => {
    const result = findAllDuplicateUnitRows(
      [
        apt({ buildingIndex: 0, number: '01' }),
        apt({ buildingIndex: 1, number: '01' }),
      ],
      buildings,
    );
    expect(result.size).toBe(0);
  });

  it('uses the building label, falling back to nickname / "Building N"', () => {
    const noLabelBuildings: WizardDraftInput['buildings'] = [{ street: '', houseNumber: '' }];
    const result = findAllDuplicateUnitRows(
      [apt({ buildingIndex: 0, number: '7' }), apt({ buildingIndex: 0, number: '7' })],
      noLabelBuildings,
    );
    expect(result.get(1)?.buildingLabel).toBe('Building 1');
  });

  it('skips empty / whitespace-only numbers', () => {
    const result = findAllDuplicateUnitRows(
      [apt({ number: '' }), apt({ number: '   ' }), apt({ number: '   ' })],
      buildings,
    );
    expect(result.size).toBe(0);
  });

  it('treats trimmed numbers consistently — "  01  " and "01" duplicate', () => {
    const result = findAllDuplicateUnitRows(
      [apt({ number: '01' }), apt({ number: '  01  ' })],
      buildings,
    );
    expect(result.has(1)).toBe(true);
    expect(result.get(1)?.number).toBe('01');
  });

  it('handles many rows efficiently (single-pass linear)', () => {
    const rows: WizardDraftInput['units'] = [];
    for (let i = 0; i < 200; i += 1) {
      rows.push(apt({ number: `unit-${i}` }));
    }
    rows.push(apt({ number: 'unit-50' })); // duplicate at end
    const result = findAllDuplicateUnitRows(rows, buildings);
    expect(result.size).toBe(1);
    expect(result.has(200)).toBe(true);
    expect(result.get(200)?.duplicateOf).toBe(50);
  });
});
